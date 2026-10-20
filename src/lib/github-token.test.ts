import { describe, expect, it } from "vitest";
import { githubTokenCreationUrl, githubTokenShapeError } from "./github-token";

describe("githubTokenShapeError", () => {
  it("accepts a fine-grained token, ignoring surrounding whitespace", () => {
    expect(githubTokenShapeError("  github_pat_11ABCDEFG0_abcXYZ123  ")).toBeNull();
  });

  it.each(["ghp_classic123", "gho_oauth123", "ghu_app123", "ghs_install123"])(
    "rejects %s and points to a fine-grained token",
    (token) => {
      expect(githubTokenShapeError(token)).toMatch(/only accepts fine-grained tokens/);
    }
  );

  it.each(["", "github_pat_", "github_pat_has space", "github_pat_abc-def", "sk-ant-key"])(
    "rejects %j as not a fine-grained token",
    (token) => {
      expect(githubTokenShapeError(token)).toBe(
        "Enter a fine-grained GitHub token. It starts with github_pat_"
      );
    }
  );
});

describe("githubTokenCreationUrl", () => {
  it("asks GitHub for read-only contents on the given owner's repositories", () => {
    const url = new URL(githubTokenCreationUrl("acme"));
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://github.com/settings/personal-access-tokens/new"
    );
    expect(url.searchParams.get("contents")).toBe("read");
    expect(url.searchParams.get("target_name")).toBe("acme");
    expect(url.searchParams.get("name")).toBe("StackHatch");
  });

  it("leaves the owner to GitHub when none is known", () => {
    expect(new URL(githubTokenCreationUrl()).searchParams.has("target_name")).toBe(false);
  });
});
