import { canonicalProjectStartPath } from "@/lib/project-start";

const LOCAL_PROJECT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function buildLocalProjectPath(projectId: string) {
  if (!LOCAL_PROJECT_ID_PATTERN.test(projectId)) {
    throw new Error("Project ID contains unsupported characters");
  }
  return `/project/#${encodeURIComponent(projectId)}`;
}

export function parseLocalProjectId(fragment: string) {
  if (!fragment.startsWith("#") || fragment.length === 1) return null;
  try {
    const projectId = decodeURIComponent(fragment.slice(1));
    return LOCAL_PROJECT_ID_PATTERN.test(projectId) ? projectId : null;
  } catch {
    return null;
  }
}

export function appDestinationForBrowserUrl(browserUrl: string, serverDestination: string) {
  return canonicalProjectStartPath(browserUrl) ?? serverDestination;
}
