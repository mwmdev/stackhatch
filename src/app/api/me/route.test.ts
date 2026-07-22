import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthenticatedUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser }));

const meRoute = await import("@/app/api/me/route");

describe("GET /api/me", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only the current application identity", async () => {
    getAuthenticatedUser.mockResolvedValue({
      userId: "user-1",
      githubId: "github-1",
      name: "User One",
      email: "user@example.com",
      image: "https://example.com/avatar.png",
    });

    const response = await meRoute.GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId: "user-1",
      name: "User One",
      email: "user@example.com",
    });
  });

  it("rejects requests without a current database identity", async () => {
    getAuthenticatedUser.mockResolvedValue(null);

    const response = await meRoute.GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication required" });
  });
});
