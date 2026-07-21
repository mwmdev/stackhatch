import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TermsPage from "./page";

describe("TermsPage", () => {
  it("keeps the agreement content inside the shared reading shell", () => {
    render(<TermsPage />);

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeInTheDocument();
    expect(screen.getByText("Effective July 15, 2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "StackHatch home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: /^Theme:/ })).toBeInTheDocument();
    const legalNavigation = screen.getByRole("navigation", { name: "Legal pages" });
    expect(within(legalNavigation).getByRole("link", { name: "Terms" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(within(legalNavigation).getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy"
    );

    for (const heading of [
      "Use of StackHatch",
      "Accounts and AI Usage",
      "Acceptable Use",
      "Support",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name: heading })).toBeInTheDocument();
    }
  });

  it("preserves substantive ownership, AI usage, and support wording", () => {
    render(<TermsPage />);

    expect(
      screen.getByText(/Projects are accessible only to their account owner/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/AI features require a user-provided Anthropic API key/)
    ).toBeInTheDocument();
    expect(screen.getByText(/contact support@stackhatch.io/)).toBeInTheDocument();
  });
});
