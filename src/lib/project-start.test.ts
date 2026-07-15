import { beforeEach, describe, expect, it } from "vitest";
import {
  buildProjectStartLoginUrl,
  buildProjectStartPath,
  consumePendingBlankProjectStart,
  consumeProjectStartMethod,
  getPendingBlankProjectStart,
  getProjectStartMethod,
  isPublicRepositorySlug,
  projectStartMethodFromPath,
  markProjectStart,
  repositoryFromProjectStartPath,
  safeInternalPath,
} from "./project-start";

describe("project start contract", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("builds each canonical start path", () => {
    expect(buildProjectStartPath("blank")).toBe("/app?start=blank");
    expect(buildProjectStartPath("requirements")).toBe("/project/new?mode=requirements");
    expect(buildProjectStartPath("repository", "acme/platform.api")).toBe(
      "/project/new?mode=repository&repo=acme%2Fplatform.api"
    );
    expect(buildProjectStartPath("template")).toBe("/project/new?mode=template");
    expect(buildProjectStartLoginUrl("repository", "acme/api")).toBe(
      "/login?callbackUrl=%2Fproject%2Fnew%3Fmode%3Drepository%26repo%3Dacme%252Fapi"
    );
  });

  it("validates public repository slugs before putting them in a URL", () => {
    expect(isPublicRepositorySlug("acme/api")).toBe(true);
    expect(isPublicRepositorySlug("https://github.com/acme/api")).toBe(false);
    expect(() => buildProjectStartPath("repository", "https://evil.example/repo")).toThrow(
      "owner/repository"
    );
  });

  it("extracts only canonical start context", () => {
    expect(projectStartMethodFromPath("/app?start=blank")).toBe("blank");
    expect(projectStartMethodFromPath("/project/new?mode=requirements")).toBe("requirements");
    expect(projectStartMethodFromPath("/project/new?mode=repository&repo=acme%2Fapi")).toBe(
      "repository"
    );
    expect(projectStartMethodFromPath("/settings?mode=template")).toBeNull();
    expect(repositoryFromProjectStartPath("/project/new?mode=repository&repo=acme%2Fapi")).toBe(
      "acme/api"
    );
    expect(
      repositoryFromProjectStartPath("/project/new?mode=repository&repo=https%3A%2F%2Fevil.example")
    ).toBeNull();
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
