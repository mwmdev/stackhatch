import { describe, it, expect, beforeEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "@/db/schema";
import { settings } from "@/db/schema";
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
  // Clear env vars for clean tests
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_MODEL;
});

describe("GET /api/settings", () => {
  it("returns default model when no settings exist and no env vars", async () => {
    const res = await settingsRoute.GET();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.model).toBe("claude-sonnet-4-20250514");
    expect(data.apiKey).toBeUndefined();
  });

  it("returns settings from database", async () => {
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

    expect(data.apiKey).toBe("sk-ant-test123");
    expect(data.model).toBe("claude-opus-4-20250514");
    expect(data.theme).toBe("dark");
  });

  it("uses env var as fallback for apiKey when not in DB", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-env-key";

    const res = await settingsRoute.GET();
    const data = await res.json();

    expect(data.apiKey).toBe("sk-ant-env-key");
  });

  it("uses env var as fallback for model when not in DB", async () => {
    process.env.ANTHROPIC_MODEL = "claude-haiku-235-20241022";

    const res = await settingsRoute.GET();
    const data = await res.json();

    expect(data.model).toBe("claude-haiku-235-20241022");
  });

  it("DB settings override env vars", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-env-key";
    process.env.ANTHROPIC_MODEL = "claude-haiku-235-20241022";

    testDb
      .insert(settings)
      .values([
        { key: "apiKey", value: "sk-ant-db-key" },
        { key: "model", value: "claude-opus-4-20250514" },
      ])
      .run();

    const res = await settingsRoute.GET();
    const data = await res.json();

    expect(data.apiKey).toBe("sk-ant-db-key");
    expect(data.model).toBe("claude-opus-4-20250514");
  });

  it("filters out unknown keys from database", async () => {
    testDb
      .insert(settings)
      .values({ key: "unknownKey", value: "should-not-appear" })
      .run();

    const res = await settingsRoute.GET();
    const data = await res.json();

    expect(data.unknownKey).toBeUndefined();
  });
});

describe("PATCH /api/settings", () => {
  it("saves apiKey setting", async () => {
    const req = makeRequest({
      method: "PATCH",
      body: { apiKey: "sk-ant-new-key" },
    });

    const res = await settingsRoute.PATCH(req as never);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.apiKey).toBe("sk-ant-new-key");

    // Verify persisted in DB
    const row = testDb
      .select()
      .from(settings)
      .all()
      .find((r) => r.key === "apiKey");
    expect(row?.value).toBe("sk-ant-new-key");
  });

  it("saves model setting", async () => {
    const req = makeRequest({
      method: "PATCH",
      body: { model: "claude-opus-4-20250514" },
    });

    const res = await settingsRoute.PATCH(req as never);
    const data = await res.json();

    expect(data.model).toBe("claude-opus-4-20250514");
  });

  it("saves theme setting", async () => {
    const req = makeRequest({
      method: "PATCH",
      body: { theme: "dark" },
    });

    const res = await settingsRoute.PATCH(req as never);
    const data = await res.json();

    expect(data.theme).toBe("dark");
  });

  it("saves multiple settings at once", async () => {
    const req = makeRequest({
      method: "PATCH",
      body: {
        apiKey: "sk-ant-multi",
        model: "claude-haiku-235-20241022",
        theme: "light",
      },
    });

    const res = await settingsRoute.PATCH(req as never);
    const data = await res.json();

    expect(data.apiKey).toBe("sk-ant-multi");
    expect(data.model).toBe("claude-haiku-235-20241022");
    expect(data.theme).toBe("light");
  });

  it("upserts existing settings", async () => {
    testDb
      .insert(settings)
      .values({ key: "apiKey", value: "sk-ant-old" })
      .run();

    const req = makeRequest({
      method: "PATCH",
      body: { apiKey: "sk-ant-updated" },
    });

    const res = await settingsRoute.PATCH(req as never);
    const data = await res.json();

    expect(data.apiKey).toBe("sk-ant-updated");

    // Only one row for apiKey
    const rows = testDb
      .select()
      .from(settings)
      .all()
      .filter((r) => r.key === "apiKey");
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe("sk-ant-updated");
  });

  it("returns 400 for invalid model value", async () => {
    const req = makeRequest({
      method: "PATCH",
      body: { model: "gpt-4" },
    });

    const res = await settingsRoute.PATCH(req as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid theme value", async () => {
    const req = makeRequest({
      method: "PATCH",
      body: { theme: "sepia" },
    });

    const res = await settingsRoute.PATCH(req as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 for unknown keys", async () => {
    const req = makeRequest({
      method: "PATCH",
      body: { unknownKey: "bad" },
    });

    const res = await settingsRoute.PATCH(req as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty body", async () => {
    const req = makeRequest({
      method: "PATCH",
      body: {},
    });

    const res = await settingsRoute.PATCH(req as never);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toBe("No settings to update");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost:3000/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    const res = await settingsRoute.PATCH(req as never);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toBe("Invalid JSON body");
  });

  it("persists settings across requests", async () => {
    // Save a setting
    const req1 = makeRequest({
      method: "PATCH",
      body: { apiKey: "sk-ant-persist" },
    });
    await settingsRoute.PATCH(req1 as never);

    // Read it back
    const res = await settingsRoute.GET();
    const data = await res.json();

    expect(data.apiKey).toBe("sk-ant-persist");
  });

  it("returns response with env var fallbacks after save", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-env";

    // Save only theme (not apiKey)
    const req = makeRequest({
      method: "PATCH",
      body: { theme: "system" },
    });

    const res = await settingsRoute.PATCH(req as never);
    const data = await res.json();

    // apiKey should come from env var fallback
    expect(data.apiKey).toBe("sk-ant-env");
    expect(data.theme).toBe("system");
  });
});
