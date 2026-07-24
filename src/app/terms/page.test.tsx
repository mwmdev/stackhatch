import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TermsPage from "./page";

describe("TermsPage", () => {
  it("keeps the agreement content inside the shared reading shell", () => {
    render(<TermsPage />);

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Terms of Use" })).toBeInTheDocument();
    expect(screen.getByText("Effective July 24, 2026")).toBeInTheDocument();
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
      "Using StackHatch",
      "Providers and Credentials",
      "Content and Generated Output",
      "Acceptable Use",
      "Availability and Support",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name: heading })).toBeInTheDocument();
    }
  });

  it("states device ownership, direct provider, and generated-output limits", () => {
    render(<TermsPage />);

    expect(screen.getByText(/stores workspace data in your browser/)).toBeInTheDocument();
    expect(screen.getByText(/connects directly to GitHub or Anthropic/)).toBeInTheDocument();
    expect(screen.getByText(/may be incomplete or incorrect/)).toBeInTheDocument();
    expect(screen.getByText(/without an uptime or support commitment/)).toBeInTheDocument();
  });
});
