import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SkipLink from "./SkipLink";

afterEach(() => window.history.replaceState(null, "", "/"));

describe("SkipLink", () => {
  it("moves keyboard focus to main without changing an open map fragment", () => {
    window.history.replaceState(null, "", "/project/#map-42");
    render(
      <>
        <SkipLink />
        <main id="main" tabIndex={-1}>
          Map
        </main>
      </>
    );
    const skip = screen.getByRole("link", { name: "Skip to main content" });
    expect(skip).toHaveAttribute("href", "#main");
    fireEvent.click(skip);
    expect(screen.getByRole("main")).toHaveFocus();
    expect(window.location.hash).toBe("#map-42");
  });

  it("retains the ordinary fragment fallback when there is no main landmark", () => {
    render(<SkipLink />);
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute(
      "href",
      "#main"
    );
  });
});
