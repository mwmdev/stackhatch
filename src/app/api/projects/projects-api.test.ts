import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "@/db/schema";
import { projects, messages, userProjectState, users } from "@/db/schema";
import type { AppDatabase } from "@/db";

let testDb: AppDatabase;

const authState = vi.hoisted(() => ({
  userId: "test-user-id" as string | null,
  impersonatedBy: false,
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
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT projects_user_id_id_unique UNIQUE (user_id, id)
    );
    CREATE TABLE user_project_state (
      user_id TEXT PRIMARY KEY NOT NULL,
      last_opened_project_id TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id, last_opened_project_id)
        REFERENCES projects(user_id, id) ON DELETE CASCADE
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
  `);
  return drizzle(sqlite, { schema });
}

vi.mock("@/db", () => ({
  getDb: () => testDb,
}));

vi.mock("@/db/migrate", () => ({
  runMigrations: () => {},
}));

// Mock authentication
vi.mock("@/lib/auth", () => ({
  getAuthenticatedUserId: vi.fn(() => Promise.resolve(authState.userId)),
  getAuthenticatedUser: vi.fn(() => {
    if (!authState.userId) return Promise.resolve(null);
    return Promise.resolve({
      userId: authState.userId,
      role: "admin",
      name: "Test User",
      email: "test@example.com",
      image: null,
      ...(authState.impersonatedBy
        ? {
            impersonatedBy: {
              userId: "actual-admin",
              role: "admin",
              name: "Actual Admin",
              email: "admin@example.com",
            },
          }
        : {}),
    });
  }),
}));

// Import routes after mocks
const projectsRoute = await import("@/app/api/projects/route");
const projectIdRoute = await import("@/app/api/projects/[id]/route");
const projectOpenRoute = await import("@/app/api/projects/[id]/open/route");
const messagesRoute = await import("@/app/api/projects/[id]/messages/route");

function makeRequest(url: string, options?: { method?: string; body?: unknown }) {
  const init: RequestInit = { method: options?.method ?? "GET" };
  if (options?.body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(options.body);
  }
  return new Request(`http://localhost:3000${url}`, init);
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  authState.userId = "test-user-id";
  authState.impersonatedBy = false;
  testDb = createTestDb();
  // Create test user
  testDb
    .insert(users)
    .values({
      id: "test-user-id",
      githubId: "123456789",
      email: "test@example.com",
      name: "Test User",
      avatarUrl: null,
      role: "admin",
      createdAt: Date.now(),
    })
    .run();
});

describe("GET /api/projects", () => {
  it("returns empty array when no projects exist", async () => {
    const res = await projectsRoute.GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns projects ordered by updatedAt descending", async () => {
    const now = Date.now();
    testDb
      .insert(projects)
      .values([
        {
          id: "p1",
          name: "Old Project",
          description: null,
          canvasState: null,
          userId: "test-user-id",
          createdAt: now - 2000,
          updatedAt: now - 2000,
        },
        {
          id: "p2",
          name: "New Project",
          description: "desc",
          canvasState: null,
          userId: "test-user-id",
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();

    const res = await projectsRoute.GET();
    const data = await res.json();

    expect(data).toHaveLength(2);
    expect(data[0].name).toBe("New Project");
    expect(data[1].name).toBe("Old Project");
  });

  it("does not include canvasState in list response", async () => {
    testDb
      .insert(projects)
      .values({
        id: "p1",
        name: "Test",
        description: null,
        canvasState: '{"nodes":[],"edges":[]}',
        userId: "test-user-id",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();

    const res = await projectsRoute.GET();
    const data = await res.json();

    expect(data[0]).not.toHaveProperty("canvasState");
  });

  it("returns only projects owned by the authenticated user", async () => {
    const now = Date.now();
    testDb
      .insert(users)
      .values({ id: "other-user", githubId: "987654321", role: "user", createdAt: now })
      .run();
    testDb
      .insert(projects)
      .values([
        {
          id: "owned",
          name: "Owned",
          userId: "test-user-id",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "other",
          name: "Other",
          userId: "other-user",
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();

    const response = await projectsRoute.GET();
    expect(await response.json()).toEqual([
      expect.objectContaining({ id: "owned", name: "Owned" }),
    ]);
  });
});

describe("POST /api/projects", () => {
  it("creates a project with name and description", async () => {
    const req = makeRequest("/api/projects", {
      method: "POST",
      body: { name: "My App", description: "A cool app" },
    });

    const res = await projectsRoute.POST(req as never);
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.name).toBe("My App");
    expect(data.description).toBe("A cool app");
    expect(data.canvasState).toBeNull();
    expect(data.id).toBeDefined();
    expect(data.createdAt).toBeDefined();
    expect(data.updatedAt).toBeDefined();
  });

  it("creates a project with name only", async () => {
    const req = makeRequest("/api/projects", {
      method: "POST",
      body: { name: "Minimal" },
    });

    const res = await projectsRoute.POST(req as never);
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.name).toBe("Minimal");
    expect(data.description).toBeNull();
  });

  it("creates projects without a product quota", async () => {
    const now = Date.now();
    testDb
      .insert(projects)
      .values(
        Array.from({ length: 25 }, (_, index) => ({
          id: `existing-${index}`,
          name: `Existing ${index}`,
          description: null,
          repoUrl: null,
          canvasState: null,
          userId: "test-user-id",
          createdAt: now,
          updatedAt: now,
        }))
      )
      .run();

    const response = await projectsRoute.POST(
      makeRequest("/api/projects", {
        method: "POST",
        body: { name: "Another project" },
      }) as never
    );

    expect(response.status).toBe(201);
    expect(testDb.select().from(projects).all()).toHaveLength(26);
  });

  it("normalizes blank repo URLs to scratch projects", async () => {
    const req = makeRequest("/api/projects", {
      method: "POST",
      body: { name: "Scratch", repoUrl: "   " },
    });

    const res = await projectsRoute.POST(req as never);
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.name).toBe("Scratch");
    expect(data.repoUrl).toBeNull();
  });

  it("returns 400 when name is missing", async () => {
    const req = makeRequest("/api/projects", {
      method: "POST",
      body: { description: "No name" },
    });

    const res = await projectsRoute.POST(req as never);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it("rejects the removed teamId field", async () => {
    const response = await projectsRoute.POST(
      makeRequest("/api/projects", {
        method: "POST",
        body: { name: "Legacy team project", teamId: "team-1" },
      }) as never
    );

    expect(response.status).toBe(400);
    expect(testDb.select().from(projects).all()).toHaveLength(0);
  });

  it("returns 400 when name is empty string", async () => {
    const req = makeRequest("/api/projects", {
      method: "POST",
      body: { name: "" },
    });

    const res = await projectsRoute.POST(req as never);
    expect(res.status).toBe(400);
  });

  it("persists the project to the database", async () => {
    const req = makeRequest("/api/projects", {
      method: "POST",
      body: { name: "Persisted" },
    });

    await projectsRoute.POST(req as never);

    const all = testDb.select().from(projects).all();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("Persisted");
  });
});

describe("GET /api/projects/[id]", () => {
  it("returns a project with parsed canvasState", async () => {
    const canvas = { nodes: [{ id: "n1" }], edges: [] };
    testDb
      .insert(projects)
      .values({
        id: "p1",
        name: "Test",
        description: "desc",
        canvasState: JSON.stringify(canvas),
        userId: "test-user-id",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();

    const res = await projectIdRoute.GET(
      makeRequest("/api/projects/p1") as never,
      makeParams("p1")
    );
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.name).toBe("Test");
    expect(data.canvasState).toEqual(canvas);
    expect(testDb.select().from(userProjectState).all()).toEqual([]);
  });

  it("returns null canvasState when not set", async () => {
    testDb
      .insert(projects)
      .values({
        id: "p1",
        name: "Test",
        description: null,
        canvasState: null,
        userId: "test-user-id",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();

    const res = await projectIdRoute.GET(
      makeRequest("/api/projects/p1") as never,
      makeParams("p1")
    );
    const data = await res.json();
    expect(data.canvasState).toBeNull();
  });

  it("returns repository scan provenance", async () => {
    const scannedAt = Date.now();
    testDb
      .insert(projects)
      .values({
        id: "p1",
        name: "Mapped repository",
        repoUrl: "https://github.com/acme/app",
        repoCommitSha: "abc123",
        repoScannedAt: scannedAt,
        repoAnalysisStatus: "partial",
        repoAnalysisWarning: "GitHub returned a truncated repository tree.",
        canvasState: null,
        userId: "test-user-id",
        createdAt: scannedAt,
        updatedAt: scannedAt,
      })
      .run();

    const response = await projectIdRoute.GET(
      makeRequest("/api/projects/p1") as never,
      makeParams("p1")
    );

    expect(await response.json()).toMatchObject({
      repoCommitSha: "abc123",
      repoScannedAt: scannedAt,
      repoAnalysisStatus: "partial",
      repoAnalysisWarning: "GitHub returned a truncated repository tree.",
    });
  });

  it("returns 404 for nonexistent project", async () => {
    const res = await projectIdRoute.GET(
      makeRequest("/api/projects/nonexistent") as never,
      makeParams("nonexistent")
    );
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data.error).toBe("Project not found");
  });

  it("returns 404 for another user's project", async () => {
    const now = Date.now();
    testDb
      .insert(users)
      .values({ id: "other-user", githubId: "other-github", role: "user", createdAt: now })
      .run();
    testDb
      .insert(projects)
      .values({
        id: "other-project",
        name: "Private map",
        userId: "other-user",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const response = await projectIdRoute.GET(
      makeRequest("/api/projects/other-project") as never,
      makeParams("other-project")
    );
    expect(response.status).toBe(404);
  });
});

describe("POST /api/projects/[id]/open", () => {
  it("records an owned project without changing its content timestamp", async () => {
    const updatedAt = 123456;
    testDb
      .insert(projects)
      .values({
        id: "p1",
        name: "Opened map",
        userId: "test-user-id",
        createdAt: 123000,
        updatedAt,
      })
      .run();

    const response = await projectOpenRoute.POST(
      makeRequest("/api/projects/p1/open", { method: "POST" }) as never,
      makeParams("p1")
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const secondResponse = await projectOpenRoute.POST(
      makeRequest("/api/projects/p1/open", { method: "POST" }) as never,
      makeParams("p1")
    );
    expect(secondResponse.status).toBe(200);
    expect(testDb.select().from(userProjectState).all()).toEqual([
      { userId: "test-user-id", lastOpenedProjectId: "p1" },
    ]);
    expect(testDb.select().from(projects).where(eq(projects.id, "p1")).get()?.updatedAt).toBe(
      updatedAt
    );
  });

  it("returns 401 without mutating state when unauthenticated", async () => {
    authState.userId = null;

    const response = await projectOpenRoute.POST(
      makeRequest("/api/projects/p1/open", { method: "POST" }) as never,
      makeParams("p1")
    );

    expect(response.status).toBe(401);
    expect(testDb.select().from(userProjectState).all()).toEqual([]);
  });

  it("returns 404 without state for a missing project", async () => {
    const response = await projectOpenRoute.POST(
      makeRequest("/api/projects/missing/open", { method: "POST" }) as never,
      makeParams("missing")
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Project not found" });
    expect(testDb.select().from(userProjectState).all()).toEqual([]);
  });

  it("returns 404 without leaking or recording another account's project", async () => {
    const now = Date.now();
    testDb.insert(users).values({ id: "other-user", githubId: "other-open", createdAt: now }).run();
    testDb
      .insert(projects)
      .values({
        id: "private-project",
        name: "Private",
        userId: "other-user",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const response = await projectOpenRoute.POST(
      makeRequest("/api/projects/private-project/open", { method: "POST" }) as never,
      makeParams("private-project")
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Project not found" });
    expect(testDb.select().from(userProjectState).all()).toEqual([]);
  });

  it("validates access but suppresses resume writes during impersonation", async () => {
    const now = Date.now();
    testDb
      .insert(projects)
      .values([
        {
          id: "previous",
          name: "Previous",
          userId: "test-user-id",
          createdAt: now - 1,
          updatedAt: now - 1,
        },
        {
          id: "opened",
          name: "Opened",
          userId: "test-user-id",
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();
    testDb
      .insert(userProjectState)
      .values({ userId: "test-user-id", lastOpenedProjectId: "previous" })
      .run();
    authState.impersonatedBy = true;

    const response = await projectOpenRoute.POST(
      makeRequest("/api/projects/opened/open", { method: "POST" }) as never,
      makeParams("opened")
    );

    expect(response.status).toBe(200);
    expect(testDb.select().from(userProjectState).all()).toEqual([
      { userId: "test-user-id", lastOpenedProjectId: "previous" },
    ]);
  });
});

describe("PATCH /api/projects/[id]", () => {
  beforeEach(() => {
    testDb
      .insert(projects)
      .values({
        id: "p1",
        name: "Original",
        description: "Original desc",
        canvasState: null,
        userId: "test-user-id",
        createdAt: Date.now(),
        updatedAt: Date.now() - 10000,
      })
      .run();
  });

  it("updates project name", async () => {
    const req = makeRequest("/api/projects/p1", {
      method: "PATCH",
      body: { name: "Updated Name" },
    });

    const res = await projectIdRoute.PATCH(req as never, makeParams("p1"));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.name).toBe("Updated Name");
    expect(data.description).toBe("Original desc");
  });

  it("updates project description", async () => {
    const req = makeRequest("/api/projects/p1", {
      method: "PATCH",
      body: { description: "New desc" },
    });

    const res = await projectIdRoute.PATCH(req as never, makeParams("p1"));
    const data = await res.json();
    expect(data.description).toBe("New desc");
  });

  it("updates canvasState", async () => {
    const canvas = JSON.stringify({ nodes: [{ id: "n1" }], edges: [] });
    const req = makeRequest("/api/projects/p1", {
      method: "PATCH",
      body: { canvasState: canvas },
    });

    const res = await projectIdRoute.PATCH(req as never, makeParams("p1"));
    const data = await res.json();
    expect(data.canvasState).toEqual({ nodes: [{ id: "n1" }], edges: [] });
  });

  it("updates updatedAt timestamp", async () => {
    const before = Date.now();
    const req = makeRequest("/api/projects/p1", {
      method: "PATCH",
      body: { name: "Timestamped" },
    });

    await projectIdRoute.PATCH(req as never, makeParams("p1"));

    const dbProject = testDb.select().from(projects).all()[0];
    expect(dbProject.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("returns 404 for nonexistent project", async () => {
    const req = makeRequest("/api/projects/nonexistent", {
      method: "PATCH",
      body: { name: "Nope" },
    });

    const res = await projectIdRoute.PATCH(req as never, makeParams("nonexistent"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when updating another user's project", async () => {
    const now = Date.now();
    testDb
      .insert(users)
      .values({ id: "other-user", githubId: "other-patch", role: "user", createdAt: now })
      .run();
    testDb
      .insert(projects)
      .values({
        id: "other-project",
        name: "Other",
        userId: "other-user",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const response = await projectIdRoute.PATCH(
      makeRequest("/api/projects/other-project", {
        method: "PATCH",
        body: { name: "Stolen" },
      }) as never,
      makeParams("other-project")
    );

    expect(response.status).toBe(404);
    expect(testDb.select().from(projects).where(eq(projects.id, "other-project")).get()?.name).toBe(
      "Other"
    );
  });

  it("returns 400 when name is empty string", async () => {
    const req = makeRequest("/api/projects/p1", {
      method: "PATCH",
      body: { name: "" },
    });

    const res = await projectIdRoute.PATCH(req as never, makeParams("p1"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is empty object", async () => {
    const req = makeRequest("/api/projects/p1", {
      method: "PATCH",
      body: {},
    });

    const res = await projectIdRoute.PATCH(req as never, makeParams("p1"));
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toBe("No fields to update");
  });

  it("returns 400 for unknown fields", async () => {
    const req = makeRequest("/api/projects/p1", {
      method: "PATCH",
      body: { name: "OK", unknownField: "bad" },
    });

    const res = await projectIdRoute.PATCH(req as never, makeParams("p1"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost:3000/api/projects/p1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    const res = await projectIdRoute.PATCH(req as never, makeParams("p1"));
    expect(res.status).toBe(400);
  });

  it("allows setting description to null", async () => {
    const req = makeRequest("/api/projects/p1", {
      method: "PATCH",
      body: { description: null },
    });

    const res = await projectIdRoute.PATCH(req as never, makeParams("p1"));
    const data = await res.json();
    expect(data.description).toBeNull();
  });
});

describe("DELETE /api/projects/[id]", () => {
  it("deletes a project", async () => {
    testDb
      .insert(projects)
      .values({
        id: "p1",
        name: "To Delete",
        description: null,
        canvasState: null,
        userId: "test-user-id",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();
    testDb
      .insert(userProjectState)
      .values({ userId: "test-user-id", lastOpenedProjectId: "p1" })
      .run();

    const res = await projectIdRoute.DELETE(
      makeRequest("/api/projects/p1", { method: "DELETE" }) as never,
      makeParams("p1")
    );
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);

    const remaining = testDb.select().from(projects).all();
    expect(remaining).toHaveLength(0);
    expect(testDb.select().from(userProjectState).all()).toEqual([]);
  });

  it("cascade deletes messages when project is deleted", async () => {
    testDb
      .insert(projects)
      .values({
        id: "p1",
        name: "With Messages",
        description: null,
        canvasState: null,
        userId: "test-user-id",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();

    testDb
      .insert(messages)
      .values([
        {
          id: "m1",
          projectId: "p1",
          role: "user",
          content: "Hello",
          createdAt: Date.now(),
        },
        {
          id: "m2",
          projectId: "p1",
          role: "assistant",
          content: "Hi",
          createdAt: Date.now(),
        },
      ])
      .run();

    await projectIdRoute.DELETE(
      makeRequest("/api/projects/p1", { method: "DELETE" }) as never,
      makeParams("p1")
    );

    const remainingMessages = testDb.select().from(messages).all();
    expect(remainingMessages).toHaveLength(0);
  });

  it("returns 404 for nonexistent project", async () => {
    const res = await projectIdRoute.DELETE(
      makeRequest("/api/projects/nonexistent", {
        method: "DELETE",
      }) as never,
      makeParams("nonexistent")
    );
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data.error).toBe("Project not found");
  });

  it("returns 404 when deleting another user's project", async () => {
    const now = Date.now();
    testDb
      .insert(users)
      .values({ id: "other-user", githubId: "other-delete", role: "user", createdAt: now })
      .run();
    testDb
      .insert(projects)
      .values({
        id: "other-project",
        name: "Other",
        userId: "other-user",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const response = await projectIdRoute.DELETE(
      makeRequest("/api/projects/other-project", { method: "DELETE" }) as never,
      makeParams("other-project")
    );

    expect(response.status).toBe(404);
    expect(
      testDb.select().from(projects).where(eq(projects.id, "other-project")).get()
    ).toBeDefined();
  });
});

describe("GET /api/projects/[id]/messages", () => {
  beforeEach(() => {
    testDb
      .insert(projects)
      .values({
        id: "p1",
        name: "Test",
        description: null,
        canvasState: null,
        userId: "test-user-id",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();
  });

  it("returns messages ordered by createdAt ascending", async () => {
    const now = Date.now();
    testDb
      .insert(messages)
      .values([
        {
          id: "m1",
          projectId: "p1",
          role: "user",
          content: "First",
          createdAt: now,
        },
        {
          id: "m2",
          projectId: "p1",
          role: "assistant",
          content: "Second",
          createdAt: now + 1000,
        },
        {
          id: "m3",
          projectId: "p1",
          role: "user",
          content: "Third",
          createdAt: now + 2000,
        },
      ])
      .run();

    const res = await messagesRoute.GET(
      makeRequest("/api/projects/p1/messages") as never,
      makeParams("p1")
    );
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveLength(3);
    expect(data[0].content).toBe("First");
    expect(data[1].content).toBe("Second");
    expect(data[2].content).toBe("Third");
  });

  it("returns empty array when no messages exist", async () => {
    const res = await messagesRoute.GET(
      makeRequest("/api/projects/p1/messages") as never,
      makeParams("p1")
    );
    const data = await res.json();
    expect(data).toEqual([]);
  });

  it("returns 404 for nonexistent project", async () => {
    const res = await messagesRoute.GET(
      makeRequest("/api/projects/nonexistent/messages") as never,
      makeParams("nonexistent")
    );
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data.error).toBe("Project not found");
  });
});
