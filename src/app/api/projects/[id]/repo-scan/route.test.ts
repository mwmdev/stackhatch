import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { projects, userSettings, users, type UserRole } from "@/db/schema";
import type { AppDatabase } from "@/db";
import { encryptSecret } from "@/lib/secrets";

let testDb: AppDatabase;

const authState = vi.hoisted(() => ({
  role: "user" as UserRole,
}));

const githubMocks = vi.hoisted(() => ({
  analyzeRepo: vi.fn(),
  formatRepoAnalysis: vi.fn(() => "formatted repository analysis"),
}));

const streamMocks = vi.hoisted(() => ({
  streamChat: vi.fn(
    () =>
      new Response('data: {"type":"done"}\n\n', {
        headers: { "Content-Type": "text/event-stream" },
      })
  ),
}));

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY NOT NULL,
      github_id TEXT NOT NULL UNIQUE,
      email TEXT,
      name TEXT,
      avatar_url TEXT,
      role TEXT DEFAULT 'user' NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      repo_url TEXT,
      repo_commit_sha TEXT,
      repo_scanned_at INTEGER,
      repo_analysis_status TEXT,
      repo_analysis_warning TEXT,
      canvas_state TEXT,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    CREATE TABLE user_settings (
      user_id TEXT PRIMARY KEY NOT NULL,
      anthropic_api_key TEXT,
      model TEXT DEFAULT 'claude-sonnet-5' NOT NULL,
      theme TEXT DEFAULT 'system' NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  return drizzle(sqlite, { schema });
}

vi.mock("@/db", () => ({
  getDb: () => testDb,
}));

vi.mock("@/db/migrate", () => ({
  runMigrations: () => {},
}));

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn(() =>
    Promise.resolve({
      userId: "test-user-id",
      role: authState.role,
      name: "Test User",
      email: "test@example.com",
      image: null,
    })
  ),
}));

vi.mock("@/lib/github-analyzer", () => ({
  analyzeRepo: githubMocks.analyzeRepo,
  formatRepoAnalysis: githubMocks.formatRepoAnalysis,
}));

vi.mock("@/lib/ai/stream-chat", () => ({
  streamChat: streamMocks.streamChat,
  sseEvent: (data: object) => `data: ${JSON.stringify(data)}\n\n`,
  SSE_HEADERS: {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  },
}));

const repoScanRoute = await import("@/app/api/projects/[id]/repo-scan/route");

function makeRequest(body: unknown) {
  return new Request("http://localhost:3000/api/projects/p1/repo-scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(id = "p1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  testDb = createTestDb();
  authState.role = "user";
  vi.clearAllMocks();

  testDb
    .insert(users)
    .values({
      id: "test-user-id",
      githubId: "github-test-user",
      email: "test@example.com",
      name: "Test User",
      avatarUrl: null,
      role: "user",
      createdAt: Date.now(),
    })
    .run();

  testDb
    .insert(userSettings)
    .values({
      userId: "test-user-id",
      anthropicApiKey: encryptSecret("sk-ant-test-key"),
      model: "claude-sonnet-5",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    .run();

  testDb
    .insert(projects)
    .values({
      id: "p1",
      name: "Test Project",
      description: null,
      repoUrl: null,
      canvasState: null,
      userId: "test-user-id",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    .run();
});

describe("POST /api/projects/[id]/repo-scan", () => {
  it("returns repository analysis failures without mutating the project", async () => {
    githubMocks.analyzeRepo.mockRejectedValue(
      Object.assign(new Error("Repository not found or is private."), {
        code: "not_found_or_private",
      })
    );

    const res = await repoScanRoute.POST(
      makeRequest({ repoUrl: "https://github.com/acme/missing" }) as never,
      makeParams()
    );

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Repository not found or is private");
    expect(body).toContain('"code":"not_found_or_private"');
    expect(testDb.select().from(projects).get()?.repoUrl).toBeNull();
    expect(testDb.select().from(projects).get()?.repoCommitSha).toBeNull();
    expect(streamMocks.streamChat).not.toHaveBeenCalled();
  });

  it("does not expose unexpected analyzer error details", async () => {
    githubMocks.analyzeRepo.mockRejectedValue(new Error("secret upstream detail"));

    const response = await repoScanRoute.POST(
      makeRequest({ repoUrl: "acme/app" }) as never,
      makeParams()
    );
    const body = await response.text();

    expect(body).toContain('"code":"github_unavailable"');
    expect(body).not.toContain("secret upstream detail");
    expect(testDb.select().from(projects).get()?.repoUrl).toBeNull();
  });

  it("defers replacement until a valid architecture is generated", async () => {
    githubMocks.analyzeRepo.mockResolvedValue({
      owner: "acme",
      repo: "app",
      normalizedUrl: "https://github.com/acme/app",
      description: null,
      primaryLanguage: "TypeScript",
      languages: { TypeScript: 1000 },
      topics: [],
      defaultBranch: "main",
      commitSha: "abc123",
      treePaths: ["package.json", "src/index.ts"],
      readme: null,
      evidenceFiles: [],
      status: "partial",
      warnings: ["GitHub returned a truncated repository tree."],
    });

    const res = await repoScanRoute.POST(
      makeRequest({ repoUrl: "https://github.com/acme/app" }) as never,
      makeParams()
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Usage-Remaining")).toBeNull();
    expect(streamMocks.streamChat).toHaveBeenCalledOnce();
    expect(streamMocks.streamChat).toHaveBeenCalledWith(
      testDb,
      "p1",
      null,
      "formatted repository analysis",
      expect.objectContaining({ userId: "test-user-id" }),
      {
        contextArchitecture: null,
        repositoryScanReplacement: {
          repoUrl: "https://github.com/acme/app",
          commitSha: "abc123",
          scannedAt: expect.any(Number),
          analysisStatus: "partial",
          analysisWarning: "GitHub returned a truncated repository tree.",
        },
      }
    );
    expect(testDb.select().from(projects).get()).toMatchObject({
      repoUrl: null,
      repoCommitSha: null,
      canvasState: null,
    });
  });

  it("requires a BYOK key before repository analysis", async () => {
    testDb.delete(userSettings).run();

    const res = await repoScanRoute.POST(
      makeRequest({ repoUrl: "https://github.com/acme/app" }) as never,
      makeParams()
    );
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.code).toBe("AI_NOT_CONFIGURED");
    expect(data.settingsUrl).toBe("/settings");
    expect(githubMocks.analyzeRepo).not.toHaveBeenCalled();
  });
});
