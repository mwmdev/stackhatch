import { describe, expect, it } from "vitest";
import {
  appDestinationForBrowserUrl,
  buildLocalProjectPath,
  parseLocalProjectId,
} from "./app-route";

describe("app route resolution", () => {
  it("keeps device-local project identifiers in the URL fragment", () => {
    expect(buildLocalProjectPath("map-1")).toBe("/project/#map-1");
  });

  it("gives valid legacy query intent precedence over the fragment and resume", () => {
    expect(
      appDestinationForBrowserUrl("/app?start=blank&repo=acme%2Fapi#start", "/project/#resumed")
    ).toBe("/project/new?mode=blank");
  });

  it("gives a legacy fragment precedence over normal resume", () => {
    expect(appDestinationForBrowserUrl("/app#start", "/project/#resumed")).toBe("/project/new");
    expect(appDestinationForBrowserUrl("/app?repo=acme%2Fapi#start", "/project/#resumed")).toBe(
      "/project/new?mode=repository#repo=acme%2Fapi"
    );
  });

  it("uses the browser-vault destination when there is no legacy intent", () => {
    expect(appDestinationForBrowserUrl("/app", "/project/#resumed")).toBe("/project/#resumed");
  });

  it("parses only one valid local identifier and never guesses", () => {
    expect(parseLocalProjectId("#map-1")).toBe("map-1");
    expect(parseLocalProjectId("#4d147562-91ff-4c63-aad0-1f8389e65042")).toBe(
      "4d147562-91ff-4c63-aad0-1f8389e65042"
    );
    expect(parseLocalProjectId("")).toBeNull();
    expect(parseLocalProjectId("#")).toBeNull();
    expect(parseLocalProjectId("#map%2Fone")).toBeNull();
    expect(parseLocalProjectId("#map-1&other=2")).toBeNull();
    expect(parseLocalProjectId("#%E0%A4%A")).toBeNull();
  });
});
