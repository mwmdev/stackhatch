import { canonicalProjectStartPath } from "@/lib/project-start";

const APP_RESUME_MARKER = "resume";

export const APP_RESUME_RECOVERY_PATH = "/app?resumeRecovery=1";

export function buildAppResumeProjectPath(
  projectId: string,
  { recoverable = true }: { recoverable?: boolean } = {}
) {
  const projectPath = `/project/${encodeURIComponent(projectId)}`;
  return recoverable ? `${projectPath}?${APP_RESUME_MARKER}=1` : projectPath;
}

export function appDestinationForBrowserUrl(browserUrl: string, serverDestination: string) {
  return canonicalProjectStartPath(browserUrl) ?? serverDestination;
}

export function hasAppResumeMarker(search: string) {
  return new URLSearchParams(search).get(APP_RESUME_MARKER) === "1";
}

export function withoutAppResumeMarker(path: string) {
  const parsed = new URL(path, "https://stackhatch.io");
  parsed.searchParams.delete(APP_RESUME_MARKER);
  const search = parsed.searchParams.toString();
  return `${parsed.pathname}${search ? `?${search}` : ""}${parsed.hash}`;
}
