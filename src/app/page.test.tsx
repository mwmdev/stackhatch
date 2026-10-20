import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AI_PROVIDERS, AI_PROVIDER_IDS } from "@/lib/ai/providers";
import LandingPage from "./page";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

const SOURCE_URL = "https://github.com/mwmdev/stackhatch";

function region(name: string) {
  return document.querySelector<HTMLElement>(`[data-landing-region="${name}"]`)!;
}

describe("LandingPage", () => {
  it("tells the story once, in order: hero, audience, features, privacy, closing call", () => {
    render(<LandingPage />);

    const regions = Array.from(document.querySelectorAll<HTMLElement>("[data-landing-region]")).map(
      (element) => element.dataset.landingRegion
    );
    expect(regions).toEqual(["hero", "audience", "features", "privacy", "final-cta"]);
    expect(region("features")).toHaveAttribute("id", "features");

    expect(
      screen.getByRole("heading", { level: 1, name: "Keep the whole stack in view" })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("starts a repository map or a blank one from the hero", () => {
    render(<LandingPage />);

    const hero = region("hero");
    expect(within(hero).getByRole("link", { name: "Start a blank map" })).toHaveAttribute(
      "href",
      "/project/new?mode=blank"
    );
    // Every page-level conversion starts a new map; the bar's own link is the
    // shared public chrome.
    for (const link of within(screen.getByRole("main")).getAllByRole("link", {
      name: "Start a map",
    })) {
      expect(link).toHaveAttribute("href", "/project/new");
    }
    expect(screen.queryByRole("link", { name: /pricing|plans|sign in/i })).toBeNull();
  });

  it("hands a pasted GitHub link to the repository start, and rejects anything else", () => {
    push.mockClear();
    render(<LandingPage />);

    const hero = region("hero");
    const field = within(hero).getByRole("textbox", { name: "GitHub repository" });
    const submit = within(hero).getByRole("button", { name: "Map repository" });

    fireEvent.change(field, { target: { value: "gitlab.com/acme/shop" } });
    fireEvent.click(submit);
    expect(push).not.toHaveBeenCalled();
    expect(within(hero).getByRole("alert")).toHaveTextContent("owner/repo");
    expect(field).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(field, { target: { value: "https://github.com/umami-software/umami.git" } });
    expect(within(hero).queryByRole("alert")).toBeNull();
    fireEvent.click(submit);
    expect(push).toHaveBeenCalledWith("/project/new?mode=repository#repo=umami-software%2Fumami");
  });

  it("offers the narrated tour on request and never starts it by itself", () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    render(<LandingPage />);

    const slot = screen.getByTestId("hero-proof");
    const video = within(slot).getByLabelText<HTMLVideoElement>("StackHatch in two minutes");
    expect(video.autoplay).toBe(false);
    expect(video).not.toHaveAttribute("controls");
    expect(video.querySelector('track[kind="captions"][srclang="en"]')).not.toBeNull();
    expect(play).not.toHaveBeenCalled();

    fireEvent.click(within(slot).getByRole("button", { name: /Watch the tour/ }));

    expect(play).toHaveBeenCalledOnce();
    expect(video).toHaveAttribute("controls");
    expect(within(slot).queryByRole("button", { name: /Watch the tour/ })).toBeNull();
    play.mockRestore();
  });

  it("names both starting points in the hero", () => {
    render(<LandingPage />);

    const hero = region("hero");
    expect(hero).toHaveTextContent("GitHub repository");
    expect(hero).not.toHaveTextContent("public GitHub repository");
    expect(hero).toHaveTextContent("Markdown brief");
    expect(hero).toHaveTextContent("editable architecture map");
  });

  it("states the privacy boundary once", () => {
    render(<LandingPage />);

    const privacy = region("privacy");
    expect(
      within(privacy)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent)
    ).toEqual(["No account", "Stays in your browser", "Your key, direct", "Open source"]);
    for (const id of AI_PROVIDER_IDS) {
      expect(privacy).toHaveTextContent(AI_PROVIDERS[id].name);
    }
    expect(within(privacy).getByRole("link", { name: "View on GitHub" })).toHaveAttribute(
      "href",
      SOURCE_URL
    );
  });

  it("closes with the conversion under its own heading", () => {
    render(<LandingPage />);

    const closing = region("final-cta");
    expect(
      within(closing).getByRole("heading", {
        level: 2,
        name: "Make the next architecture decision visible",
      })
    ).toBeInTheDocument();
    expect(within(closing).getByRole("link", { name: "Start a map" })).toHaveAttribute(
      "href",
      "/project/new"
    );
  });

  it("keeps the public navigation and footer destinations", () => {
    render(<LandingPage />);

    const primary = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(primary).getByRole("link", { name: "Features" })).toHaveAttribute(
      "href",
      "/#features"
    );
    expect(
      screen.getByRole("button", { name: "Theme: Light. Change appearance" })
    ).toBeInTheDocument();

    const footer = screen.getByRole("navigation", { name: "Footer navigation" });
    expect(within(footer).getByRole("link", { name: "Support" })).toHaveAttribute(
      "href",
      "/support"
    );
    expect(within(footer).getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy"
    );
    expect(within(footer).getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  });
});
