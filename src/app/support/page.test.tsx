import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SupportPage from "./page";

describe("SupportPage", () => {
  it("preserves the support paths, trust links, and public shell navigation", () => {
    render(<SupportPage />);

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Get from repository to a map you can reason about.",
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "StackHatch home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: /^Theme:/ })).toBeInTheDocument();

    const topicNavigation = screen.getByRole("navigation", { name: "Support topics" });
    expect(topicNavigation).toContainElement(
      screen.getByRole("link", { name: "Map a repository" })
    );
    expect(topicNavigation).toContainElement(
      screen.getByRole("link", { name: "Bring your Anthropic key" })
    );
    expect(topicNavigation).toContainElement(
      screen.getByRole("link", { name: "Understand the evidence" })
    );
    expect(screen.getByRole("link", { name: "Map a repository" })).toHaveAttribute(
      "href",
      "#first-map"
    );

    for (const heading of [
      "Map a repository",
      "Bring your Anthropic key",
      "Understand the evidence",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name: heading })).toBeInTheDocument();
    }

    expect(screen.getByRole("link", { name: "support@stackhatch.io" })).toHaveAttribute(
      "href",
      "mailto:support@stackhatch.io"
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

  it("keeps the substantive BYOK and evidence guidance", () => {
    render(<SupportPage />);

    expect(
      screen.getByText(/Add your Anthropic API key in Settings; Anthropic bills AI usage directly/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The editor shows the scanned commit and marks partial analysis/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Never email an API key or private project content/)
    ).toBeInTheDocument();
  });
});
