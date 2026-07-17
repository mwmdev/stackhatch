import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PrivacyPage from "./page";

describe("PrivacyPage", () => {
  it("keeps the policy content inside the shared reading shell", () => {
    render(<PrivacyPage />);

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByText("Effective July 15, 2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "StackHatch home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: /^Theme:/ })).toBeInTheDocument();

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
    expect(
      screen.getByText(/To request account deletion, project export, or correction of account data/)
    ).toBeInTheDocument();
  });
});
