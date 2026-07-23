import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import AppResolver from "./AppResolver";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

describe("AppResolver", () => {
  beforeEach(() => {
    replace.mockClear();
    window.history.replaceState({}, "", "/app");
    window.sessionStorage.clear();
    delete window.umami;
  });

  it("shows a status shell and replaces to the server-selected resume destination once", async () => {
    const { container, rerender } = render(<AppResolver destination="/project/map-1?resume=1" />);

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("Opening your map");
    const illustrations = container.querySelectorAll('[data-stack-illustration="true"]');
    expect(illustrations).toHaveLength(1);
    expect(illustrations[0]).toHaveAttribute("aria-hidden", "true");
    expect(illustrations[0]).toHaveAttribute("focusable", "false");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/project/map-1?resume=1"));

    rerender(<AppResolver destination="/project/map-1?resume=1" />);
    expect(replace).toHaveBeenCalledOnce();
  });

  it("canonicalizes legacy blank query intent before normal resume", async () => {
    window.history.replaceState({}, "", "/app?start=blank#start");
    render(<AppResolver destination="/project/map-1?resume=1" />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/project/new?mode=blank"));
  });

  it("canonicalizes a legacy repository fragment before normal resume", async () => {
    window.history.replaceState({}, "", "/app?repo=acme%2Fapi#start");
    render(<AppResolver destination="/project/map-1?resume=1" />);

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/project/new?mode=repository&repo=acme%2Fapi")
    );
  });

  it("canonicalizes a legacy repository query before normal resume", async () => {
    window.history.replaceState({}, "", "/app?repo=acme%2Fapi");
    render(<AppResolver destination="/project/map-1?resume=1" />);

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/project/new?mode=repository&repo=acme%2Fapi")
    );
  });

  it("canonicalizes a bare legacy fragment to the chooser", async () => {
    window.history.replaceState({}, "", "/app#start");
    render(<AppResolver destination="/project/map-1?resume=1" />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/project/new"));
  });

  it("records authentication completion before resuming an existing map", async () => {
    const track = vi.fn();
    window.umami = { track };
    window.sessionStorage.setItem("stackhatch:auth-pending", "1");
    window.sessionStorage.setItem("stackhatch:project-start-method", "repository");

    render(<AppResolver destination="/project/map-1?resume=1" />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/project/map-1?resume=1"));
    expect(window.sessionStorage.getItem("stackhatch:auth-pending")).toBeNull();
    expect(track).toHaveBeenCalledOnce();
    const payload = (track.mock.calls[0][0] as (value: Record<string, unknown>) => unknown)({
      website: "site-id",
    });
    expect(payload).toEqual(
      expect.objectContaining({
        name: "github_auth_completed",
        data: { location: "editor", start_method: "repository" },
      })
    );
  });
});
