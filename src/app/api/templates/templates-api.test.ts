import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { templates, users } from "@/db/schema";
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
      created_at INTEGER NOT NULL
    );
    CREATE TABLE templates (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      canvas_state TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  return drizzle(sqlite, { schema });
}

vi.mock("@/db", () => ({ getDb: () => testDb }));
vi.mock("@/db/migrate", () => ({ runMigrations: () => {} }));
vi.mock("@/lib/auth", () => ({
  getAuthenticatedUserId: vi.fn(() => Promise.resolve(authState.userId)),
}));

const templatesRoute = await import("@/app/api/templates/route");
const templateRoute = await import("@/app/api/templates/[templateId]/route");

function request(path: string, options?: { method?: string; body?: unknown }) {
  return new Request(`http://localhost:3000${path}`, {
    method: options?.method ?? "GET",
    headers: options?.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: options?.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

function params(templateId: string) {
  return { params: Promise.resolve({ templateId }) };
}

beforeEach(() => {
  testDb = createTestDb();
  authState.userId = "owner-id";
  const now = Date.now();
  testDb
    .insert(users)
    .values([
      { id: "owner-id", githubId: "owner-github", createdAt: now },
      { id: "other-id", githubId: "other-github", createdAt: now },
    ])
    .run();
});

describe("/api/templates", () => {
  it("lists only the user's templates without ownership fields", async () => {
    const now = Date.now();
    testDb
      .insert(templates)
      .values([
        {
          id: "owned",
          userId: "owner-id",
          name: "Owned template",
          description: null,
          canvasState: "owned-state",
          createdAt: now,
        },
        {
          id: "other",
          userId: "other-id",
          name: "Other template",
          description: "Private",
          canvasState: "other-state",
          createdAt: now + 1,
        },
      ])
      .run();

    const response = await templatesRoute.GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        id: "owned",
        name: "Owned template",
        description: null,
        canvasState: "owned-state",
        createdAt: now,
      },
    ]);
  });

  it("creates a personal template with the public response shape", async () => {
    const response = await templatesRoute.POST(
      request("/api/templates", {
        method: "POST",
        body: {
          name: "  Service map  ",
          description: "  Reusable baseline  ",
          canvasState: '{"nodes":[],"edges":[]}',
        },
      }) as never
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      id: expect.any(String),
      name: "Service map",
      description: "Reusable baseline",
      canvasState: '{"nodes":[],"edges":[]}',
      createdAt: expect.any(Number),
    });
    expect(testDb.select().from(templates).get()).toMatchObject({
      userId: "owner-id",
      name: "Service map",
    });
  });

  it("rejects invalid template input", async () => {
    const response = await templatesRoute.POST(
      request("/api/templates", {
        method: "POST",
        body: { name: "", canvasState: "" },
      }) as never
    );
    expect(response.status).toBe(400);
  });

  it("requires authentication", async () => {
    authState.userId = null;
    expect((await templatesRoute.GET()).status).toBe(401);
  });
});

describe("DELETE /api/templates/[templateId]", () => {
  it("deletes an owned template", async () => {
    testDb
      .insert(templates)
      .values({
        id: "owned",
        userId: "owner-id",
        name: "Owned",
        canvasState: "state",
        createdAt: Date.now(),
      })
      .run();

    const response = await templateRoute.DELETE(
      request("/api/templates/owned", { method: "DELETE" }) as never,
      params("owned")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(testDb.select().from(templates).all()).toEqual([]);
  });

  it("returns 404 for another user's template", async () => {
    testDb
      .insert(templates)
      .values({
        id: "other",
        userId: "other-id",
        name: "Other",
        canvasState: "state",
        createdAt: Date.now(),
      })
      .run();

    const response = await templateRoute.DELETE(
      request("/api/templates/other", { method: "DELETE" }) as never,
      params("other")
    );

    expect(response.status).toBe(404);
    expect(testDb.select().from(templates).get()?.id).toBe("other");
  });
});
