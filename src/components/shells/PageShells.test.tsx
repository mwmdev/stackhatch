import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AppPageShell from "./AppPageShell";
import PublicPageShell from "./PublicPageShell";

describe("PublicPageShell", () => {
  it("frames a reading page with the public bar, one main landmark, and the footer", () => {
    render(
      <PublicPageShell title="Privacy policy" description="Effective July 24, 2026">
        <section>Policy content</section>
      </PublicPageShell>
    );

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeInTheDocument();
    expect(screen.getByText("Effective July 24, 2026")).toBeInTheDocument();
    expect(screen.getByText("Policy content")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "StackHatch home" })).toHaveAttribute("href", "/");

    const primary = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(primary).getByRole("link", { name: "Features" })).toHaveAttribute(
      "href",
      "/#features"
    );
    expect(within(primary).getByRole("link", { name: "Start a map" })).toHaveAttribute(
      "href",
      "/app"
    );
    expect(
      within(primary).getByRole("button", {
        name: /Theme: (System|Light|Dark)\. Change appearance/,
      })
    ).toBeInTheDocument();

    const footer = screen.getByRole("navigation", { name: "Footer navigation" });
    expect(within(footer).getByRole("link", { name: "Support" })).toHaveAttribute(
      "href",
      "/support"
    );
    expect(within(footer).getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy"
    );
    expect(within(footer).getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  });
});

describe("AppPageShell", () => {
  it("places the title row, index, content and docked column in one main landmark", () => {
    render(
      <AppPageShell
        title="All maps"
        meta="4 on this device"
        titleActions={<button type="button">Cancel</button>}
        index={<nav aria-label="Settings sections">Sections</nav>}
        aside={<section aria-label="Backup and restore">Backups</section>}
      >
        <p>Map rows</p>
      </AppPageShell>
    );

    const main = screen.getByRole("main");
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(within(main).getByRole("heading", { level: 1, name: "All maps" })).toBeInTheDocument();
    expect(within(main).getByText("4 on this device")).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(within(main).getByRole("navigation", { name: "Settings sections" })).toBeInTheDocument();
    expect(within(main).getByRole("region", { name: "Backup and restore" })).toBeInTheDocument();
    expect(within(main).getByText("Map rows")).toBeInTheDocument();

    // Heading, then index, then content, in every layout.
    const heading = within(main).getByRole("heading", { level: 1, name: "All maps" });
    const nav = within(main).getByRole("navigation", { name: "Settings sections" });
    expect(heading.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("does not link the breadcrumb to the page it names", () => {
    render(
      <AppPageShell current="maps" title="All maps">
        <p>Rows</p>
      </AppPageShell>
    );

    expect(screen.queryByRole("link", { name: "All maps" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New map" })).toHaveAttribute("href", "/project/new");
    expect(screen.getByRole("link", { name: "StackHatch home" })).toHaveAttribute("href", "/");
  });

  it("drops New map on the new-map route and links back to all maps", () => {
    render(
      <AppPageShell current="new" title="New map">
        <p>Start options</p>
      </AppPageShell>
    );

    expect(screen.queryByRole("link", { name: "New map" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All maps" })).toHaveAttribute("href", "/app/maps");
  });

  it("marks settings as the current page and accepts a replacement breadcrumb", () => {
    render(
      <AppPageShell
        current="settings"
        crumb={<a href="/project/new?mode=repository">Back to map setup</a>}
        title="Device settings"
      >
        <p>Settings form</p>
      </AppPageShell>
    );

    const controls = screen.getByRole("group", { name: "Device controls" });
    expect(within(controls).getByRole("link", { name: "Device settings" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(within(controls).getByRole("link", { name: "Help" })).not.toHaveAttribute(
      "aria-current"
    );
    expect(screen.getByRole("link", { name: "Back to map setup" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "All maps" })).not.toBeInTheDocument();
  });
});
