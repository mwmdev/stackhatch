import { render, screen, waitFor } from "@testing-library/react";
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

  it("announces active impersonation and maintains the shared height offset", async () => {
    pathname.current = "/app";
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = observe;
        disconnect = disconnect;
      }
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          name: "Mapped User",
          role: "user",
          impersonatedBy: { name: "Admin User" },
        }),
      })
    );

    render(<ImpersonationBanner />);

    const banner = await screen.findByRole("status", { name: "Impersonation active" });
    expect(banner).toHaveTextContent("Impersonating Mapped User as User");
    expect(screen.getByRole("button", { name: "Stop impersonating" })).toHaveClass("min-h-11");
    expect(observe).toHaveBeenCalledWith(banner);
    expect(document.documentElement.style.getPropertyValue("--impersonation-banner-height")).toBe(
      "0px"
    );
  });
});
