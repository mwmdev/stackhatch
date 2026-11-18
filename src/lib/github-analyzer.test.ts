import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GITHUB_API_ORIGIN,
  GITHUB_REST_VERSION,
  listRepositoryFiles,
  readGitHubQuota,
  RepoAnalysisError,
  parseGitHubRepoReference,
  repositoryBlobBaseUrl,
  readRepositoryFiles,
} from "@/lib/github-analyzer";

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...Object.fromEntries(new Headers(headers)) },
  });
}

function base64(content: string): string {
  return btoa(content);
}

function blobText(blob: Blob): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsText(blob);
  return promise;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseGitHubRepoReference", () => {
  it.each([
    "acme/architecture",
    "acme/architecture/",
    "github.com/acme/architecture",
    "https://github.com/acme/architecture",
    "https://www.github.com/acme/architecture.git",
  ])("normalizes %s", (input) => {
    expect(parseGitHubRepoReference(input)).toEqual({
      owner: "acme",
      repo: "architecture",
      slug: "acme/architecture",
      ref: null,
      subpath: null,
      normalizedUrl: "https://github.com/acme/architecture",
      shorthand: "acme/architecture",
    });
  });

  it.each([
    "",
    "https://gitlab.com/acme/architecture",
    "https://github.com/acme/architecture/issues",
    "https://github.com:8443/acme/architecture",
    "https://api.github.com/acme/architecture",
    "https://user:secret@github.com/acme/architecture",
    "github.com/acme",
    "-invalid/repo",
    "acme/repo name",
    "https://github.com/acme/architecture/blob/main/src/app.ts",
    "acme/architecture/../secrets",
    "acme/architecture/a/b/c/d/e/f/g/h/i",
    "https://github.com/acme/app/tree/main/x%2F..%2F..%2Fvictim",
    "https://github.com/acme/app/tree/main/a%2Fb",
    "https://github.com/acme/app/tree/main/%ED%A0%80",
    `https://github.com/acme/app/tree/dev/${"a".repeat(263)}`,
  ])("rejects %s", (input) => {
    expect(parseGitHubRepoReference(input)).toBeNull();
  });

  it.each([
    [
      "acme/app/packages/api",
      null,
      "packages/api",
      "https://github.com/acme/app/tree/HEAD/packages/api",
      "acme/app/packages/api",
    ],
    [
      "https://github.com/acme/app/tree/main/packages/api",
      "main",
      "packages/api",
      "https://github.com/acme/app/tree/main/packages/api",
      "https://github.com/acme/app/tree/main/packages/api",
    ],
    [
      "https://github.com/acme/app/tree/HEAD/docs%20site",
      null,
      "docs site",
      "https://github.com/acme/app/tree/HEAD/docs%20site",
      "acme/app/docs site",
    ],
    ["acme/app/tree", null, "tree", "https://github.com/acme/app/tree/HEAD/tree", "acme/app/tree"],
    [
      "acme/app/tree/main",
      null,
      "tree/main",
      "https://github.com/acme/app/tree/HEAD/tree/main",
      "acme/app/tree/main",
    ],
  ])("reads the directory in %s", (input, ref, subpath, normalizedUrl, shorthand) => {
    expect(parseGitHubRepoReference(input)).toMatchObject({
      slug: "acme/app",
      ref,
      subpath,
      normalizedUrl,
      shorthand,
    });
    // Stored URLs and prefilled shorthands must parse back to the same scan.
    expect(parseGitHubRepoReference(normalizedUrl)?.normalizedUrl).toBe(normalizedUrl);
    expect(parseGitHubRepoReference(shorthand)?.normalizedUrl).toBe(normalizedUrl);
  });

  it("keeps the branch a link names so a scan can refuse it", () => {
    expect(parseGitHubRepoReference("github.com/acme/app/tree/next/docs")).toMatchObject({
      ref: "next",
      subpath: "docs",
    });
  });
});

describe("listRepositoryFiles", () => {
  it("lists eligible files without fetching their contents, then opens blobs on demand", async () => {
    const responses: Record<string, Response> = {
      "/repos/acme/app": jsonResponse({ default_branch: "main" }),
      "/repos/acme/app/languages": jsonResponse({ TypeScript: 1 }),
      "/repos/acme/app/commits/main": jsonResponse({ sha: "abc123", commit: { tree: { sha: "root" } } }),
      "/repos/acme/app/git/trees/root?recursive=1": jsonResponse({ truncated: true, tree: [
        { path: "src/server.ts", type: "blob", sha: "server", size: 10 },
        { path: "node_modules/x/i.js", type: "blob", sha: "ignored", size: 1 },
        { path: "package-lock.json", type: "blob", sha: "lock", size: 1 },
        { path: "logo.png", type: "blob", sha: "image", size: 1 },
        { path: "link.ts", type: "blob", mode: "120000", sha: "link", size: 1 },
        { path: "submodule", type: "commit", sha: "sub" },
      ] }),
      "/repos/acme/app/git/blobs/server": jsonResponse({ encoding: "base64", content: base64("server text") }),
    };
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      return responses[url.pathname + url.search]?.clone() ?? jsonResponse({}, 404);
    });
    const { snapshot, enumeration } = await listRepositoryFiles("acme/app", { fetch: fetchMock });
    expect(fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname + new URL(String(input)).search).sort()).toEqual([
      "/repos/acme/app", "/repos/acme/app/commits/main", "/repos/acme/app/git/trees/root?recursive=1", "/repos/acme/app/languages",
    ]);
    expect(snapshot.treeTruncated).toBe(true);
    expect(enumeration.files.map((file) => file.path)).toEqual(["src/server.ts"]);
    expect(enumeration.excludedDirectoryCount).toBe(1);
    expect(enumeration.excludedFileCounts).toMatchObject({ lockfile: 1, binary: 1, unrecognized: 2 });
    expect(await blobText(await enumeration.files[0].open(new AbortController().signal))).toBe("server text");
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toBe("https://api.github.com/repos/acme/app/git/blobs/server");
  });

  it("reads available quota and tolerates an unavailable quota endpoint", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request) => jsonResponse({ resources: { core: {
      limit: 60, remaining: 54, reset: 1794989321,
    } } }));
    await expect(readGitHubQuota({ fetch: fetchMock })).resolves.toEqual({
      limit: 60, remaining: 54, resetAt: 1794989321000,
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.github.com/rate_limit");
    await expect(readGitHubQuota({ fetch: vi.fn(async () => jsonResponse({}, 500)) })).resolves.toBeNull();
  });

  it("binds the native browser fetch receiver", async () => {
    const nativeStyleFetch = vi.fn(function (this: typeof globalThis) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(jsonResponse({}, 404));
    });
    vi.stubGlobal("fetch", nativeStyleFetch);

    await expect(listRepositoryFiles("acme/app")).rejects.toMatchObject({
      code: "not_found_or_private",
    });
    expect(nativeStyleFetch).toHaveBeenCalledOnce();
  });

  it("uses the exact anonymous GitHub request surface", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, 404));

    await expect(listRepositoryFiles("acme/app", { fetch: fetchMock })).rejects.toMatchObject({
      code: "not_found_or_private",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [[input, init]] = fetchMock.mock.calls as unknown as [
      [string | URL | Request, RequestInit | undefined],
    ];
    expect(String(input)).toBe(`${GITHUB_API_ORIGIN}/repos/acme/app`);
    expect(init).toMatchObject({
      method: "GET",
      credentials: "omit",
      redirect: "manual",
      referrerPolicy: "no-referrer",
    });
    const headers = new Headers(init?.headers);
    expect(Object.fromEntries(headers)).toEqual({
      accept: "application/vnd.github+json",
      "x-github-api-version": GITHUB_REST_VERSION,
    });
  });

  it("refuses redirects and cross-origin response URLs without following them", async () => {
    const redirectFetch = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "https://evil.example/steal" },
        })
    );

    await expect(listRepositoryFiles("acme/app", { fetch: redirectFetch })).rejects.toMatchObject({
      code: "github_unavailable",
    });
    expect(redirectFetch).toHaveBeenCalledTimes(1);

    const crossOriginResponse = jsonResponse({ default_branch: "main" });
    Object.defineProperty(crossOriginResponse, "url", {
      value: "https://evil.example/repos/acme/app",
    });
    const crossOriginFetch = vi.fn(async () => crossOriginResponse);

    await expect(listRepositoryFiles("acme/app", { fetch: crossOriginFetch })).rejects.toMatchObject({
      code: "github_unavailable",
    });
    expect(crossOriginFetch).toHaveBeenCalledTimes(1);
  });

  it("does not dispatch when the scan was already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn();

    await expect(
      listRepositoryFiles("acme/app", { fetch: fetchMock, signal: controller.signal })
    ).rejects.toMatchObject({ code: "aborted" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cancels a stalled response body after headers have arrived", async () => {
    const controller = new AbortController();
    let headersArrived!: () => void;
    const headers = new Promise<void>((resolve) => {
      headersArrived = resolve;
    });
    const fetchMock = vi.fn(async () => {
      headersArrived();
      return new Response(
        new ReadableStream({
          start() {
            /* body intentionally never completes */
          },
        }),
        { status: 200 }
      );
    });
    const scan = listRepositoryFiles("acme/app", { fetch: fetchMock, signal: controller.signal });
    await headers;
    controller.abort();
    await expect(scan).rejects.toMatchObject({ code: "aborted" });
  });

  it("times out a stalled response body after headers have arrived", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start() {
              /* body intentionally never completes */
            },
          }),
          { status: 200 }
        )
    );
    await expect(
      listRepositoryFiles("acme/app", { fetch: fetchMock, requestTimeoutMs: 10 })
    ).rejects.toMatchObject({
      code: "github_unavailable",
    });
  });


  it.each([
    [404, {}, {}, "not_found_or_private"],
    [403, { "X-RateLimit-Remaining": "0" }, {}, "github_rate_limited"],
    [403, { "Retry-After": "60" }, {}, "github_rate_limited"],
    [403, {}, { message: "You have exceeded a secondary rate limit." }, "github_rate_limited"],
    [403, { "X-RateLimit-Remaining": "4999" }, { message: "Forbidden" }, "github_access_refused"],
    [429, {}, {}, "github_rate_limited"],
    [401, {}, {}, "github_unavailable"],
    [502, {}, {}, "github_unavailable"],
  ] as const)(
    "maps anonymous GitHub status %s %j %j to %s",
    async (status, headers, body, code) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse(body, status, headers))
      );

      await expect(listRepositoryFiles("acme/app")).rejects.toMatchObject({
        name: "RepoAnalysisError",
        code,
        tokenUsed: false,
      } satisfies Partial<RepoAnalysisError>);
    }
  );

  it.each([
    [404, {}, {}, "github_token_cannot_read", "Your GitHub token can't read acme/app."],
    [401, {}, {}, "github_token_rejected", "GitHub rejected the token."],
    [
      403,
      { "X-RateLimit-Remaining": "4999" },
      { message: "Resource not accessible by personal access token" },
      "github_token_refused",
      "The organization may need to approve the token.",
    ],
    [403, { "X-RateLimit-Remaining": "0" }, {}, "github_rate_limited", "API limit was reached."],
  ] as const)(
    "maps GitHub status %s with a token to its own failure",
    async (status, headers, body, code, message) => {
      const fetchMock = vi.fn(async () => jsonResponse(body, status, headers));

      const failure = listRepositoryFiles("acme/app", {
        fetch: fetchMock,
        githubToken: "github_pat_secret",
      });

      await expect(failure).rejects.toMatchObject({ code, tokenUsed: true });
      await expect(failure).rejects.toHaveProperty("message", expect.stringContaining(message));
      await expect(failure).rejects.not.toHaveProperty(
        "message",
        expect.stringContaining("github_pat_secret")
      );
    }
  );

  it("tells an anonymous scan that a token raises the rate limit, and a token scan nothing more", async () => {
    const limited = () => jsonResponse({}, 403, { "X-RateLimit-Remaining": "0" });

    await expect(
      listRepositoryFiles("acme/app", { fetch: vi.fn(async () => limited()) })
    ).rejects.toHaveProperty(
      "message",
      expect.stringContaining("A GitHub token raises the limit.")
    );
    await expect(
      listRepositoryFiles("acme/app", { fetch: vi.fn(async () => limited()), githubToken: "github_pat_x" })
    ).rejects.not.toHaveProperty("message", expect.stringContaining("A GitHub token"));
  });

  it("returns a typed validation error before calling GitHub", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(listRepositoryFiles("https://gitlab.com/acme/app")).rejects.toMatchObject({
      code: "invalid_url",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a typed unavailable error for malformed required JSON", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("{not-json", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    );

    await expect(listRepositoryFiles("acme/app", { fetch: fetchMock })).rejects.toMatchObject({
      code: "github_unavailable",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("reads a private repository with the token on every request and only to GitHub", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const authorization = new Headers(init?.headers).get("authorization");
      if (authorization !== "Bearer github_pat_secret") return jsonResponse({}, 404);
      const url = new URL(String(input));
      if (url.pathname.endsWith("/languages")) return jsonResponse({ TypeScript: 1 });
      if (url.pathname.endsWith("/commits/main")) {
        return jsonResponse({ sha: "abc123", commit: { tree: { sha: "tree123" } } });
      }
      if (url.pathname.endsWith("/git/trees/tree123")) {
        return jsonResponse({
          truncated: false,
          tree: [{ path: "package.json", type: "blob", sha: "package", size: 10 }],
        });
      }
      if (url.pathname.endsWith("/git/blobs/package")) {
        return jsonResponse({ encoding: "base64", content: base64("{}") });
      }
      return jsonResponse({ private: true, visibility: "private", default_branch: "main" });
    });

    const analysis = await listRepositoryFiles("acme/private-app", {
      fetch: fetchMock,
      githubToken: " github_pat_secret ",
    });

    expect(analysis.snapshot.commitSha).toBe("abc123");
    expect(await blobText(await analysis.enumeration.files[0].open(new AbortController().signal))).toBe("{}");
    expect(fetchMock).toHaveBeenCalledTimes(5);
    for (const [input, init] of fetchMock.mock.calls) {
      expect(new URL(String(input)).origin).toBe(GITHUB_API_ORIGIN);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer github_pat_secret");
    }
  });


  it.each([
    [
      403,
      { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": "1720000000" },
      "primary",
      1_720_000_000_000,
    ],
    [429, { "Retry-After": "45" }, "secondary", 1_000_045_000],
  ] as const)(
    "exposes %s rate-limit retry metadata without retrying",
    async (status, headers, kind, retryAt) => {
      const fetchMock = vi.fn(async () => jsonResponse({}, status, headers));

      await expect(
        listRepositoryFiles("acme/app", { fetch: fetchMock, now: () => 1_000_000_000 })
      ).rejects.toMatchObject({
        code: "github_rate_limited",
        retryAt,
        rateLimit: { kind },
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );

  it("ignores an out-of-range Retry-After timestamp without throwing", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({}, 429, { "Retry-After": "999999999999999999999999999999" })
    );

    await expect(listRepositoryFiles("acme/app", { fetch: fetchMock })).rejects.toMatchObject({
      code: "github_rate_limited",
      retryAt: null,
    });
  });
});

describe("listRepositoryFiles on a directory", () => {
  const metadata: Array<[string, Response]> = [
    ["/repos/acme/app", jsonResponse({ default_branch: "main" })],
    ["/repos/acme/app/languages", jsonResponse({ TypeScript: 1 })],
    [
      "/repos/acme/app/commits/main",
      jsonResponse({ sha: "abc123", commit: { tree: { sha: "root" } } }),
    ],
    [
      "/repos/acme/app/git/trees/root",
      jsonResponse({ tree: [{ path: "packages", type: "tree", sha: "pk" }] }),
    ],
    [
      "/repos/acme/app/git/trees/pk",
      jsonResponse({ tree: [{ path: "api", type: "tree", sha: "api" }] }),
    ],
  ];

  function fetchFrom(entries: Array<[string, Response]>) {
    const responses = new Map(entries);
    return vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      return responses.get(`${url.pathname}${url.search}`)?.clone() ?? jsonResponse({}, 404);
    });
  }

  it("lists only the selected directory with repository-rooted paths", async () => {
    const fetchMock = fetchFrom([
      ...metadata,
      ["/repos/acme/app/git/trees/api?recursive=1", jsonResponse({
        tree: [{ path: "src/server.ts", type: "blob", sha: "server", size: 10 }],
      })],
    ]);
    const result = await listRepositoryFiles("https://github.com/acme/app/tree/main/packages/api", {
      fetch: fetchMock,
    });
    expect(result.snapshot).toMatchObject({
      normalizedUrl: "https://github.com/acme/app/tree/HEAD/packages/api",
      subpath: "packages/api",
    });
    expect(result.enumeration.files.map((file) => file.path)).toEqual(["packages/api/src/server.ts"]);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain(
      "https://api.github.com/repos/acme/app/git/trees/api?recursive=1"
    );
  });

  it("refuses a tree link to a branch that is not the default", async () => {
    const fetchMock = fetchFrom(metadata);

    await expect(
      listRepositoryFiles("https://github.com/acme/app/tree/next/packages/api", { fetch: fetchMock })
    ).rejects.toMatchObject({ code: "invalid_url", message: expect.stringContaining("main") });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a directory the default branch does not have", async () => {
    await expect(
      listRepositoryFiles("acme/app/packages/web", { fetch: fetchFrom(metadata) })
    ).rejects.toMatchObject({ code: "path_not_found" });
  });
});

describe("readRepositoryFiles", () => {
  it("reads text files at the scanned revision and skips everything else", async () => {
    const responses = new Map<string, Response>([
      [
        "/repos/acme/app/contents/src/app%20server.ts?ref=abc123",
        jsonResponse({ encoding: "base64", content: base64("export const server = 1;") }),
      ],
      ["/repos/acme/app/contents/src?ref=abc123", jsonResponse([{ name: "app server.ts" }])],
    ]);
    const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
      const url = new URL(String(input));
      return responses.get(`${url.pathname}${url.search}`)?.clone() ?? jsonResponse({}, 404);
    });

    const files = await readRepositoryFiles(
      "https://github.com/acme/app/tree/HEAD/src",
      "abc123",
      ["src/app server.ts", "src", "src/gone.ts"],
      { fetch: fetchMock, githubToken: "github_pat_example" }
    );

    expect(files).toEqual({
      files: [{ path: "src/app server.ts", content: "export const server = 1;", truncated: false }],
      omitted: ["src", "src/gone.ts"],
    });
    for (const [input, init] of fetchMock.mock.calls) {
      expect(new URL(String(input)).origin).toBe(GITHUB_API_ORIGIN);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer github_pat_example");
    }
  });

  it("keeps an empty file instead of treating it as missing", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ encoding: "base64", content: "" }));

    await expect(
      readRepositoryFiles("acme/app", "abc123", ["src/empty.ts"], { fetch: fetchMock })
    ).resolves.toEqual({
      files: [{ path: "src/empty.ts", content: "", truncated: false }],
      omitted: [],
    });
  });

  it("reports a private repository as an access problem rather than missing files", async () => {
    await expect(
      readRepositoryFiles("acme/app", "abc123", ["src/a.ts", "src/b.ts"], {
        fetch: vi.fn(async () => jsonResponse({ message: "Not Found" }, 404)),
      })
    ).rejects.toMatchObject({ code: "not_found_or_private" });

    await expect(
      readRepositoryFiles("acme/app", "abc123", ["src/a.ts"], {
        fetch: vi.fn(async () => jsonResponse({ message: "Not Found" }, 404)),
        githubToken: "github_pat_example",
      })
    ).rejects.toMatchObject({ code: "github_token_cannot_read" });
  });

  it("throws the GitHub failure when it leaves nothing to return", async () => {
    await expect(
      readRepositoryFiles("acme/app", "abc123", ["src/app.ts"], {
        fetch: vi.fn(async () => jsonResponse({}, 401)),
        githubToken: "github_pat_expired",
      })
    ).rejects.toMatchObject({ code: "github_token_rejected" });
  });

  it("lists files it could not read when others succeed", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) =>
      String(input).includes("good.ts")
        ? jsonResponse({ encoding: "base64", content: base64("ok") })
        : jsonResponse({}, 429, { "retry-after": "5" })
    );

    const result = await readRepositoryFiles("acme/app", "abc123", ["src/good.ts", "src/bad.ts"], {
      fetch: fetchMock,
    });

    expect(result.files.map((file) => file.path)).toEqual(["src/good.ts"]);
    expect(result.omitted).toEqual(["src/bad.ts"]);
  });

  it("withholds a blob base URL for a commit that cannot be URL-encoded", () => {
    expect(repositoryBlobBaseUrl("acme/app", "\ud800")).toBeNull();
    expect(repositoryBlobBaseUrl("acme/app", "abc123")).toBe(
      "https://github.com/acme/app/blob/abc123/"
    );
  });
});

