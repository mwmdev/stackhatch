export const PROJECT_START_METHODS = ["blank", "requirements", "repository", "template"] as const;

export type ProjectStartMethod = (typeof PROJECT_START_METHODS)[number];

const PROJECT_START_METHOD_KEY = "stackhatch:project-start-method";
const BLANK_AUTO_CREATE_KEY = "stackhatch:blank-auto-create";
const REPOSITORY_SLUG_PATTERN = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/;
const PROJECT_RETURN_PATTERN = /^\/project\/[A-Za-z0-9_-]+$/;

export function isProjectStartMethod(value: unknown): value is ProjectStartMethod {
  return typeof value === "string" && PROJECT_START_METHODS.includes(value as ProjectStartMethod);
}

export function isPublicRepositorySlug(value: string) {
  return REPOSITORY_SLUG_PATTERN.test(value.trim());
}

export function safeProjectReturnPath(value: string | null | undefined) {
  if (!value || !PROJECT_RETURN_PATTERN.test(value)) return null;
  return value;
}

export function buildProjectStartChooserPath(returnTo?: string | null) {
  const safeReturnTo = safeProjectReturnPath(returnTo);
  return safeReturnTo
    ? `/project/new?returnTo=${encodeURIComponent(safeReturnTo)}`
    : "/project/new";
}

export function buildProjectStartPath(
  method: ProjectStartMethod,
  { repository, returnTo }: { repository?: string; returnTo?: string | null } = {}
) {
  const params = new URLSearchParams({ mode: method });

  if (method === "repository") {
    const slug = repository?.trim();
    if (slug && !isPublicRepositorySlug(slug)) {
      throw new Error("Repository must use the owner/repository format");
    }
    if (slug) params.set("repo", slug);
  }

  const safeReturnTo = safeProjectReturnPath(returnTo);
  if (safeReturnTo) params.set("returnTo", safeReturnTo);
  return `/project/new?${params.toString()}`;
}

export function buildProjectStartLoginUrl(method: ProjectStartMethod, repository?: string) {
  return `/login?callbackUrl=${encodeURIComponent(buildProjectStartPath(method, { repository }))}`;
}

/**
 * Return an internal application path while rejecting external and scheme-relative redirects.
 * Same-origin absolute URLs are accepted for compatibility with existing authentication links.
 */
export function safeInternalPath(
  value: string | null | undefined,
  fallback = "/app",
  siteOrigin?: string
) {
  if (!value) return fallback;

  const configuredOrigin =
    siteOrigin || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL;
  const baseOrigin = configuredOrigin || "https://stackhatch.io";

  try {
    if (value.includes("\\") || value.startsWith("//")) return fallback;
    if (!value.startsWith("/") && !configuredOrigin) return fallback;

    const base = new URL(baseOrigin);
    const parsed = new URL(value, base);
    if (parsed.origin !== base.origin) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function projectStartMethodFromPath(path: string): ProjectStartMethod | null {
  try {
    const parsed = new URL(path, "https://stackhatch.io");
    if (parsed.pathname === "/app" && parsed.searchParams.get("start") === "blank") {
      return "blank";
    }
    if (
      parsed.pathname === "/app" &&
      parsed.hash === "#start" &&
      isPublicRepositorySlug(parsed.searchParams.get("repo") || "")
    ) {
      return "repository";
    }
    if (parsed.pathname !== "/project/new") return null;

    const mode = parsed.searchParams.get("mode");
    return isProjectStartMethod(mode) ? mode : null;
  } catch {
    return null;
  }
}

export function repositoryFromProjectStartPath(path: string) {
  try {
    const parsed = new URL(path, "https://stackhatch.io");
    const isCanonical =
      parsed.pathname === "/project/new" && parsed.searchParams.get("mode") === "repository";
    const isLegacy = parsed.pathname === "/app" && parsed.hash === "#start";
    if (!isCanonical && !isLegacy) {
      return null;
    }
    const repository = parsed.searchParams.get("repo")?.trim();
    return repository && isPublicRepositorySlug(repository) ? repository : null;
  } catch {
    return null;
  }
}

export function canonicalProjectStartPath(path: string) {
  try {
    const parsed = new URL(path, "https://stackhatch.io");
    if (parsed.origin !== "https://stackhatch.io") return null;

    if (parsed.pathname === "/app" && parsed.searchParams.get("start") === "blank") {
      return buildProjectStartPath("blank");
    }
    if (parsed.pathname === "/app" && parsed.hash === "#start") {
      const repository = parsed.searchParams.get("repo")?.trim();
      return repository && isPublicRepositorySlug(repository)
        ? buildProjectStartPath("repository", { repository })
        : "/project/new";
    }
    if (parsed.pathname !== "/project/new") return null;

    const mode = parsed.searchParams.get("mode");
    const returnTo = safeProjectReturnPath(parsed.searchParams.get("returnTo"));
    if (!isProjectStartMethod(mode)) return buildProjectStartChooserPath(returnTo);

    const repository = parsed.searchParams.get("repo")?.trim();
    return buildProjectStartPath(mode, {
      repository:
        mode === "repository" && repository && isPublicRepositorySlug(repository)
          ? repository
          : undefined,
      returnTo,
    });
  } catch {
    return null;
  }
}

function getSessionStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Remember only the privacy-safe method enum, never repository or requirements content. */
export function markProjectStart(method: ProjectStartMethod) {
  const storage = getSessionStorage();
  if (!storage) return;
  storage.setItem(PROJECT_START_METHOD_KEY, method);
  if (method === "blank") {
    storage.setItem(BLANK_AUTO_CREATE_KEY, "1");
  } else {
    storage.removeItem(BLANK_AUTO_CREATE_KEY);
  }
}

export function getProjectStartMethod(): ProjectStartMethod | null {
  const storage = getSessionStorage();
  if (!storage) return null;
  const method = storage.getItem(PROJECT_START_METHOD_KEY);
  return isProjectStartMethod(method) ? method : null;
}

export function consumeProjectStartMethod(): ProjectStartMethod | null {
  const storage = getSessionStorage();
  const method = getProjectStartMethod();
  storage?.removeItem(PROJECT_START_METHOD_KEY);
  return method;
}

export function getPendingBlankProjectStart() {
  return getSessionStorage()?.getItem(BLANK_AUTO_CREATE_KEY) === "1";
}

/** Consume the one-time auto-create marker without losing the funnel method. */
export function consumePendingBlankProjectStart() {
  const storage = getSessionStorage();
  const pending = storage?.getItem(BLANK_AUTO_CREATE_KEY) === "1";
  storage?.removeItem(BLANK_AUTO_CREATE_KEY);
  return pending;
}

// Intent-focused aliases keep call sites readable at the two distinct consume points.
export const rememberProjectStart = markProjectStart;
export const getPendingProjectStart = getProjectStartMethod;
export const consumePendingProjectStart = consumeProjectStartMethod;
export const consumeBlankAutoCreateIntent = consumePendingBlankProjectStart;
