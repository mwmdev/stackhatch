import { beforeEach, describe, expect, it } from "vitest";
import {
  buildProjectStartLoginUrl,
  buildProjectStartPath,
  callbackUrlWithLegacyFragment,
  canonicalProjectStartPath,
  consumePendingBlankProjectStart,
  consumeProjectStartMethod,
  getPendingBlankProjectStart,
  getProjectStartMethod,
  isPublicRepositorySlug,
  safeProjectReturnPath,
  projectStartMethodFromPath,
  markProjectStart,
  repositoryFromProjectStartPath,
  safeInternalPath,
} from "./project-start";

describe("project start contract", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("builds each canonical start path", () => {
    expect(buildProjectStartPath("blank")).toBe("/project/new?mode=blank");
    expect(buildProjectStartPath("requirements")).toBe("/project/new?mode=requirements");
    expect(buildProjectStartPath("repository", { repository: "acme/platform.api" })).toBe(
      "/project/new?mode=repository&repo=acme%2Fplatform.api"
    );
    expect(buildProjectStartPath("template")).toBe("/project/new?mode=template");
    expect(buildProjectStartLoginUrl("repository", "acme/api")).toBe(
      "/login?callbackUrl=%2Fproject%2Fnew%3Fmode%3Drepository%26repo%3Dacme%252Fapi"
    );
    expect(
      buildProjectStartPath("repository", {
        repository: "acme/api",
        returnTo: "/project/map-1",
      })
    ).toBe("/project/new?mode=repository&repo=acme%2Fapi&returnTo=%2Fproject%2Fmap-1");
  });

  it("validates public repository slugs before putting them in a URL", () => {
    expect(isPublicRepositorySlug("acme/api")).toBe(true);
    expect(isPublicRepositorySlug("https://github.com/acme/api")).toBe(false);
    expect(() =>
      buildProjectStartPath("repository", { repository: "https://evil.example/repo" })
    ).toThrow("owner/repository");
  });

  it("extracts only canonical start context", () => {
    expect(projectStartMethodFromPath("/app?start=blank")).toBe("blank");
    expect(projectStartMethodFromPath("/project/new?mode=blank")).toBe("blank");
    expect(projectStartMethodFromPath("/project/new?mode=requirements")).toBe("requirements");
    expect(projectStartMethodFromPath("/project/new?mode=repository&repo=acme%2Fapi")).toBe(
      "repository"
    );
    expect(projectStartMethodFromPath("/app?repo=acme%2Fapi")).toBe("repository");
    expect(projectStartMethodFromPath("/settings?mode=template")).toBeNull();
    expect(repositoryFromProjectStartPath("/project/new?mode=repository&repo=acme%2Fapi")).toBe(
      "acme/api"
    );
    expect(repositoryFromProjectStartPath("/app?repo=acme%2Fapi")).toBe("acme/api");
    expect(
      repositoryFromProjectStartPath("/project/new?mode=repository&repo=https%3A%2F%2Fevil.example")
    ).toBeNull();
  });

  it("accepts only exact project routes as creation return destinations", () => {
    expect(safeProjectReturnPath("/project/4d147562-91ff-4c63-aad0-1f8389e65042")).toBe(
      "/project/4d147562-91ff-4c63-aad0-1f8389e65042"
    );
    expect(safeProjectReturnPath("/project/map-1")).toBe("/project/map-1");
    expect(safeProjectReturnPath("/project/map-1?delete=1")).toBeNull();
    expect(safeProjectReturnPath("/project/map-1/notes")).toBeNull();
    expect(safeProjectReturnPath("//evil.example/project/map-1")).toBeNull();
    expect(safeProjectReturnPath("https://stackhatch.io/project/map-1")).toBeNull();
  });

  it("canonicalizes legacy and nested creation paths without unsafe context", () => {
    expect(canonicalProjectStartPath("/app#start")).toBe("/project/new");
    expect(canonicalProjectStartPath("/app?start=blank")).toBe("/project/new?mode=blank");
    expect(canonicalProjectStartPath("/app?repo=acme%2Fapi#start")).toBe(
      "/project/new?mode=repository&repo=acme%2Fapi"
    );
    expect(canonicalProjectStartPath("/app?repo=acme%2Fapi")).toBe(
      "/project/new?mode=repository&repo=acme%2Fapi"
    );
    expect(
      canonicalProjectStartPath(
        "/project/new?mode=repository&repo=acme%2Fapi&returnTo=%2Fproject%2Fmap-1"
      )
    ).toBe("/project/new?mode=repository&repo=acme%2Fapi&returnTo=%2Fproject%2Fmap-1");
    expect(
      canonicalProjectStartPath(
        "/project/new?mode=repository&repo=https%3A%2F%2Fevil.example&returnTo=https%3A%2F%2Fevil.example"
      )
    ).toBe("/project/new?mode=repository");
  });

  it("preserves an inherited legacy fragment through the login boundary", () => {
    expect(callbackUrlWithLegacyFragment("/app", "#start")).toBe("/project/new");
    expect(callbackUrlWithLegacyFragment("/app?repo=acme%2Fapi", "#start")).toBe(
      "/project/new?mode=repository&repo=acme%2Fapi"
    );
    expect(callbackUrlWithLegacyFragment("/project/map-1", "#start")).toBe("/project/map-1");
    expect(callbackUrlWithLegacyFragment("/app", "#other")).toBe("/app");
  });

  it("allows internal and same-origin paths while rejecting unsafe redirects", () => {
    expect(safeInternalPath("/project/new?mode=requirements", "/app")).toBe(
      "/project/new?mode=requirements"
    );
    expect(
      safeInternalPath(
        "https://stackhatch.io/project/new?mode=template",
        "/app",
        "https://stackhatch.io"
      )
    ).toBe("/project/new?mode=template");
    expect(
      safeInternalPath("https://example.com/project/new", "/app", "https://stackhatch.io")
    ).toBe("/app");
    expect(safeInternalPath("//example.com/project/new", "/app", "https://stackhatch.io")).toBe(
      "/app"
    );
    expect(safeInternalPath("/\\example.com/project/new", "/app", "https://stackhatch.io")).toBe(
      "/app"
    );
  });

  it("consumes blank auto-create once without consuming the activation method", () => {
    markProjectStart("blank");

    expect(getPendingBlankProjectStart()).toBe(true);
    expect(consumePendingBlankProjectStart()).toBe(true);
    expect(consumePendingBlankProjectStart()).toBe(false);
    expect(getProjectStartMethod()).toBe("blank");
    expect(consumeProjectStartMethod()).toBe("blank");
    expect(getProjectStartMethod()).toBeNull();
  });

  it("replaces stale blank intent when another method is selected", () => {
    markProjectStart("blank");
    markProjectStart("template");

    expect(getPendingBlankProjectStart()).toBe(false);
    expect(getProjectStartMethod()).toBe("template");
  });
});
