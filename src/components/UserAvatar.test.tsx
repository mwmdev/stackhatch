import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import UserAvatar from "./UserAvatar";

describe("UserAvatar", () => {
  it("renders the effective user initial from /api/me", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ name: "Free Customer" }),
      })
    ) as unknown as typeof fetch;

    render(<UserAvatar />);

    await waitFor(() => {
      expect(screen.getByLabelText("Free Customer")).toHaveTextContent("F");
    });
  });

  it("keeps a neutral fallback when the current identity cannot be loaded", async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;

    render(<UserAvatar />);

    await waitFor(() => expect(screen.getByLabelText("User")).toHaveTextContent("U"));
  });
});
