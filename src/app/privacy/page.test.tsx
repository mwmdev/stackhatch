import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PrivacyPage from "./page";

describe("PrivacyPage", () => {
  it("keeps the policy content inside the shared reading shell", () => {
    render(<PrivacyPage />);

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByText("Effective July 24, 2026")).toBeInTheDocument();
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
      "The Short Version",
      "Data on Your Device",
      "Direct Provider Requests",
      "Static Hosting",
      "Network Boundary",
      "Your Controls",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name: heading })).toBeInTheDocument();
    }
  });

  it("states the local, provider, host, and data-loss boundaries", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/Private repositories are not supported/)).toBeInTheDocument();
    expect(screen.getByText(/no user accounts, product analytics/)).toBeInTheDocument();
    expect(screen.getByText(/Clearing site data.*can remove it/)).toBeInTheDocument();
    expect(screen.getByText(/Backups.*exclude provider credentials/)).toBeInTheDocument();
    expect(screen.getByText(/does not proxy or retain that request/)).toBeInTheDocument();
    expect(screen.getByText(/temporarily process ordinary request metadata/)).toBeInTheDocument();
    expect(screen.getByText(/there is no remote account or project record/)).toBeInTheDocument();
  });
});
