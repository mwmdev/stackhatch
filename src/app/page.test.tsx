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
  it("presents the product story in a direct, non-repeating sequence", async () => {
    await renderLandingPage();

    const regions = Array.from(document.querySelectorAll<HTMLElement>("[data-landing-region]")).map(
      (region) => region.dataset.landingRegion
    );

    expect(regions).toEqual(["hero", "trust", "capabilities", "workflow", "final-cta"]);
    const hero = document.querySelector<HTMLElement>('[data-landing-region="hero"]')!;
    expect(within(hero).getByRole("link", { name: "Start a map" })).toHaveAttribute("href", "/app");
    expect(within(hero).getByRole("link", { name: "See what it does" })).toHaveAttribute(
      "href",
      "#features"
    );
    expect(screen.queryByTestId("landing-marquee")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /use cases/i })).not.toBeInTheDocument();
    expect(document.querySelector("[aria-roledescription='carousel']")).not.toBeInTheDocument();
  });

  it("uses one real product screenshot as the page's signature proof", async () => {
    await renderLandingPage();

    const screenshots = screen
      .getAllByRole("img")
      .filter((image) => image.getAttribute("src")?.startsWith("/screenshots/"));

    expect(screenshots).toHaveLength(1);
    expect(screenshots[0]).toHaveAttribute("src", "/screenshots/architecture-overview.webp");
    expect(screenshots[0]).toHaveAccessibleName(/architecture map of its own/i);
  });

  it("uses one inert routing trace as decoration", async () => {
    await renderLandingPage();

    const traces = document.querySelectorAll('[data-routing-trace="true"]');
    expect(traces).toHaveLength(1);
    expect(traces[0]).toHaveAttribute("aria-hidden", "true");
    expect(traces[0]).toHaveAttribute("focusable", "false");
    expect(traces[0]).toHaveStyle({ pointerEvents: "none" });
    expect(traces[0].closest('[data-routing-trace-clip="true"]')).toBeInTheDocument();
  });

  it("separates concrete trust, product capabilities, and the working loop", async () => {
    await renderLandingPage();

    const trust = document.querySelector<HTMLElement>('[data-landing-region="trust"]')!;
    expect(trust).toHaveTextContent("Free to use. Bring your own key.");
    expect(trust).toHaveTextContent("Map public repositories.");
    expect(trust).toHaveTextContent("Open source on GitHub.");

    for (const capability of [
      "See and shape the system.",
      "Ask how it works. Compare alternatives.",
      "Keep decisions and the map current.",
    ]) {
      expect(screen.getByRole("heading", { name: capability })).toBeInTheDocument();
    }
    expect(
      within(
        document.querySelector<HTMLElement>('[data-landing-region="capabilities"]')!
      ).queryByText("01")
    ).not.toBeInTheDocument();

    for (const step of [
      "Bring what you have.",
      "Shape and explore the map.",
      "Ask. Decide. Revisit.",
    ]) {
      expect(screen.getByRole("heading", { name: step })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("link", { name: "Start a map" })).not.toHaveLength(0);
    for (const link of screen.getAllByRole("link", { name: "Start a map" })) {
      expect(link).toHaveAttribute("href", "/app");
    }
  });

  it("keeps the hero headline in explicit editorial lines without decorative labels", async () => {
    await renderLandingPage();

    const heading = screen.getByRole("heading", {
      level: 1,
      name: "Keep the whole stack in view",
    });
    expect(heading.querySelectorAll("span")).toHaveLength(2);
    expect(within(heading).getByText("Keep the whole stack")).toBeInTheDocument();
    expect(within(heading).getByText("in view")).toBeInTheDocument();
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

  it("preserves the primary and supporting destinations", async () => {
    await renderLandingPage();

    expect(screen.getByRole("link", { name: "Features" })).toHaveAttribute("href", "#features");
    expect(screen.queryByRole("link", { name: "Product" })).not.toBeInTheDocument();
    for (const signIn of screen.getAllByRole("link", { name: "Sign in" })) {
      expect(signIn).toHaveAttribute("href", "/login?callbackUrl=/app");
    }
    for (const support of screen.getAllByRole("link", { name: "Support" })) {
      expect(support).toHaveAttribute("href", "/support");
    }
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  });
});
