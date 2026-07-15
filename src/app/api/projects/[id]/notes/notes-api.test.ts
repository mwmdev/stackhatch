import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { notes, projects, users } from "@/db/schema";
import type { AppDatabase } from "@/db";

let testDb: AppDatabase;
const authState = vi.hoisted(() => ({ userId: "owner-id" as string | null }));

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
    CREATE TABLE notes (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      content TEXT NOT NULL,
      node_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
  `);
  return drizzle(sqlite, { schema });
}

vi.mock("@/db", () => ({ getDb: () => testDb }));
vi.mock("@/db/migrate", () => ({ runMigrations: () => {} }));
vi.mock("@/lib/auth", () => ({
  getAuthenticatedUserId: vi.fn(() => Promise.resolve(authState.userId)),
}));

const notesRoute = await import("@/app/api/projects/[id]/notes/route");
const noteRoute = await import("@/app/api/projects/[id]/notes/[noteId]/route");

function request(path: string, options?: { method?: string; body?: unknown }) {
  return new Request(`http://localhost:3000${path}`, {
    method: options?.method ?? "GET",
    headers: options?.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: options?.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

function projectParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function noteParams(id: string, noteId: string) {
  return { params: Promise.resolve({ id, noteId }) };
}

beforeEach(() => {
  testDb = createTestDb();
  authState.userId = "owner-id";
  const now = Date.now();
  testDb
    .insert(users)
    .values([
      { id: "owner-id", githubId: "owner-github", role: "user", createdAt: now },
      { id: "other-id", githubId: "other-github", role: "user", createdAt: now },
    ])
    .run();
  testDb
    .insert(projects)
    .values([
      {
        id: "owned-project",
        name: "Owned",
        userId: "owner-id",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "other-project",
        name: "Other",
        userId: "other-id",
        createdAt: now,
        updatedAt: now,
      },
    ])
    .run();
});

describe("/api/projects/[id]/notes", () => {
  it("lists attribution-free notes in creation order", async () => {
    const now = Date.now();
    testDb
      .insert(notes)
      .values([
        {
          id: "later",
          projectId: "owned-project",
          content: "Later",
          nodeId: null,
          createdAt: now + 1,
          updatedAt: now + 1,
        },
        {
          id: "first",
          projectId: "owned-project",
          content: "First",
          nodeId: "api",
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();

    const response = await notesRoute.GET(
      request("/api/projects/owned-project/notes") as never,
      projectParams("owned-project")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      { id: "first", content: "First", nodeId: "api", createdAt: now, updatedAt: now },
      {
        id: "later",
        content: "Later",
        nodeId: null,
        createdAt: now + 1,
        updatedAt: now + 1,
      },
    ]);
  });

  it("creates a trimmed note with the public response shape", async () => {
    const response = await notesRoute.POST(
      request("/api/projects/owned-project/notes", {
        method: "POST",
        body: { content: "  Keep the boundary  ", nodeId: "api" },
      }) as never,
      projectParams("owned-project")
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      id: expect.any(String),
      content: "Keep the boundary",
      nodeId: "api",
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    });
    expect(testDb.select().from(notes).get()).toMatchObject({
      projectId: "owned-project",
      content: "Keep the boundary",
    });
  });

  it("rejects blank note content", async () => {
    const response = await notesRoute.POST(
      request("/api/projects/owned-project/notes", {
        method: "POST",
        body: { content: "   " },
      }) as never,
      projectParams("owned-project")
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 for cross-user reads and writes", async () => {
    const getResponse = await notesRoute.GET(
      request("/api/projects/other-project/notes") as never,
      projectParams("other-project")
    );
    const postResponse = await notesRoute.POST(
      request("/api/projects/other-project/notes", {
        method: "POST",
        body: { content: "No access" },
      }) as never,
      projectParams("other-project")
    );

    expect(getResponse.status).toBe(404);
    expect(postResponse.status).toBe(404);
  });

  it("requires authentication", async () => {
    authState.userId = null;
    const response = await notesRoute.GET(
      request("/api/projects/owned-project/notes") as never,
      projectParams("owned-project")
    );
    expect(response.status).toBe(401);
  });
});

describe("DELETE /api/projects/[id]/notes/[noteId]", () => {
  it("deletes an owned note", async () => {
    const now = Date.now();
    testDb
      .insert(notes)
      .values({
        id: "note-1",
        projectId: "owned-project",
        content: "Remove me",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const response = await noteRoute.DELETE(
      request("/api/projects/owned-project/notes/note-1", { method: "DELETE" }) as never,
      noteParams("owned-project", "note-1")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(testDb.select().from(notes).all()).toEqual([]);
  });

  it("returns 404 for a note on another user's project", async () => {
    const now = Date.now();
    testDb
      .insert(notes)
      .values({
        id: "other-note",
        projectId: "other-project",
        content: "Private",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const response = await noteRoute.DELETE(
      request("/api/projects/other-project/notes/other-note", { method: "DELETE" }) as never,
      noteParams("other-project", "other-note")
    );

    expect(response.status).toBe(404);
    expect(testDb.select().from(notes).get()?.id).toBe("other-note");
  });
});
