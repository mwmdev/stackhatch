import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SupportPage from "./page";

describe("SupportPage", () => {
  it("presents local-first help, trust links, and community support", () => {
    render(<SupportPage />);

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Keep your map private, portable, and understandable.",
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "StackHatch home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: /^Theme:/ })).toBeInTheDocument();

    const topicNavigation = screen.getByRole("navigation", { name: "Help topics" });
    expect(topicNavigation).toContainElement(
      screen.getByRole("link", { name: "Protect your local work" })
    );
    expect(topicNavigation).toContainElement(
      screen.getByRole("link", { name: "Bring your Anthropic key" })
    );
    expect(topicNavigation).toContainElement(
      screen.getByRole("link", { name: "Understand the evidence" })
    );
    expect(screen.getByRole("link", { name: "Protect your local work" })).toHaveAttribute(
      "href",
      "#local-data"
    );

    for (const heading of [
      "Protect your local work",
      "Bring your Anthropic key",
      "Understand the evidence",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name: heading })).toBeInTheDocument();
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
    expect(screen.getByRole("link", { name: "Star on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/mwmdev/stackhatch"
    );
  });

  it("states the local backup, BYOK, and evidence guidance", () => {
    render(<SupportPage />);

    expect(
      screen.getByText(/Maps live in this browser profile and do not sync to an account/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/stays in session memory unless you explicitly choose to remember it/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Review the scanned revision, warnings, inferred components/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Keep keys, private requirements, and private repository content out/)
    ).toBeInTheDocument();
  });
});
