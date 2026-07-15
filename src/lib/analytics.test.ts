import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANALYTICS_EVENT_NAMES,
  consumeAuthenticationStarted,
  markAuthenticationStarted,
  trackEvent,
  trackPageView,
} from "./analytics";

describe("analytics", () => {
  const track = vi.fn();

  beforeEach(() => {
    track.mockReset();
    window.history.replaceState({}, "", "/");
    window.umami = { track };
    window.sessionStorage.clear();
  });

  it("keeps the launch funnel event contract explicit", () => {
    expect(ANALYTICS_EVENT_NAMES).toEqual([
      "project_start_selected",
      "repository_intent_submitted",
      "github_auth_started",
      "github_auth_completed",
      "anthropic_setup_started",
      "anthropic_setup_completed",
      "repository_scan_started",
      "repository_scan_succeeded",
      "repository_scan_failed",
      "first_map_viewed",
      "architecture_question_sent",
      "alternatives_opened",
      "repository_rescan_started",
      "github_source_clicked",
      "github_star_clicked",
    ]);
  });

  it("sends only the fixed event properties", () => {
    trackEvent("repository_scan_failed", {
      location: "editor",
      error_category: "github_rate_limit",
      start_method: "repository",
      repo: "private/repo",
    } as never);

    const builder = track.mock.calls[0][0] as (payload: Record<string, unknown>) => unknown;
    expect(builder({ website: "site-id", referrer: "/app?repo=private/repo" })).toEqual({
      website: "site-id",
      url: "/",
      name: "repository_scan_failed",
      data: {
        location: "editor",
        error_category: "github_rate_limit",
        start_method: "repository",
      },
    });
  });

  it("does not track invalid property values", () => {
    trackEvent("repository_intent_submitted", {
      location: "owner/repo",
      error_category: "raw server response",
      start_method: "raw requirements",
    } as never);

    const builder = track.mock.calls[0][0] as (payload: Record<string, unknown>) => unknown;
    expect(builder({ website: "site-id", referrer: "https://example.test/private" })).toEqual({
      website: "site-id",
      url: "/",
      name: "repository_intent_submitted",
    });
  });

  it("tracks a pathname without its query string or fragment", () => {
    trackPageView("/app?repo=acme/private#map");

    const builder = track.mock.calls[0][0] as (payload: Record<string, unknown>) => unknown;
    expect(
      builder({ website: "site-id", referrer: "https://example.test/?repo=private/repo" })
    ).toEqual({
      website: "site-id",
      url: "/app",
    });
  });

  it("records authentication completion with only the start method", () => {
    markAuthenticationStarted("requirements");

    expect(window.sessionStorage.getItem("stackhatch:auth-pending")).toBe("1");
    expect(window.sessionStorage.getItem("stackhatch:project-start-method")).toBe("requirements");
    expect(consumeAuthenticationStarted()).toBe(true);
    expect(consumeAuthenticationStarted()).toBe(false);
  });
});
