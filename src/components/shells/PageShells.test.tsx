import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AppPageShell from "./AppPageShell";
import PublicPageShell from "./PublicPageShell";

describe("PublicPageShell", () => {
  it("provides a reading-width page with one main landmark and presentation slots", () => {
    const { container } = render(
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

    const traces = container.querySelectorAll('[data-routing-trace="true"]');
    expect(traces).toHaveLength(1);
    expect(traces[0]).toHaveAttribute("aria-hidden", "true");
    expect(traces[0]).toHaveAttribute("focusable", "false");
  });

  it("provides the shared public footer when no custom footer is supplied", () => {
    render(
      <PublicPageShell homeHref="/" homeLabel="StackHatch home" title="Support">
        <p>Support content</p>
      </PublicPageShell>
    );

    const footerNavigation = screen.getByRole("navigation", { name: "Footer navigation" });
    expect(footerNavigation).toHaveTextContent("Source");
    expect(footerNavigation).toHaveTextContent("Support");
    expect(footerNavigation).toHaveTextContent("Privacy");
    expect(footerNavigation).toHaveTextContent("Terms");
    expect(screen.getByRole("button", { name: "Theme: change appearance" })).toBeInTheDocument();
  });
});

describe("AppPageShell", () => {
  it("provides a dense app page with navigation, actions, and one main landmark", () => {
    const { container } = render(
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

    const traces = container.querySelectorAll('[data-routing-trace="true"]');
    expect(traces).toHaveLength(1);
    expect(traces[0]).toHaveAttribute("aria-hidden", "true");
    expect(traces[0]).toHaveAttribute("focusable", "false");
  });
});
