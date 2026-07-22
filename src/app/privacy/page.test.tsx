import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PrivacyPage from "./page";

describe("PrivacyPage", () => {
  it("keeps the policy content inside the shared reading shell", () => {
    render(<PrivacyPage />);

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByText("Effective July 22, 2026")).toBeInTheDocument();
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
      "Information We Use",
      "Public Repository Analysis",
      "Product Analytics",
      "AI Keys and Project Content",
      "AI Provider",
      "Data Retention",
      "Data Requests",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name: heading })).toBeInTheDocument();
    }
  });

  it("preserves substantive repository, analytics, and data-request wording", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/Private repositories are not supported/)).toBeInTheDocument();
    expect(
      screen.getByText(/Analytics never include repository names, project IDs, prompts, API keys/)
    ).toBeInTheDocument();
    expect(screen.getByText(/delete your account permanently from Settings/)).toBeInTheDocument();
    expect(screen.getByText(/active application database/)).toBeInTheDocument();
    expect(screen.getByText(/creates a fresh account/)).toBeInTheDocument();
    expect(screen.getByText(/WAL files and backups follow/)).toBeInTheDocument();
  });
});
