import { describe, expect, it } from "vitest";
import {
  APP_RESUME_RECOVERY_PATH,
  appDestinationForBrowserUrl,
  buildAppResumeProjectPath,
  hasAppResumeMarker,
} from "./app-route";

describe("app route resolution", () => {
  it("marks the first resume destination but not a recovery destination", () => {
    expect(buildAppResumeProjectPath("map-1")).toBe("/project/map-1?resume=1");
    expect(buildAppResumeProjectPath("map-1", { recoverable: false })).toBe("/project/map-1");
  });

  it("gives valid legacy query intent precedence over the fragment and resume", () => {
    expect(
      appDestinationForBrowserUrl(
        "/app?start=blank&repo=acme%2Fapi#start",
        "/project/resumed?resume=1"
      )
    ).toBe("/project/new?mode=blank");
  });

  it("gives a legacy fragment precedence over normal resume", () => {
    expect(appDestinationForBrowserUrl("/app#start", "/project/resumed?resume=1")).toBe(
      "/project/new"
    );
    expect(
      appDestinationForBrowserUrl("/app?repo=acme%2Fapi#start", "/project/resumed?resume=1")
    ).toBe("/project/new?mode=repository&repo=acme%2Fapi");
  });

  it("uses the validated server destination when there is no legacy intent", () => {
    expect(appDestinationForBrowserUrl("/app", "/project/resumed?resume=1")).toBe(
      "/project/resumed?resume=1"
    );
  });

  it("recognizes only the exact one-time resume marker", () => {
    expect(hasAppResumeMarker("?resume=1")).toBe(true);
    expect(hasAppResumeMarker("?resume=0")).toBe(false);
    expect(hasAppResumeMarker("?resume=1&other=value")).toBe(true);
    expect(APP_RESUME_RECOVERY_PATH).toBe("/app?resumeRecovery=1");
  });
});
