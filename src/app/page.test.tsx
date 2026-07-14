import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import LandingPage from "./page";
import { normalizePublicGitHubRepository } from "@/components/public/RepositoryIntentForm";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

vi.mock("@/lib/github-stars", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/github-stars")>();
  return { ...actual, getGitHubStarCount: vi.fn().mockResolvedValue(128) };
});

async function renderLandingPage() {
  render(await LandingPage());
}

describe("LandingPage", () => {
  it("leads with the launch promise and a repository action", async () => {
    await renderLandingPage();

    expect(
      screen.getByRole("heading", { name: "See how your codebase fits together." })
    ).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText("github.com/owner/repo")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Map this repository" })).toHaveLength(2);
    expect(
      screen.getByText("Free to use · AI features use your Anthropic API key")
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /pricing|plans/i })).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Star StackHatch on GitHub — 128 stars/i })
    ).toHaveAttribute("href", "https://github.com/mwmdev/stackhatch");
  });

  it("shows the real self-map fallback and links to the full public demo", async () => {
    await renderLandingPage();

    expect(
      screen.getByRole("heading", { name: "StackHatch, mapped by StackHatch." })
    ).toBeInTheDocument();
    expect(screen.getByText(/mwmdev\/stackhatch · mapped from 5d05e8a/)).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Read-only StackHatch architecture map/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explore the full map" })).toHaveAttribute(
      "href",
      "/demo"
    );
  });

  it("presents map, ask, compare, and re-scan as one ordered workflow", async () => {
    await renderLandingPage();

    expect(screen.getByRole("heading", { name: "Map the system." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ask in context." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Test another direction." })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Re-scan when the code changes." })
    ).toBeInTheDocument();
  });

  it("validates and preserves repository intent through sign-in", async () => {
    await renderLandingPage();

    const input = screen.getAllByPlaceholderText("github.com/owner/repo")[0];
    const submit = screen.getAllByRole("button", { name: "Map this repository" })[0];

    fireEvent.change(input, { target: { value: "https://github.com/mwmdev/stackhatch.git" } });
    fireEvent.click(submit);

    expect(push).toHaveBeenCalledWith("/login?callbackUrl=%2Fapp%3Frepo%3Dmwmdev%252Fstackhatch");

    fireEvent.change(input, { target: { value: "https://gitlab.com/mwmdev/stackhatch" } });
    fireEvent.click(submit);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a public GitHub repository as github.com/owner/repo or owner/repo."
    );
  });
});

describe("normalizePublicGitHubRepository", () => {
  it.each([
    ["mwmdev/stackhatch", "mwmdev/stackhatch"],
    ["github.com/mwmdev/stackhatch", "mwmdev/stackhatch"],
    ["https://github.com/mwmdev/stackhatch.git", "mwmdev/stackhatch"],
    ["http://github.com/mwmdev/stackhatch/", "mwmdev/stackhatch"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizePublicGitHubRepository(input)).toBe(expected);
  });

  it.each([
    "",
    "github.com/mwmdev/stackhatch/issues",
    "https://gitlab.com/mwmdev/stackhatch",
    "not a repository",
  ])("rejects %s", (input) => {
    expect(normalizePublicGitHubRepository(input)).toBeNull();
  });
});
