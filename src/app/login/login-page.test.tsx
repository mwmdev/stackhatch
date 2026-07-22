import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LoginPage, { repoFromCallbackUrl, safeCallbackUrl } from "./page";

const mocks = vi.hoisted(() => ({
  authenticatedUser: null as { userId: string; githubId: string } | null,
}));

vi.mock("@/lib/auth-config", () => ({ signIn: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn(() => Promise.resolve(mocks.authenticatedUser)),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

describe("login callback handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticatedUser = null;
  });

  it("does not redirect an orphaned or database-unavailable cached session", async () => {
    mocks.authenticatedUser = null;
    await LoginPage({ searchParams: Promise.resolve({ callbackUrl: "/app" }) });
    const { redirect } = await import("next/navigation");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects only a current database-backed identity", async () => {
    mocks.authenticatedUser = { userId: "user-1", githubId: "github-1" };
    await LoginPage({ searchParams: Promise.resolve({ callbackUrl: "/app" }) });
    const { redirect } = await import("next/navigation");
    expect(redirect).toHaveBeenCalledWith("/app");
  });
  it("accepts internal and same-origin callbacks", () => {
    expect(safeCallbackUrl("/app?repo=acme%2Fapi", "https://stackhatch.io")).toBe(
      "/app?repo=acme%2Fapi"
    );
    expect(
      safeCallbackUrl("https://stackhatch.io/app?repo=acme%2Fapi", "https://stackhatch.io")
    ).toBe("/app?repo=acme%2Fapi");
  });

  it("rejects external and protocol-relative callbacks", () => {
    expect(safeCallbackUrl("https://example.com/app", "https://stackhatch.io")).toBe("/app");
    expect(safeCallbackUrl("//example.com/app", "https://stackhatch.io")).toBe("/app");
  });

  it("extracts only a safe owner/repo slug", () => {
    expect(repoFromCallbackUrl("/project/new?mode=repository&repo=acme%2Fapi")).toBe("acme/api");
    expect(
      repoFromCallbackUrl("/project/new?mode=repository&repo=https%3A%2F%2Fevil.example")
    ).toBeNull();
  });

  it("shows the preserved repository context", async () => {
    const page = await LoginPage({
      searchParams: Promise.resolve({ callbackUrl: "/app?repo=acme%2Fapi#start" }),
    });
    render(page);

    expect(screen.getByText("Repository ready: acme/api")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with GitHub" })).toBeInTheDocument();
    expect(screen.getByText("Account access")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Repository ready: acme/api" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "StackHatch home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: /^Theme:/ })).toBeInTheDocument();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByDisplayValue("/project/new?mode=repository&repo=acme%2Fapi")
    ).toHaveAttribute("name", "callbackUrl");
    expect(screen.getByText(/does not grant access to private repositories/)).toBeInTheDocument();
  });

  it("shows repository context from the canonical project start callback", async () => {
    const page = await LoginPage({
      searchParams: Promise.resolve({
        callbackUrl: "/project/new?mode=repository&repo=acme%2Fapi",
      }),
    });
    render(page);

    expect(screen.getByText("Repository ready: acme/api")).toBeInTheDocument();
  });

  it.each([
    ["blank", "/project/new?mode=blank", "Blank canvas ready"],
    ["requirements", "/project/new?mode=requirements", "Requirements upload ready"],
    ["template", "/project/new?mode=template", "Template selection ready"],
  ])("confirms the preserved %s start", async (_method, callbackUrl, title) => {
    const page = await LoginPage({ searchParams: Promise.resolve({ callbackUrl }) });
    render(page);

    expect(screen.getByText(title)).toBeInTheDocument();
  });
});
