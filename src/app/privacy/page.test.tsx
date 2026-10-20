import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AI_PROVIDERS, AI_PROVIDER_IDS } from "@/lib/ai/providers";
import PrivacyPage from "./page";

describe("PrivacyPage", () => {
  it("keeps the policy content inside the shared reading shell", () => {
    render(<PrivacyPage />);

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByText("Effective October 1, 2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "StackHatch home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: /^Theme:/ })).toBeInTheDocument();
    const legalNavigation = screen.getByRole("navigation", { name: "Legal pages" });
    expect(within(legalNavigation).getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(within(legalNavigation).getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/terms"
    );

    for (const heading of [
      "The short version",
      "Data on your device",
      "Direct provider requests",
      "Static hosting",
      "Network boundary",
      "Your controls",
    ]) {
      expect(
        screen.getByRole("heading", { level: 2, name: new RegExp(`^${heading}$`, "i") })
      ).toBeInTheDocument();
    }
  });

  it("states the local, provider, host, and data-loss boundaries", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/Public repositories need no token/)).toBeInTheDocument();
    expect(screen.getByText(/sends it only to api\.github\.com/)).toBeInTheDocument();
    expect(screen.getByText(/never sent to an AI provider/)).toBeInTheDocument();
    expect(screen.getByText(/included in map and device backups/)).toBeInTheDocument();
    expect(
      screen.getByText(/backups of private-repository maps as confidential/)
    ).toBeInTheDocument();
    expect(screen.getByText(/no user accounts, product analytics/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /Projects, messages, repository evidence, and preferences stay in your browser profile/
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/template/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Clearing site data.*can remove it/)).toBeInTheDocument();
    expect(
      screen.getByText(/Backups.*exclude provider credentials and your GitHub token/)
    ).toBeInTheDocument();
    expect(screen.getByText(/does not proxy or retain that request/)).toBeInTheDocument();
    expect(screen.getByText(/temporarily process ordinary request metadata/)).toBeInTheDocument();
    expect(screen.getByText(/there is no remote account or project record/)).toBeInTheDocument();
  });

  it("names every registry provider where requests and network access are described", () => {
    render(<PrivacyPage />);

    const sectionText = (title: RegExp) =>
      screen.getByRole("heading", { level: 2, name: title }).parentElement!.textContent;
    const requests = sectionText(/^direct provider requests$/i);
    const boundary = sectionText(/^network boundary$/i);
    for (const id of AI_PROVIDER_IDS) {
      expect(requests).toContain(AI_PROVIDERS[id].name);
      expect(boundary).toContain(AI_PROVIDERS[id].name);
    }
    expect(requests).toMatch(
      /OpenRouter, it forwards each request to the provider of the model you chose/
    );
  });
});
