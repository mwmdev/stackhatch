import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AppPageShell from "./AppPageShell";
import PublicPageShell from "./PublicPageShell";

describe("PublicPageShell", () => {
  it("provides a reading-width page with one main landmark and presentation slots", () => {
    render(
      <PublicPageShell
        homeHref="/"
        homeLabel="StackHatch home"
        eyebrow="Privacy"
        title="Privacy policy"
        description="How project data is handled."
        actions={<a href="/login">Sign in</a>}
        footer={<p>Last updated today.</p>}
        width="reading"
      >
        <section>Policy content</section>
      </PublicPageShell>
    );

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "StackHatch home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByText("How project data is handled.")).toBeInTheDocument();
    expect(screen.getByText("Policy content")).toBeInTheDocument();
    expect(screen.getByText("Last updated today.")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("data-width", "reading");
  });
});

describe("AppPageShell", () => {
  it("provides a dense app page with navigation, actions, and one main landmark", () => {
    render(
      <AppPageShell
        homeHref="/app"
        homeLabel="All maps"
        eyebrow="Workspace"
        title="Settings"
        description="Manage your workspace."
        navigation={<a href="/app">Maps</a>}
        actions={<button type="button">Save</button>}
        footer={<p>Account footer</p>}
        density="dense"
      >
        <section>Settings form</section>
      </AppPageShell>
    );

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All maps" })).toHaveAttribute("href", "/app");
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toHaveTextContent(
      "Maps"
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByText("Manage your workspace.")).toBeInTheDocument();
    expect(screen.getByText("Settings form")).toBeInTheDocument();
    expect(screen.getByText("Account footer")).toBeInTheDocument();
    expect(screen.getByRole("main").closest(".app-page-shell")).toHaveAttribute(
      "data-density",
      "dense"
    );
  });
});
