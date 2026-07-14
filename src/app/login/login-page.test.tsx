import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LoginPage, { repoFromCallbackUrl, safeCallbackUrl } from "./page";

vi.mock("@/lib/auth-config", () => ({
  auth: vi.fn().mockResolvedValue(null),
  signIn: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

describe("login callback handling", () => {
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
    expect(repoFromCallbackUrl("/app?repo=acme%2Fapi")).toBe("acme/api");
    expect(repoFromCallbackUrl("/app?repo=https%3A%2F%2Fevil.example")).toBeNull();
  });

  it("shows the preserved repository context", async () => {
    const page = await LoginPage({
      searchParams: Promise.resolve({ callbackUrl: "/app?repo=acme%2Fapi" }),
    });
    render(page);

    expect(screen.getByText("Repository ready: acme/api")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with GitHub" })).toBeInTheDocument();
  });
});
