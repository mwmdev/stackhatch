import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { settings } from "@/db/schema";
import type { AppDatabase } from "@/db";

let testDb: AppDatabase;
let mockUserRole: "admin" | "free-user" | "paid-user" = "admin";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
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

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn(() =>
    Promise.resolve({
      userId: "test-user-id",
      role: mockUserRole,
      name: "Test User",
      email: "test@example.com",
      image: null,
    })
  ),
  requireRole: vi.fn((role: string, allowed: string[]) =>
    allowed.includes(role)
      ? null
      : new Response(JSON.stringify({ error: "Upgrade required" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
  ),
}));

const settingsRoute = await import("@/app/api/settings/route");

function makeRequest(options?: { method?: string; body?: unknown }) {
  const init: RequestInit = { method: options?.method ?? "GET" };
  if (options?.body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(options.body);
  }
  return new Request("http://localhost:3000/api/settings", init);
}

beforeEach(() => {
  testDb = createTestDb();
  mockUserRole = "admin";
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_MODEL;
});

describe("GET /api/settings", () => {
  it("returns safe defaults without exposing an API key", async () => {
    const res = await settingsRoute.GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.model).toBe("claude-sonnet-4-20250514");
    expect(data.hasAnthropicKey).toBe(false);
    expect(data.apiKey).toBeUndefined();
  });

  it("returns safe database settings", async () => {
    testDb
      .insert(settings)
      .values([
        { key: "apiKey", value: "sk-ant-test123" },
        { key: "model", value: "claude-opus-4-20250514" },
        { key: "theme", value: "dark" },
      ])
      .run();

    const res = await settingsRoute.GET();
    const data = await res.json();

    expect(data.apiKey).toBeUndefined();
    expect(data.model).toBe("claude-opus-4-20250514");
    expect(data.theme).toBe("dark");
  });

  it("reports whether the server has an Anthropic key", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-env-key";

    const res = await settingsRoute.GET();
    const data = await res.json();

    expect(data.hasAnthropicKey).toBe(true);
    expect(data.apiKey).toBeUndefined();
  });

  it("uses env var fallback for model when not in DB", async () => {
    process.env.ANTHROPIC_MODEL = "claude-haiku-235-20241022";

    const res = await settingsRoute.GET();
    const data = await res.json();

    expect(data.model).toBe("claude-haiku-235-20241022");
  });

  it("filters admin-only fields for non-admins", async () => {
    mockUserRole = "free-user";
    testDb
      .insert(settings)
      .values([
        { key: "customSubtypes", value: "{}" },
        { key: "prompt_chat", value: "secret prompt" },
        { key: "theme", value: "dark" },
      ])
      .run();

    const res = await settingsRoute.GET();
    const data = await res.json();

    expect(data.theme).toBe("dark");
    expect(data.customSubtypes).toBeUndefined();
    expect(data.prompt_chat).toBeUndefined();
  });
});

describe("PATCH /api/settings", () => {
  it("rejects API key writes", async () => {
    const req = makeRequest({
      method: "PATCH",
      body: { apiKey: "sk-ant-new-key" },
    });

    const res = await settingsRoute.PATCH(req as never);
    expect(res.status).toBe(400);
    expect(testDb.select().from(settings).all()).toHaveLength(0);
  });

  it("saves admin model setting", async () => {
    const req = makeRequest({
      method: "PATCH",
      body: { model: "claude-opus-4-20250514" },
    });

    const res = await settingsRoute.PATCH(req as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.model).toBe("claude-opus-4-20250514");
  });

  it("saves theme setting for any authenticated user", async () => {
    mockUserRole = "free-user";
    const req = makeRequest({
      method: "PATCH",
      body: { theme: "dark" },
    });

    const res = await settingsRoute.PATCH(req as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.theme).toBe("dark");
  });

  it("blocks non-admin global AI settings", async () => {
    mockUserRole = "free-user";
    const req = makeRequest({
      method: "PATCH",
      body: { model: "claude-opus-4-20250514" },
    });

    const res = await settingsRoute.PATCH(req as never);
    expect(res.status).toBe(403);
  });

  it("saves multiple safe settings at once", async () => {
    const req = makeRequest({
      method: "PATCH",
      body: {
        model: "claude-haiku-235-20241022",
        theme: "light",
      },
    });

    const res = await settingsRoute.PATCH(req as never);
    const data = await res.json();

    expect(data.model).toBe("claude-haiku-235-20241022");
    expect(data.theme).toBe("light");
    expect(data.apiKey).toBeUndefined();
  });

  it("upserts existing settings", async () => {
    testDb.insert(settings).values({ key: "model", value: "claude-sonnet-4-20250514" }).run();

    const req = makeRequest({
      method: "PATCH",
      body: { model: "claude-opus-4-20250514" },
    });

    const res = await settingsRoute.PATCH(req as never);
    const data = await res.json();

    expect(data.model).toBe("claude-opus-4-20250514");
    const rows = testDb
      .select()
      .from(settings)
      .all()
      .filter((row) => row.key === "model");
    expect(rows).toHaveLength(1);
  });

  it("returns 400 for invalid model value", async () => {
    const req = makeRequest({
      method: "PATCH",
      body: { model: "gpt-4" },
    });

    const res = await settingsRoute.PATCH(req as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost:3000/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    const res = await settingsRoute.PATCH(req as never);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Invalid JSON body");
  });
});
