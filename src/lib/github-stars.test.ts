import { afterEach, describe, expect, it, vi } from "vitest";
import { formatGitHubStarCount, getGitHubStarCount } from "./github-stars";

describe("GitHub stars", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the public repository star count", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ stargazers_count: 1234 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    await expect(getGitHubStarCount()).resolves.toBe(1234);
    expect(formatGitHubStarCount(1234)).toBe("1.2K");
  });

  it("uses a truthful fallback when GitHub is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(getGitHubStarCount()).resolves.toBeNull();
  });
});
