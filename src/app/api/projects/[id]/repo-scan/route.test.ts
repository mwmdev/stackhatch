import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { projects, usage, users, type UserRole } from "@/db/schema";
import type { AppDatabase } from "@/db";

let testDb: AppDatabase;

const authState = vi.hoisted(() => ({
  role: "free" as UserRole,
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
      role TEXT DEFAULT 'free' NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      repo_url TEXT,
      canvas_state TEXT,
      user_id TEXT,
      team_id TEXT,
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
    CREATE TABLE usage (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      message_count INTEGER DEFAULT 0 NOT NULL,
      scan_count INTEGER DEFAULT 0 NOT NULL,
      period_start INTEGER NOT NULL,
      period_end INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE subscriptions (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      plan TEXT DEFAULT 'free' NOT NULL,
      billing_interval TEXT DEFAULT 'monthly',
      status TEXT NOT NULL,
      current_period_end INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE teams (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      plan TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      stripe_subscription_id TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE team_members (
      team_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      joined_at INTEGER NOT NULL,
      PRIMARY KEY(team_id, user_id),
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
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

function getUsageRecord() {
  return testDb.select().from(usage).where(eq(usage.userId, "test-user-id")).get();
}

beforeEach(() => {
  testDb = createTestDb();
  authState.role = "free";
  vi.clearAllMocks();

  testDb
    .insert(users)
    .values({
      id: "test-user-id",
      githubId: "github-test-user",
      email: "test@example.com",
      name: "Test User",
      avatarUrl: null,
      role: "free",
      createdAt: Date.now(),
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
      teamId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    .run();
});

describe("POST /api/projects/[id]/repo-scan", () => {
  it("does not increment scan usage when repository analysis fails", async () => {
    githubMocks.analyzeRepo.mockRejectedValue(new Error("Repository not found or is private"));

    const res = await repoScanRoute.POST(
      makeRequest({ repoUrl: "https://github.com/acme/missing" }) as never,
      makeParams()
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Repository not found or is private");
    expect(getUsageRecord()?.scanCount ?? 0).toBe(0);
    expect(streamMocks.streamChat).not.toHaveBeenCalled();
  });

  it("increments scan usage after repository analysis succeeds", async () => {
    githubMocks.analyzeRepo.mockResolvedValue({
      owner: "acme",
      repo: "app",
      description: null,
      primaryLanguage: "TypeScript",
      languages: { TypeScript: 1000 },
      topics: [],
      packageFiles: [],
    });

    const res = await repoScanRoute.POST(
      makeRequest({ repoUrl: "https://github.com/acme/app" }) as never,
      makeParams()
    );

    expect(res.status).toBe(200);
    expect(getUsageRecord()?.scanCount).toBe(1);
    expect(res.headers.get("X-Usage-Remaining")).toBe("1");
    expect(streamMocks.streamChat).toHaveBeenCalledOnce();
  });

  it("blocks over-limit users before repository analysis", async () => {
    const now = Date.now();
    testDb
      .insert(usage)
      .values({
        id: "usage-1",
        userId: "test-user-id",
        messageCount: 0,
        scanCount: 2,
        periodStart: now,
        periodEnd: now + 30 * 24 * 60 * 60 * 1000,
      })
      .run();

    const res = await repoScanRoute.POST(
      makeRequest({ repoUrl: "https://github.com/acme/app" }) as never,
      makeParams()
    );
    const data = await res.json();

    expect(res.status).toBe(429);
    expect(data.error).toBe("Monthly scan limit reached (2)");
    expect(githubMocks.analyzeRepo).not.toHaveBeenCalled();
    expect(getUsageRecord()?.scanCount).toBe(2);
  });
});
