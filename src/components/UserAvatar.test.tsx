import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import UserAvatar from "./UserAvatar";

describe("UserAvatar", () => {
  it("renders the effective user initial from /api/me", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ name: "Free Customer", role: "free" }),
      })
    ) as unknown as typeof fetch;

    render(<UserAvatar />);

    await waitFor(() => {
      expect(screen.getByLabelText("Free Customer")).toHaveTextContent("F");
    });
  });

  it("does not report a role after unmounting before /api/me resolves", async () => {
    let resolveFetch!: (response: {
      ok: boolean;
      json: () => Promise<{ name: string; role: string }>;
    }) => void;
    global.fetch = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    ) as unknown as typeof fetch;
    const onRoleLoaded = vi.fn();

    const { unmount } = render(<UserAvatar onRoleLoaded={onRoleLoaded} />);
    unmount();

    await act(async () => {
      resolveFetch({
        ok: true,
        json: () => Promise.resolve({ name: "Admin User", role: "admin" }),
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onRoleLoaded).not.toHaveBeenCalled();
  });
});
