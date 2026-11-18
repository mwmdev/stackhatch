import { CANVAS_EVIDENCE_LIMITS } from "@/lib/canvas-limits";
import { hasLoneSurrogate } from "@/lib/node-evidence";
import { classifyDirectory, classifyFile } from "@/lib/local-source/classify";
import type { EnumeratedFile, EnumerationResult } from "@/lib/local-source/enumerate";
import { LOCAL_SOURCE_LIMITS } from "@/lib/local-source/limits";

export const REPO_ANALYSIS_LIMITS = {
  maxSubpathSegments: 8,
  maxEvidenceCharacters: 6_000,
  requestTimeoutMs: 10_000,
} as const;

const MAX_CITABLE_BLOB_BYTES = 1_000_000;

export const GITHUB_API_ORIGIN = "https://api.github.com";
export const MAX_REPOSITORY_URL_LENGTH = 300;
export const GITHUB_REST_VERSION = "2022-11-28";

export type RepoAnalysisErrorCode =
  | "invalid_url"
  | "path_not_found"
  | "not_found_or_private"
  | "github_token_cannot_read"
  | "github_token_rejected"
  | "github_token_refused"
  | "github_access_refused"
  | "github_rate_limited"
  | "github_unavailable"
  | "aborted";

/** Failures a different or new GitHub token can fix. */
export const GITHUB_TOKEN_RECOVERABLE_CODES: ReadonlySet<RepoAnalysisErrorCode> = new Set([
  "not_found_or_private",
  "github_token_cannot_read",
  "github_token_rejected",
  "github_token_refused",
]);

export interface GitHubRateLimit {
  kind: "primary" | "secondary";
  retryAt: number | null;
  remaining: number | null;
  resetAt: number | null;
}

export class RepoAnalysisError extends Error {
  constructor(
    public readonly code: RepoAnalysisErrorCode,
    message: string,
    public readonly retryAt: number | null = null,
    public readonly rateLimit: GitHubRateLimit | null = null,
    /** Whether the failed request carried a GitHub token. */
    public readonly tokenUsed = false
  ) {
    super(message);
    this.name = "RepoAnalysisError";
  }
}

export interface GitHubRepoReference {
  owner: string;
  repo: string;
  slug: string;
  /** Branch a pasted tree link names; null means the default branch. */
  ref: string | null;
  /** Directory the scan is limited to, without outer slashes; null for the whole repository. */
  subpath: string | null;
  normalizedUrl: string;
  /** The reference as typed into a field: owner/repo, optionally with a directory. */
  shorthand: string;
}

export interface RepoReadOptions {
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
  now?: () => number;
  requestTimeoutMs?: number;
  /** Sent to api.github.com, and only there, so private repositories can be read. */
  githubToken?: string | null;
}

/** What GitHub said about one repository at one commit, before any file is read. */
export interface RepositorySnapshot {
  /** The HEAD form of the reference: repositoryUrl(slug, null, subpath). */
  normalizedUrl: string;
  owner: string;
  repo: string;
  /** Directory the listing is limited to; null for the whole repository. */
  subpath: string | null;
  defaultBranch: string;
  commitSha: string;
  description: string | null;
  primaryLanguage: string | null;
  languages: Record<string, number>;
  topics: string[];
  treeTruncated: boolean;
}

export interface RepositoryFileListing {
  snapshot: RepositorySnapshot;
  enumeration: EnumerationResult;
}

export interface GitHubQuota {
  limit: number;
  remaining: number;
  resetAt: number | null;
}

interface GitHubRepoResponse {
  description?: string | null;
  language?: string | null;
  topics?: string[];
  default_branch?: string;
}

interface GitHubTreeEntry {
  path?: string;
  mode?: string;
  type?: "blob" | "tree" | "commit";
  sha?: string;
  size?: number;
}

interface GitHubContentResponse {
  content?: string;
  encoding?: string;
  size?: number;
}

interface GitHubRequestContext {
  fetch: typeof globalThis.fetch;
  signal?: AbortSignal;
  now: () => number;
  requestTimeoutMs: number;
  /** owner/repo, for messages. */
  repository: string;
  token: string | null;
}

function isValidOwner(owner: string): boolean {
  return /^(?!-)[A-Za-z0-9-]{1,39}(?<!-)$/.test(owner);
}

function isValidRepo(repo: string): boolean {
  return /^[A-Za-z0-9_.-]{1,100}$/.test(repo) && repo !== "." && repo !== "..";
}

function isValidPathSegment(segment: string): boolean {
  return (
    segment !== "" &&
    segment !== "." &&
    segment !== ".." &&
    segment === segment.trim() &&
    !segment.includes("/") &&
    !hasLoneSurrogate(segment) &&
    !/[\\\u0000-\u001f\u007f]/.test(segment)
  );
}

/** Percent-encodes a repository path for a URL, keeping its slashes. */
export function encodeRepositoryPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function repositoryUrl(slug: string, ref: string | null, subpath: string | null): string {
  if (!ref && !subpath) return `https://github.com/${slug}`;
  const treePath = subpath ? `${ref ?? "HEAD"}/${subpath}` : (ref ?? "HEAD");
  return `https://github.com/${slug}/tree/${encodeRepositoryPath(treePath)}`;
}

/**
 * Accepts owner/repo, owner/repo/directory, and github.com repository or tree
 * links. A tree link's branch is kept so the scan can refuse one that is not
 * the default branch instead of silently reading another. Only a link has tree
 * syntax: in `owner/repo/tree/x`, `tree/x` is a directory.
 */
export function parseGitHubRepoReference(input: string): GitHubRepoReference | null {
  const value = input.trim();
  if (!value) return null;

  let segments: string[];
  // An owner has no dot, colon, or at sign, so one in the first segment marks a host.
  const isLink = /^https?:\/\//i.test(value) || /[.:@]/.test(value.split("/")[0]);
  if (isLink) {
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    let url: URL;
    try {
      url = new URL(withProtocol);
    } catch {
      return null;
    }

    if (
      url.protocol !== "https:" ||
      !/^(?:www\.)?github\.com$/i.test(url.hostname) ||
      url.port ||
      url.username ||
      url.password
    ) {
      return null;
    }

    try {
      segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    } catch {
      return null;
    }
    // On github.com only a tree link names a directory; issues, files and the rest do not.
    if (segments.length > 2 && (segments[2] !== "tree" || segments.length < 4)) return null;
  } else {
    segments = value.replace(/\/$/, "").split("/");
  }

  if (segments.length < 2) return null;
  const [owner, repoSegment, ...rest] = segments;
  const repo = repoSegment.replace(/\.git$/i, "");
  if (!isValidOwner(owner) || !isValidRepo(repo)) return null;

  const isTree = isLink && rest[0] === "tree" && rest.length >= 2;
  const namedRef = isTree ? rest[1] : null;
  const directories = isTree ? rest.slice(2) : rest;
  // A decoded segment is checked as a whole: one holding a slash would
  // re-split into other directories, or other repositories, when rebuilt.
  if (
    (namedRef !== null && !isValidPathSegment(namedRef)) ||
    directories.length > REPO_ANALYSIS_LIMITS.maxSubpathSegments ||
    !directories.every(isValidPathSegment)
  ) {
    return null;
  }

  const ref = namedRef === null || namedRef === "HEAD" ? null : namedRef;
  const subpath = directories.length > 0 ? directories.join("/") : null;
  const slug = `${owner}/${repo}`;
  const normalizedUrl = repositoryUrl(slug, ref, subpath);
  // A scan stores the HEAD form, which is longer when the link names a short branch.
  if (
    normalizedUrl.length > MAX_REPOSITORY_URL_LENGTH ||
    repositoryUrl(slug, null, subpath).length > MAX_REPOSITORY_URL_LENGTH
  ) {
    return null;
  }

  const shorthand = ref ? normalizedUrl : subpath ? `${slug}/${subpath}` : slug;
  return { owner, repo, slug, ref, subpath, normalizedUrl, shorthand };
}

/** @deprecated Prefer parseGitHubRepoReference for normalized URLs and slugs. */
export function parseGitHubUrl(input: string): { owner: string; repo: string } | null {
  const parsed = parseGitHubRepoReference(input);
  return parsed ? { owner: parsed.owner, repo: parsed.repo } : null;
}

function numericHeader(headers: Headers, name: string): number | null {
  const value = headers.get(name);
  if (value === null || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

const MAX_DATE_TIMESTAMP = 8_640_000_000_000_000;

function validTimestamp(value: number): number | null {
  return Number.isFinite(value) && value >= 0 && value <= MAX_DATE_TIMESTAMP ? value : null;
}

function retryAtFromHeaders(headers: Headers, now: number): number | null {
  const retryAfter = headers.get("retry-after")?.trim();
  if (retryAfter) {
    if (/^\d+$/.test(retryAfter)) {
      const seconds = Number(retryAfter);
      if (Number.isSafeInteger(seconds)) {
        const timestamp = validTimestamp(now + seconds * 1_000);
        if (timestamp !== null) return timestamp;
      }
    }
    const retryDate = Date.parse(retryAfter);
    const timestamp = validTimestamp(retryDate);
    if (timestamp !== null) return timestamp;
  }

  const reset = numericHeader(headers, "x-ratelimit-reset");
  return reset === null ? null : validTimestamp(reset * 1_000);
}

/**
 * GitHub answers both rate limits and refused access with 403. Only a 429, an
 * exhausted quota, a retry-after header, or a body naming a rate limit is a
 * rate limit; any other 403 means access was refused.
 */
async function isRateLimited(response: Response): Promise<boolean> {
  if (response.status === 429) return true;
  if (numericHeader(response.headers, "x-ratelimit-remaining") === 0) return true;
  if (response.headers.has("retry-after")) return true;
  try {
    return /rate limit/i.test(await response.text());
  } catch {
    return false;
  }
}

async function responseError(
  response: Response,
  context: GitHubRequestContext
): Promise<RepoAnalysisError> {
  const { repository } = context;
  const tokenUsed = context.token !== null;
  if (response.status === 404) {
    return tokenUsed
      ? new RepoAnalysisError(
          "github_token_cannot_read",
          `Your GitHub token can't read ${repository}. Check that the token includes this repository.`,
          null,
          null,
          true
        )
      : new RepoAnalysisError(
          "not_found_or_private",
          `StackHatch can't read ${repository}. If it's private, add a read-only GitHub token.`
        );
  }
  if (response.status === 401 && tokenUsed) {
    return new RepoAnalysisError(
      "github_token_rejected",
      "GitHub rejected the token. It may have expired or been revoked.",
      null,
      null,
      true
    );
  }
  if (response.status === 403 || response.status === 429) {
    if (await isRateLimited(response)) {
      const remaining = numericHeader(response.headers, "x-ratelimit-remaining");
      const reset = numericHeader(response.headers, "x-ratelimit-reset");
      const retryAt = retryAtFromHeaders(response.headers, context.now());
      const rateLimit: GitHubRateLimit = {
        kind: response.status === 403 && remaining === 0 ? "primary" : "secondary",
        retryAt,
        remaining,
        resetAt: reset === null ? null : validTimestamp(reset * 1_000),
      };
      const when = retryAt === null ? "later" : `after ${new Date(retryAt).toLocaleTimeString()}`;
      return new RepoAnalysisError(
        "github_rate_limited",
        `GitHub's API limit was reached. Try again ${when} or choose another creation method.${
          tokenUsed ? "" : " A GitHub token raises the limit."
        }`,
        retryAt,
        rateLimit,
        tokenUsed
      );
    }
    return tokenUsed
      ? new RepoAnalysisError(
          "github_token_refused",
          `GitHub refused access to ${repository}. The organization may need to approve the token.`,
          null,
          null,
          true
        )
      : new RepoAnalysisError("github_access_refused", `GitHub refused access to ${repository}.`);
  }
  return new RepoAnalysisError(
    "github_unavailable",
    "GitHub could not be reached. Try the scan again in a moment.",
    null,
    null,
    tokenUsed
  );
}

function githubUrl(path: string): URL {
  if (!path.startsWith("/")) {
    throw new RepoAnalysisError(
      "github_unavailable",
      "GitHub request construction failed. Try the scan again."
    );
  }
  const url = new URL(path, GITHUB_API_ORIGIN);
  if (url.origin !== GITHUB_API_ORIGIN) {
    throw new RepoAnalysisError(
      "github_unavailable",
      "GitHub request construction failed. Try the scan again."
    );
  }
  return url;
}

async function ghFetch<T>(
  path: string,
  context: GitHubRequestContext,
  consume: (response: Response) => Promise<T>,
  extraHeaders: HeadersInit = {}
): Promise<T> {
  if (context.signal?.aborted) {
    throw new RepoAnalysisError("aborted", "The GitHub scan was cancelled.");
  }

  const url = githubUrl(path);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), context.requestTimeoutMs);
  const forwardAbort = () => controller.abort();
  context.signal?.addEventListener("abort", forwardAbort, { once: true });
  let stopWaiting: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    const onAbort = () => reject(new DOMException("cancelled", "AbortError"));
    stopWaiting = () => controller.signal.removeEventListener("abort", onAbort);
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });

  try {
    return await Promise.race([
      (async () => {
        const response = await context.fetch(url.toString(), {
          method: "GET",
          headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": GITHUB_REST_VERSION,
            ...Object.fromEntries(new Headers(extraHeaders)),
            ...(context.token ? { Authorization: `Bearer ${context.token}` } : {}),
          },
          credentials: "omit",
          redirect: "manual",
          referrerPolicy: "no-referrer",
          signal: controller.signal,
        });

        const responseOrigin = response.url ? new URL(response.url).origin : GITHUB_API_ORIGIN;
        if (
          response.redirected ||
          (response.status >= 300 && response.status < 400 && response.status !== 304) ||
          responseOrigin !== GITHUB_API_ORIGIN
        ) {
          throw new RepoAnalysisError(
            "github_unavailable",
            "GitHub returned an unsupported redirect. Try the scan again."
          );
        }
        return consume(response);
      })(),
      aborted,
    ]);
  } catch (error) {
    if (context.signal?.aborted) {
      throw new RepoAnalysisError("aborted", "The GitHub scan was cancelled.");
    }
    if (error instanceof RepoAnalysisError) throw error;
    throw new RepoAnalysisError(
      "github_unavailable",
      "GitHub could not be reached. Try the scan again in a moment."
    );
  } finally {
    clearTimeout(timeout);
    stopWaiting?.();
    context.signal?.removeEventListener("abort", forwardAbort);
  }
}

async function withStageAbort<T>(
  context: GitHubRequestContext,
  run: (stageContext: GitHubRequestContext) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  context.signal?.addEventListener("abort", forwardAbort, { once: true });
  if (context.signal?.aborted) controller.abort();

  try {
    return await run({ ...context, signal: controller.signal });
  } catch (error) {
    controller.abort();
    throw error;
  } finally {
    context.signal?.removeEventListener("abort", forwardAbort);
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new RepoAnalysisError(
      "github_unavailable",
      "GitHub returned an unreadable response. Try the scan again in a moment."
    );
  }
}

async function getRequiredJson(path: string, context: GitHubRequestContext): Promise<unknown> {
  return ghFetch(path, context, async (response) => {
    if (!response.ok) throw await responseError(response, context);
    return readJson(response);
  });
}

function decodeBase64(content: string): string {
  try {
    const binary = atob(content.replace(/\s/g, ""));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new RepoAnalysisError(
      "github_unavailable",
      "GitHub returned unreadable repository content."
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    throw new RepoAnalysisError("github_unavailable", message);
  }
  return value;
}

function parseTreeEntries(values: unknown[]): {
  entries: GitHubTreeEntry[];
  malformed: boolean;
} {
  const entries: GitHubTreeEntry[] = [];
  let malformed = false;

  for (const value of values) {
    if (!isRecord(value)) {
      malformed = true;
      continue;
    }
    const { path, type, sha, size, mode } = value;
    const validType = type === "blob" || type === "tree" || type === "commit";
    const validPath =
      typeof path === "string" && path.length > 0 && path.length <= 4_096 && !path.includes("\0");
    const validSha = typeof sha === "string" && sha.length > 0 && sha.length <= 128;
    const validSize =
      type !== "blob" || (typeof size === "number" && Number.isSafeInteger(size) && size >= 0);

    if (!validType || !validPath || !validSha || !validSize) {
      malformed = true;
      continue;
    }
    entries.push({
      path,
      type,
      sha,
      ...(typeof size === "number" ? { size } : {}),
      ...(typeof mode === "string" ? { mode } : {}),
    });
  }

  return { entries, malformed };
}

/** The directory to scan, once the default branch can tell a tree link's branch from its path. */
function scanSubpath(reference: GitHubRepoReference, defaultBranch: string): string | null {
  if (!reference.ref) return reference.subpath;
  const treePath = reference.subpath ? `${reference.ref}/${reference.subpath}` : reference.ref;
  if (treePath === defaultBranch) return null;
  if (treePath.startsWith(`${defaultBranch}/`)) return treePath.slice(defaultBranch.length + 1);
  throw new RepoAnalysisError(
    "invalid_url",
    `StackHatch scans the default branch, ${defaultBranch}. That link names another branch.`
  );
}

/** Walks one tree per path segment; the recursive root tree of a large repository is truncated. */
async function resolveSubtreeSha(
  repoPath: string,
  rootTreeSha: string,
  subpath: string,
  context: GitHubRequestContext
): Promise<string> {
  let sha = rootTreeSha;
  for (const segment of subpath.split("/")) {
    const value = await getRequiredJson(
      `${repoPath}/git/trees/${encodeURIComponent(sha)}`,
      context
    );
    const entries =
      isRecord(value) && Array.isArray(value.tree) ? parseTreeEntries(value.tree).entries : [];
    const directory = entries.find((entry) => entry.type === "tree" && entry.path === segment);
    if (!directory?.sha) {
      throw new RepoAnalysisError(
        "path_not_found",
        `${context.repository} has no "${subpath}" directory on its default branch.`
      );
    }
    sha = directory.sha;
  }
  return sha;
}

async function readGitHubContent(
  path: string,
  maxCharacters: number,
  context: GitHubRequestContext,
  /** A 404 on a file the caller knows exists means GitHub is hiding it, not that it is absent. */
  missingIsError = false
): Promise<{ content: string | null; truncated: boolean; malformed: boolean }> {
  return ghFetch(path, context, async (response) => {
    if (response.status === 404) {
      if (missingIsError) throw await responseError(response, context);
      return { content: null, truncated: false, malformed: false };
    }
    if (!response.ok) throw await responseError(response, context);

    let value: unknown;
    try {
      value = await response.json();
    } catch {
      return { content: null, truncated: false, malformed: true };
    }
    if (!isRecord(value) || typeof value.content !== "string" || value.encoding !== "base64") {
      return { content: null, truncated: false, malformed: true };
    }

    let decoded: string;
    try {
      decoded = decodeBase64(value.content);
    } catch {
      return { content: null, truncated: false, malformed: true };
    }
    return {
      content: decoded.slice(0, maxCharacters),
      truncated: decoded.length > maxCharacters,
      malformed: false,
    };
  });
}

async function allSettledWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  task: (value: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { status: "fulfilled", value: await task(values[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

/** Where a scanned revision's files are browsed on github.com, ending in a slash. */
export function repositoryBlobBaseUrl(repositoryUrl: string, commitSha: string): string | null {
  const parsed = parseGitHubRepoReference(repositoryUrl);
  // Imported data can hold a string that encodeURIComponent throws on.
  if (!parsed || !commitSha || hasLoneSurrogate(commitSha)) return null;
  return `https://github.com/${parsed.slug}/blob/${encodeURIComponent(commitSha)}/`;
}

export interface RepoSourceFile {
  path: string;
  content: string;
  truncated: boolean;
}

/**
 * Reads files at one revision, each bounded like scan evidence. `omitted` lists
 * the paths that returned nothing, such as directories, binary files, or reads
 * that failed. A failure is thrown when it leaves nothing to return, so a
 * private repository without its token reads as an access problem.
 */
export async function readRepositoryFiles(
  repositoryUrl: string,
  commitSha: string,
  paths: readonly string[],
  options: RepoReadOptions = {}
): Promise<{ files: RepoSourceFile[]; omitted: string[] }> {
  const parsed = parseGitHubRepoReference(repositoryUrl);
  if (!parsed || !commitSha) {
    throw new RepoAnalysisError("invalid_url", "This map has no scanned repository revision.");
  }

  const context: GitHubRequestContext = {
    fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
    signal: options.signal,
    now: options.now ?? Date.now,
    requestTimeoutMs: options.requestTimeoutMs ?? REPO_ANALYSIS_LIMITS.requestTimeoutMs,
    repository: parsed.slug,
    token: options.githubToken?.trim() || null,
  };
  const repoPath = `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
  const requested = paths.slice(0, CANVAS_EVIDENCE_LIMITS.pathsPerNode);
  const results = await allSettledWithConcurrency(requested, 3, async (path) => ({
    path,
    ...(await readGitHubContent(
      `${repoPath}/contents/${encodeRepositoryPath(path)}?ref=${encodeURIComponent(commitSha)}`,
      REPO_ANALYSIS_LIMITS.maxEvidenceCharacters,
      context,
      true
    )),
  }));

  const files: RepoSourceFile[] = [];
  const omitted: string[] = [];
  let failure: unknown;
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      if (result.reason instanceof RepoAnalysisError && result.reason.code === "aborted") {
        throw result.reason;
      }
      failure ??= result.reason;
      omitted.push(requested[index]);
    } else if (result.value.content === null) {
      omitted.push(result.value.path);
    } else {
      files.push({
        path: result.value.path,
        content: result.value.content,
        truncated: result.value.truncated,
      });
    }
  });
  if (files.length === 0 && failure) throw failure;
  return { files, omitted };
}

function requestContext(repository: string, options: RepoReadOptions): GitHubRequestContext {
  return {
    fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
    signal: options.signal,
    now: options.now ?? Date.now,
    requestTimeoutMs: options.requestTimeoutMs ?? REPO_ANALYSIS_LIMITS.requestTimeoutMs,
    repository,
    token: options.githubToken?.trim() || null,
  };
}

function unreadableContent(): RepoAnalysisError {
  return new RepoAnalysisError(
    "github_unavailable",
    "GitHub returned unreadable repository content."
  );
}

function base64Bytes(content: string): Uint8Array {
  try {
    const binary = atob(content.replace(/\s/g, ""));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw unreadableContent();
  }
}

async function readBlob(
  repoPath: string,
  sha: string,
  context: GitHubRequestContext,
  signal: AbortSignal
): Promise<Blob> {
  const value = await ghFetch(
    `${repoPath}/git/blobs/${encodeURIComponent(sha)}`,
    { ...context, signal },
    async (response) => {
      if (!response.ok) throw await responseError(response, context);
      return readJson(response);
    }
  );
  if (!isRecord(value) || typeof value.content !== "string" || value.encoding !== "base64") {
    throw unreadableContent();
  }
  return new Blob([base64Bytes(value.content) as BlobPart]);
}

/**
 * Lists the files a repository map could read, without reading any of them.
 * Each returned file's `open` reads its blob, one GitHub request per file.
 */
export async function listRepositoryFiles(
  repository: string,
  options: RepoReadOptions = {}
): Promise<RepositoryFileListing> {
  const parsed = parseGitHubRepoReference(repository);
  if (!parsed) {
    throw new RepoAnalysisError(
      "invalid_url",
      "Enter a GitHub repository as owner/repo or a github.com URL."
    );
  }

  const now = options.now ?? Date.now;
  const start = now();
  const context = requestContext(parsed.slug, options);
  const repoPath = `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
  const repoValue = await getRequiredJson(repoPath, context);
  if (!isRecord(repoValue)) {
    throw new RepoAnalysisError(
      "github_unavailable",
      "GitHub returned malformed repository metadata."
    );
  }
  const repoData = repoValue as GitHubRepoResponse;

  const defaultBranch = requiredString(
    repoData.default_branch,
    "GitHub did not return a default branch for this repository."
  );
  const subpath = scanSubpath(parsed, defaultBranch);
  const root = subpath ? `${subpath}/` : "";

  const [languagesValue, commitValue] = await withStageAbort(context, (stageContext) =>
    Promise.all([
      getRequiredJson(`${repoPath}/languages`, stageContext),
      getRequiredJson(`${repoPath}/commits/${encodeURIComponent(defaultBranch)}`, stageContext),
    ])
  );
  if (!isRecord(languagesValue)) {
    throw new RepoAnalysisError("github_unavailable", "GitHub returned malformed languages.");
  }
  const languages = Object.fromEntries(
    Object.entries(languagesValue).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] >= 0
    )
  );
  if (Object.keys(languages).length !== Object.keys(languagesValue).length) {
    throw new RepoAnalysisError("github_unavailable", "GitHub returned malformed languages.");
  }

  if (!isRecord(commitValue) || !isRecord(commitValue.commit)) {
    throw new RepoAnalysisError(
      "github_unavailable",
      "GitHub did not return a complete revision for this repository."
    );
  }
  const commitTree = commitValue.commit.tree;
  const treeSha =
    isRecord(commitTree) && typeof commitTree.sha === "string" ? commitTree.sha : undefined;
  const commitSha = typeof commitValue.sha === "string" ? commitValue.sha : undefined;
  if (!commitSha || !treeSha) {
    throw new RepoAnalysisError(
      "github_unavailable",
      "GitHub did not return a complete revision for this repository."
    );
  }

  const scopeTreeSha = subpath
    ? await resolveSubtreeSha(repoPath, treeSha, subpath, context)
    : treeSha;
  const treeValue = await getRequiredJson(
    `${repoPath}/git/trees/${encodeURIComponent(scopeTreeSha)}?recursive=1`,
    context
  );
  if (!isRecord(treeValue) || !Array.isArray(treeValue.tree)) {
    throw new RepoAnalysisError(
      "github_unavailable",
      "GitHub returned a malformed repository tree."
    );
  }
  const parsedTree = parseTreeEntries(treeValue.tree);
  const normalizedUrl = repositoryUrl(parsed.slug, null, subpath);

  const listLimit = LOCAL_SOURCE_LIMITS.reportListLimit;
  const files: EnumeratedFile[] = [];
  const excludedFiles: EnumerationResult["excludedFiles"] = [];
  const excludedFileCounts: EnumerationResult["excludedFileCounts"] = {};
  const excludedDirectorySet = new Set<string>();
  const excludedDirectories: EnumerationResult["excludedDirectories"] = [];
  const excludeFile = (path: string, reason: keyof typeof excludedFileCounts) => {
    excludedFileCounts[reason] = (excludedFileCounts[reason] ?? 0) + 1;
    if (excludedFiles.length < listLimit) excludedFiles.push({ path, reason });
  };

  for (const entry of parsedTree.entries) {
    if (entry.type === "tree") continue;
    const path = root + entry.path!;
    // Submodules and symlinks have no file content of their own to read.
    if (entry.type === "commit" || entry.mode === "120000") {
      excludeFile(path, "unrecognized");
      continue;
    }
    const segments = entry.path!.split("/").slice(0, -1);
    const excludedAt = segments.findIndex((segment) => classifyDirectory(segment) !== null);
    if (excludedAt >= 0) {
      const directory = root + segments.slice(0, excludedAt + 1).join("/");
      if (!excludedDirectorySet.has(directory)) {
        excludedDirectorySet.add(directory);
        if (excludedDirectories.length < listLimit) {
          excludedDirectories.push({
            path: directory,
            reason: classifyDirectory(segments[excludedAt])!,
          });
        }
      }
      continue;
    }
    const size = entry.size ?? 0;
    const verdict = classifyFile(path, size);
    if ("excluded" in verdict) {
      excludeFile(path, verdict.excluded);
      continue;
    }
    // The Contents API, which "Ask about these files" uses, returns no base64 above 1 MB.
    if (size > MAX_CITABLE_BLOB_BYTES) {
      excludeFile(path, "too-large");
      continue;
    }
    const sha = entry.sha!;
    files.push({
      path,
      size,
      language: verdict.language,
      open: (signal) => readBlob(repoPath, sha, context, signal),
    });
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return {
    snapshot: {
      normalizedUrl,
      owner: parsed.owner,
      repo: parsed.repo,
      subpath,
      defaultBranch,
      commitSha,
      description: typeof repoData.description === "string" ? repoData.description : null,
      primaryLanguage: typeof repoData.language === "string" ? repoData.language : null,
      languages,
      topics: Array.isArray(repoData.topics)
        ? repoData.topics
            .filter((topic): topic is string => typeof topic === "string")
            .slice(0, 100)
        : [],
      treeTruncated: treeValue.truncated === true || parsedTree.malformed,
    },
    enumeration: {
      folderName: normalizedUrl,
      files,
      excludedFiles,
      excludedFileCounts,
      excludedDirectories,
      excludedDirectoryCount: excludedDirectorySet.size,
      unreadable: [],
      unreadableCount: 0,
      entriesSeen: treeValue.tree.length,
      elapsedMs: now() - start,
    },
  };
}

function quotaNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** The remaining REST quota; reading it does not count against the limit. Null when unreadable. */
export async function readGitHubQuota(options: RepoReadOptions = {}): Promise<GitHubQuota | null> {
  const context = requestContext("GitHub", options);
  try {
    const value = await ghFetch("/rate_limit", context, async (response) =>
      response.ok ? readJson(response) : null
    );
    const core = isRecord(value) && isRecord(value.resources) ? value.resources.core : null;
    if (!isRecord(core)) return null;
    const limit = quotaNumber(core.limit);
    const remaining = quotaNumber(core.remaining);
    const reset = quotaNumber(core.reset);
    if (limit === null || remaining === null || reset === null) return null;
    return { limit, remaining, resetAt: reset * 1000 };
  } catch (error) {
    if (error instanceof RepoAnalysisError && error.code === "aborted") throw error;
    return null;
  }
}
