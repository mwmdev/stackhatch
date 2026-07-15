import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TrackedSourceLink from "./TrackedSourceLink";

const { trackEvent } = vi.hoisted(() => ({ trackEvent: vi.fn() }));

vi.mock("@/lib/analytics", () => ({ trackEvent }));

describe("TrackedSourceLink", () => {
  it("records a source click without sending the destination", () => {
    render(
      <TrackedSourceLink
        href="https://github.com/mwmdev/stackhatch"
        location="navigation"
        onClick={(event) => event.preventDefault()}
      >
        Source
      </TrackedSourceLink>
    );

    fireEvent.click(screen.getByRole("link", { name: "Source" }));

    expect(trackEvent).toHaveBeenCalledWith("github_source_clicked", { location: "navigation" });
    expect(JSON.stringify(trackEvent.mock.calls)).not.toContain("github.com");
  });

  it("distinguishes a star action from a source visit", () => {
    render(
      <TrackedSourceLink
        href="https://github.com/mwmdev/stackhatch"
        intent="star"
        onClick={(event) => event.preventDefault()}
      >
        Star on GitHub
      </TrackedSourceLink>
    );

    fireEvent.click(screen.getByRole("link", { name: "Star on GitHub" }));

    expect(trackEvent).toHaveBeenCalledWith("github_star_clicked", {
      location: "navigation",
    });
  });
});
