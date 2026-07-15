import {
  isProjectStartMethod,
  markProjectStart,
  type ProjectStartMethod,
} from "@/lib/project-start";

export const ANALYTICS_EVENT_NAMES = [
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
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

export const ANALYTICS_LOCATIONS = [
  "hero",
  "final",
  "navigation",
  "login",
  "dashboard",
  "settings",
  "editor",
] as const;

export type AnalyticsLocation = (typeof ANALYTICS_LOCATIONS)[number];

export const ANALYTICS_ERROR_CATEGORIES = [
  "invalid_url",
  "not_found_or_private",
  "github_rate_limit",
  "analysis_limit",
  "missing_key",
  "provider_auth",
  "provider_rate_limit",
  "provider_unavailable",
  "network",
  "server",
  "unknown",
] as const;

export type AnalyticsErrorCategory = (typeof ANALYTICS_ERROR_CATEGORIES)[number];

export interface AnalyticsProperties {
  location?: AnalyticsLocation;
  error_category?: AnalyticsErrorCategory;
  start_method?: ProjectStartMethod;
}

type UmamiPayload = Record<string, unknown>;

interface UmamiTracker {
  track: {
    (eventName: string, data?: Record<string, string>): void;
    (payloadBuilder: (payload: UmamiPayload) => UmamiPayload): void;
  };
}

declare global {
  interface Window {
    umami?: UmamiTracker;
  }
}

const locations = new Set<string>(ANALYTICS_LOCATIONS);
const errorCategories = new Set<string>(ANALYTICS_ERROR_CATEGORIES);

function sanitizeProperties(properties?: AnalyticsProperties): Record<string, string> | undefined {
  if (!properties) return undefined;

  const safe: Record<string, string> = {};
  if (properties.location && locations.has(properties.location)) {
    safe.location = properties.location;
  }
  if (properties.error_category && errorCategories.has(properties.error_category)) {
    safe.error_category = properties.error_category;
  }
  if (properties.start_method && isProjectStartMethod(properties.start_method)) {
    safe.start_method = properties.start_method;
  }

  return Object.keys(safe).length > 0 ? safe : undefined;
}

function sanitizePath(pathname: string) {
  const path = pathname.split(/[?#]/, 1)[0];
  return path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

function privacySafePayload(payload: UmamiPayload, pathname: string): UmamiPayload {
  const safe: UmamiPayload = {
    website: payload.website,
    url: sanitizePath(pathname),
  };

  for (const key of ["hostname", "language", "screen"] as const) {
    if (typeof payload[key] === "string") safe[key] = payload[key];
  }

  return safe;
}

export function trackEvent(eventName: AnalyticsEventName, properties?: AnalyticsProperties) {
  if (typeof window === "undefined" || !window.umami) return false;

  const data = sanitizeProperties(properties);
  window.umami.track((payload) => ({
    ...privacySafePayload(payload, window.location.pathname),
    name: eventName,
    ...(data ? { data } : {}),
  }));
  return true;
}

export function trackPageView(pathname: string) {
  if (typeof window === "undefined" || !window.umami) return false;

  window.umami.track((payload) => privacySafePayload(payload, pathname));
  return true;
}

const AUTH_PENDING_KEY = "stackhatch:auth-pending";

export function markAuthenticationStarted(startMethod?: ProjectStartMethod) {
  if (typeof window === "undefined") return;
  if (startMethod) markProjectStart(startMethod);
  window.sessionStorage.setItem(AUTH_PENDING_KEY, "1");
}

export function consumeAuthenticationStarted() {
  if (typeof window === "undefined") return false;
  const pending = window.sessionStorage.getItem(AUTH_PENDING_KEY) === "1";
  window.sessionStorage.removeItem(AUTH_PENDING_KEY);
  return pending;
}
