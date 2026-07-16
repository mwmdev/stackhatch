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
  });

  it("shows a status shell and replaces to the server-selected resume destination once", async () => {
    const { rerender } = render(<AppResolver destination="/project/map-1?resume=1" />);

    expect(screen.getByRole("status")).toHaveTextContent("Opening your map");
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

  it("canonicalizes a bare legacy fragment to the chooser", async () => {
    window.history.replaceState({}, "", "/app#start");
    render(<AppResolver destination="/project/map-1?resume=1" />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/project/new"));
  });
});
