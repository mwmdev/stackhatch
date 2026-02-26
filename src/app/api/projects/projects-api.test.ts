import { describe, it, expect, beforeEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "@/db/schema";
import { projects, messages } from "@/db/schema";
import type { AppDatabase } from "@/db";

let testDb: AppDatabase;

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      repo_url TEXT,
      canvas_state TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
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

// Import routes after mocks
const projectsRoute = await import("@/app/api/projects/route");
const projectIdRoute = await import("@/app/api/projects/[id]/route");
const messagesRoute = await import(
  "@/app/api/projects/[id]/messages/route"
);

function makeRequest(
  url: string,
  options?: { method?: string; body?: unknown },
) {
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
  testDb = createTestDb();
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
          createdAt: now - 2000,
          updatedAt: now - 2000,
        },
        {
          id: "p2",
          name: "New Project",
          description: "desc",
          canvasState: null,
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
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();

    const res = await projectsRoute.GET();
    const data = await res.json();

    expect(data[0]).not.toHaveProperty("canvasState");
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
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();

    const res = await projectIdRoute.GET(
      makeRequest("/api/projects/p1") as never,
      makeParams("p1"),
    );
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.name).toBe("Test");
    expect(data.canvasState).toEqual(canvas);
  });

  it("returns null canvasState when not set", async () => {
    testDb
      .insert(projects)
      .values({
        id: "p1",
        name: "Test",
        description: null,
        canvasState: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();

    const res = await projectIdRoute.GET(
      makeRequest("/api/projects/p1") as never,
      makeParams("p1"),
    );
    const data = await res.json();
    expect(data.canvasState).toBeNull();
  });

  it("returns 404 for nonexistent project", async () => {
    const res = await projectIdRoute.GET(
      makeRequest("/api/projects/nonexistent") as never,
      makeParams("nonexistent"),
    );
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data.error).toBe("Project not found");
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

    const res = await projectIdRoute.PATCH(
      req as never,
      makeParams("nonexistent"),
    );
    expect(res.status).toBe(404);
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
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();

    const res = await projectIdRoute.DELETE(
      makeRequest("/api/projects/p1", { method: "DELETE" }) as never,
      makeParams("p1"),
    );
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);

    const remaining = testDb.select().from(projects).all();
    expect(remaining).toHaveLength(0);
  });

  it("cascade deletes messages when project is deleted", async () => {
    testDb
      .insert(projects)
      .values({
        id: "p1",
        name: "With Messages",
        description: null,
        canvasState: null,
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
      makeParams("p1"),
    );

    const remainingMessages = testDb.select().from(messages).all();
    expect(remainingMessages).toHaveLength(0);
  });

  it("returns 404 for nonexistent project", async () => {
    const res = await projectIdRoute.DELETE(
      makeRequest("/api/projects/nonexistent", {
        method: "DELETE",
      }) as never,
      makeParams("nonexistent"),
    );
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data.error).toBe("Project not found");
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
      makeParams("p1"),
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
      makeParams("p1"),
    );
    const data = await res.json();
    expect(data).toEqual([]);
  });

  it("returns 404 for nonexistent project", async () => {
    const res = await messagesRoute.GET(
      makeRequest("/api/projects/nonexistent/messages") as never,
      makeParams("nonexistent"),
    );
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data.error).toBe("Project not found");
  });
});
