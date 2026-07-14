import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const getToken = vi.hoisted(() => vi.fn());

vi.mock("next-auth/jwt", () => ({
  getToken,
}));

function makeRequest(pathname: string) {
  return new NextRequest(`http://localhost:3000${pathname}`);
}

describe("proxy", () => {
  it.each(["/", "/login", "/support", "/privacy", "/terms"])(
    "allows public path %s",
    async (pathname) => {
      const response = await proxy(makeRequest(pathname));

      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(getToken).not.toHaveBeenCalled();
    }
  );

  it("redirects protected paths to login when unauthenticated", async () => {
    getToken.mockResolvedValueOnce(null);

    const response = await proxy(makeRequest("/app"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });
});
