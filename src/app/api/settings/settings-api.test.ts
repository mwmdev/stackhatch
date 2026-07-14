import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { settings, userSettings, type UserRole } from "@/db/schema";
import type { AppDatabase } from "@/db";
import { decryptSecret } from "@/lib/secrets";
import { DEFAULT_AI_MODEL } from "@/lib/ai/models";

let testDb: AppDatabase;
let mockUserRole: UserRole = "admin";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    CREATE TABLE user_settings (
      user_id TEXT PRIMARY KEY NOT NULL,
      anthropic_api_key TEXT,
      model TEXT DEFAULT '${DEFAULT_AI_MODEL}' NOT NULL,
      theme TEXT DEFAULT 'system' NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
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
}));

const settingsRoute = await import("@/app/api/settings/route");

function makeRequest(body: unknown) {
  return new Request("http://localhost:3000/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  testDb = createTestDb();
  mockUserRole = "admin";
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_MODEL;
});

describe("GET /api/settings", () => {
  it("returns tierless BYOK defaults without exposing a key", async () => {
    const res = await settingsRoute.GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      hasAnthropicKey: false,
      model: DEFAULT_AI_MODEL,
      theme: "system",
      customSubtypes: "{}",
      role: "admin",
      isAdmin: true,
    });
    expect(data.apiKey).toBeUndefined();
  });

  it("returns the current user's model and key presence", async () => {
    testDb
      .insert(userSettings)
      .values({
        userId: "test-user-id",
        anthropicApiKey: "encrypted-key",
        model: "claude-opus-4-8",
        theme: "dark",
        createdAt: 1,
        updatedAt: 1,
      })
      .run();
    testDb
      .insert(settings)
      .values({ key: "customSubtypes", value: '{"client":[{"slug":"kiosk"}]}' })
      .run();
    mockUserRole = "user";

    const res = await settingsRoute.GET();
    const data = await res.json();

    expect(data).toEqual({
      hasAnthropicKey: true,
      model: "claude-opus-4-8",
      theme: "dark",
      customSubtypes: '{"client":[{"slug":"kiosk"}]}',
      role: "user",
      isAdmin: false,
    });
  });

  it("ignores server and global AI configuration", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-env-key";
    process.env.ANTHROPIC_MODEL = "claude-opus-4-8";
    testDb
      .insert(settings)
      .values([
        { key: "apiKey", value: "sk-ant-global-key" },
        { key: "model", value: "claude-opus-4-8" },
        { key: "prompt_chat", value: "private prompt" },
      ])
      .run();

    const res = await settingsRoute.GET();
    const data = await res.json();

    expect(data.hasAnthropicKey).toBe(false);
    expect(data.model).toBe(DEFAULT_AI_MODEL);
    expect(data.apiKey).toBeUndefined();
    expect(data.prompt_chat).toBeUndefined();
  });
});

describe("PATCH /api/settings", () => {
  it("encrypts a BYOK key and never returns it", async () => {
    const rawKey = "sk-ant-new-key-1234567890";
    const res = await settingsRoute.PATCH(makeRequest({ apiKey: rawKey }) as never);
    const data = await res.json();
    const stored = testDb.select().from(userSettings).get();

    expect(res.status).toBe(200);
    expect(data.hasAnthropicKey).toBe(true);
    expect(data.apiKey).toBeUndefined();
    expect(stored?.anthropicApiKey).not.toBe(rawKey);
    expect(decryptSecret(stored!.anthropicApiKey!)).toBe(rawKey);
    expect(stored?.model).toBe(DEFAULT_AI_MODEL);
  });

  it("stores a supported model per user", async () => {
    const res = await settingsRoute.PATCH(
      makeRequest({ model: "claude-haiku-4-5-20251001" }) as never
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.model).toBe("claude-haiku-4-5-20251001");
    expect(testDb.select().from(userSettings).get()?.model).toBe("claude-haiku-4-5-20251001");
  });

  it("clears a key without clearing the selected model", async () => {
    testDb
      .insert(userSettings)
      .values({
        userId: "test-user-id",
        anthropicApiKey: "old-encrypted-key",
        model: "claude-opus-4-8",
        createdAt: 1,
        updatedAt: 1,
      })
      .run();

    const res = await settingsRoute.PATCH(makeRequest({ clearApiKey: true }) as never);
    const data = await res.json();
    const stored = testDb.select().from(userSettings).get();

    expect(res.status).toBe(200);
    expect(data.hasAnthropicKey).toBe(false);
    expect(data.model).toBe("claude-opus-4-8");
    expect(stored?.anthropicApiKey).toBeNull();
    expect(stored?.model).toBe("claude-opus-4-8");
  });

  it("stores the theme per user while preserving the BYOK response contract", async () => {
    const res = await settingsRoute.PATCH(makeRequest({ theme: "light" }) as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.theme).toBe("light");
    expect(data.model).toBe(DEFAULT_AI_MODEL);
    expect(data.apiKey).toBeUndefined();
    expect(testDb.select().from(userSettings).get()?.theme).toBe("light");
    expect(testDb.select().from(settings).all()).toEqual([]);
  });

  it("rejects unsupported models", async () => {
    const res = await settingsRoute.PATCH(makeRequest({ model: "gpt-4" }) as never);
    expect(res.status).toBe(400);
  });

  it("rejects setting and clearing a key in one request", async () => {
    const res = await settingsRoute.PATCH(
      makeRequest({ apiKey: "sk-ant-new-key-1234567890", clearApiKey: true }) as never
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
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
