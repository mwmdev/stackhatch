import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ImpersonationBanner from "./ImpersonationBanner";

const { pathname } = vi.hoisted(() => ({ pathname: { current: "/" } }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
}));

describe("ImpersonationBanner", () => {
  afterEach(() => {
    pathname.current = "/";
    vi.unstubAllGlobals();
  });

  it.each(["/", "/login", "/support", "/privacy", "/terms"])(
    "does not request user data on the public route %s",
    async (route) => {
      pathname.current = route;
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      render(<ImpersonationBanner />);

      await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
    }
  );

  it("checks impersonation state on authenticated routes", async () => {
    pathname.current = "/app";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ role: "admin" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ImpersonationBanner />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/me"));
  });
});
