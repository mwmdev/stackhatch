import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SupportPage from "./page";

describe("SupportPage", () => {
  it("presents local-first help, trust links, and community support", () => {
    render(<SupportPage />);

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Help" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "StackHatch home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: /^Theme:/ })).toBeInTheDocument();

    const primaryNavigation = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(primaryNavigation).getByRole("link", { name: "Features" })).toHaveAttribute(
      "href",
      "/#features"
    );
    expect(within(primaryNavigation).getByRole("link", { name: "Start a map" })).toHaveAttribute(
      "href",
      "/app"
    );

    const topicNavigation = screen.getByRole("navigation", { name: "Help topics" });
    expect(
      within(topicNavigation)
        .getAllByRole("link")
        .map((link) => link.textContent)
    ).toEqual([
      "Getting started",
      "Working the canvas",
      "When something goes wrong",
      "Back up your work",
      "Get help",
    ]);
    expect(
      within(topicNavigation).getByRole("link", { name: "Back up your work" })
    ).toHaveAttribute("href", "#local-data");

    for (const heading of ["Getting started", "Back up your work", "Get help"]) {
      expect(screen.getByRole("heading", { level: 2, name: heading })).toBeInTheDocument();
    }
    for (const heading of ["Trust boundary", "Community support"]) {
      expect(screen.queryByRole("heading", { level: 2, name: heading })).not.toBeInTheDocument();
    }

    expect(screen.getByRole("link", { name: "Open an issue" })).toHaveAttribute(
      "href",
      "https://github.com/mwmdev/stackhatch/issues/new/choose"
    );
    for (const link of screen.getAllByRole("link", { name: "Privacy" })) {
      expect(link).toHaveAttribute("href", "/privacy");
    }
    for (const link of screen.getAllByRole("link", { name: /Terms/ })) {
      expect(link).toHaveAttribute("href", "/terms");
    }
    expect(screen.getByRole("link", { name: "View source" })).toHaveAttribute(
      "href",
      "https://github.com/mwmdev/stackhatch"
    );
  });

  it("states the local backup and BYOK guidance", () => {
    render(<SupportPage />);

    expect(
      screen.getByText(/Start with a blank canvas, a requirements file, or a GitHub repository/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/worked example|template/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Maps live in this browser profile and do not sync to an account/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/stays in session memory unless you explicitly choose to remember it/)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Review the scanned revision, warnings, inferred components/)
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Keep keys, private requirements, and private repository content out/)
    ).toBeInTheDocument();
  });
});
