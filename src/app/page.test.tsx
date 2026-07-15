import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LandingPage from "./page";

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
  it("leads with four equally visible ways to start", async () => {
    await renderLandingPage();

    expect(screen.getByRole("heading", { name: "Start with what you have." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Start fresh" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Upload requirements" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Map a repo" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Use a template" })).toBeInTheDocument();
    expect(screen.getByText("One architecture map")).toBeInTheDocument();
  });

  it("uses three real-product screenshots as the feature proof", async () => {
    await renderLandingPage();

    expect(
      screen.getByRole("heading", { name: "See the system. Ask why. Keep it current." })
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /architecture map of its own/i })).toHaveAttribute(
      "src",
      "/screenshots/architecture-overview.webp"
    );
    expect(
      screen.getByRole("img", { name: /answering what the AI Analysis Engine does/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /private component note/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /demo/i })).not.toBeInTheDocument();
  });

  it("keeps the full working loop, use cases, trust, and final start action", async () => {
    await renderLandingPage();

    expect(screen.getByRole("heading", { name: "Bring what you have." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Shape the system." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ask and compare." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Keep it current." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your project" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "A project you joined" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "An open-source project" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Free product. Your model. Your key." })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Choose a starting point" })).toHaveAttribute(
      "href",
      "#start"
    );
  });

  it("keeps GitHub adoption visible without pricing claims", async () => {
    await renderLandingPage();

    expect(
      screen.getByRole("link", { name: /Star StackHatch on GitHub — 128 stars/i })
    ).toHaveAttribute("href", "https://github.com/mwmdev/stackhatch");
    expect(screen.queryByRole("link", { name: /pricing|plans/i })).not.toBeInTheDocument();
  });
});
