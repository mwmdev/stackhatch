import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LandingPage from "./page";

vi.mock("next/font/google", () => ({
  Outfit: () => ({ variable: "font-outfit" }),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

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
  it("leads with the product outcome before the four ways to start", async () => {
    await renderLandingPage();

    const heroHeading = screen.getByRole("heading", {
      level: 1,
      name: "Keep the whole system in view.",
    });
    const hero = heroHeading.closest("section");
    const launchpad = screen.getByRole("group", { name: "Ways to start a StackHatch map" });

    expect(hero).not.toBeNull();
    expect(hero).toHaveTextContent(
      "StackHatch turns repositories and requirements into interactive architecture maps"
    );
    expect(within(hero!).getByRole("link", { name: "Choose how to start" })).toHaveAttribute(
      "href",
      "#start"
    );
    expect(within(hero!).getByRole("link", { name: "See StackHatch in action" })).toHaveAttribute(
      "href",
      "#features"
    );
    expect(
      within(hero!).getByRole("img", { name: /architecture map of its own/i })
    ).toHaveAttribute("src", "/screenshots/architecture-overview.webp");
    expect(
      hero!.compareDocumentPosition(launchpad) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    const startHeading = screen.getByRole("heading", {
      level: 2,
      name: "Start from wherever you are.",
    });
    const startSection = startHeading.closest("section");
    expect(startSection).not.toBeNull();
    expect(startSection).toContainElement(launchpad);
    for (const name of ["Start fresh", "Upload requirements", "Map a repo", "Use a template"]) {
      expect(within(launchpad).getByRole("heading", { level: 3, name })).toBeInTheDocument();
    }
    expect(screen.getByText("One architecture map")).toBeInTheDocument();
  });

  it("uses only the three real product screenshots throughout the experience", async () => {
    await renderLandingPage();

    expect(
      screen.getByRole("heading", { name: "See the system. Ask why. Keep it current." })
    ).toBeInTheDocument();
    const screenshots = screen
      .getAllByRole("img")
      .filter((image) => image.getAttribute("src")?.startsWith("/screenshots/"));
    const screenshotSources = screenshots.map((image) => image.getAttribute("src"));

    expect(screen.getByRole("img", { name: /architecture map of its own/i })).toHaveAttribute(
      "src",
      "/screenshots/architecture-overview.webp"
    );
    expect(
      screen.getByRole("img", { name: /answering what the AI Analysis Engine does/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /private component note/i })).toBeInTheDocument();
    expect(new Set(screenshotSources)).toEqual(
      new Set([
        "/screenshots/architecture-overview.webp",
        "/screenshots/ask-and-compare.webp",
        "/screenshots/notes-and-rescan.webp",
      ])
    );
    expect(new Set(screenshotSources).size).toBe(3);
    expect(screen.queryByRole("link", { name: /demo/i })).not.toBeInTheDocument();
  });

  it("keeps the full working loop, use cases, trust, and final start action", async () => {
    await renderLandingPage();

    expect(screen.getByRole("heading", { name: "Bring what you have." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Shape the system." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ask and compare." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Keep it current." })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "StackHatch use cases" })).toHaveAttribute(
      "aria-roledescription",
      "carousel"
    );
    expect(screen.getByRole("heading", { name: "Your project" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Free product. Your model. Your key." })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Map the codebase in front of you." })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Choose a starting point" })).toHaveAttribute(
      "href",
      "#start"
    );
  });

  it("keeps the hero headline in explicit editorial lines without decorative labels", async () => {
    await renderLandingPage();

    const heading = screen.getByRole("heading", {
      level: 1,
      name: "Keep the whole system in view.",
    });
    expect(heading.querySelectorAll("span")).toHaveLength(2);
    expect(screen.queryByText("Four ways in")).not.toBeInTheDocument();
    expect(screen.queryByText("Inside the workspace")).not.toBeInTheDocument();
  });

  it("keeps GitHub adoption visible without pricing claims", async () => {
    await renderLandingPage();

    expect(
      screen.getByRole("link", { name: /Star StackHatch on GitHub — 128 stars/i })
    ).toHaveAttribute("href", "https://github.com/mwmdev/stackhatch");
    expect(screen.queryByRole("link", { name: /pricing|plans/i })).not.toBeInTheDocument();
  });
});
