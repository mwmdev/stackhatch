import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { userSettings } from "@/db/schema";
import type { AppDatabase } from "@/db";
import { DEFAULT_AI_MODEL } from "@/lib/ai/models";
import { getApiKey, getModel, getUserCustomSubtypes } from "@/lib/ai/settings";
import { encryptSecret } from "@/lib/secrets";

let testDb: AppDatabase;

beforeEach(() => {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE user_settings (
      user_id TEXT PRIMARY KEY NOT NULL,
      anthropic_api_key TEXT,
      model TEXT DEFAULT '${DEFAULT_AI_MODEL}' NOT NULL,
      theme TEXT DEFAULT 'system' NOT NULL,
      custom_subtypes TEXT DEFAULT '{}' NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  testDb = drizzle(sqlite, { schema });
  process.env.ANTHROPIC_API_KEY = "sk-ant-server-key";
  process.env.ANTHROPIC_MODEL = "claude-opus-4-8";
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_MODEL;
});

describe("user AI settings", () => {
  it("does not fall back to a server API key", () => {
    expect(getApiKey(testDb, "missing-user")).toBeNull();
  });

  it("decrypts only the requested user's stored key", () => {
    testDb
      .insert(userSettings)
      .values({
        userId: "user-1",
        anthropicApiKey: encryptSecret("sk-ant-user-key"),
        model: DEFAULT_AI_MODEL,
        createdAt: 1,
        updatedAt: 1,
      })
      .run();

    expect(getApiKey(testDb, "user-1")).toBe("sk-ant-user-key");
    expect(getApiKey(testDb, "user-2")).toBeNull();
  });

  it("defaults to Sonnet without using the server model", () => {
    expect(getModel(testDb, "missing-user")).toBe(DEFAULT_AI_MODEL);
  });

  it("returns the requested user's supported model", () => {
    testDb
      .insert(userSettings)
      .values({
        userId: "user-1",
        anthropicApiKey: null,
        model: "claude-opus-4-8",
        createdAt: 1,
        updatedAt: 1,
      })
      .run();

    expect(getModel(testDb, "user-1")).toBe("claude-opus-4-8");
  });

  it("normalizes a retired stored model to the current default", () => {
    testDb
      .insert(userSettings)
      .values({
        userId: "legacy-user",
        anthropicApiKey: null,
        model: "claude-sonnet-4-20250514" as typeof DEFAULT_AI_MODEL,
        createdAt: 1,
        updatedAt: 1,
      })
      .run();

    expect(getModel(testDb, "legacy-user")).toBe(DEFAULT_AI_MODEL);
  });

  it("resolves only the requested user's validated custom subtype catalog", () => {
    testDb
      .insert(userSettings)
      .values([
        {
          userId: "user-1",
          anthropicApiKey: null,
          model: DEFAULT_AI_MODEL,
          customSubtypes: JSON.stringify({
            client: [{ slug: "kiosk", displayName: "Kiosk", icon: "Box" }],
          }),
          createdAt: 1,
          updatedAt: 1,
        },
        {
          userId: "user-2",
          anthropicApiKey: null,
          model: DEFAULT_AI_MODEL,
          customSubtypes: JSON.stringify({
            data: [{ slug: "ledger", displayName: "Ledger", icon: "Database" }],
          }),
          createdAt: 1,
          updatedAt: 1,
        },
      ])
      .run();

    expect(getUserCustomSubtypes(testDb, "user-1")).toEqual({
      client: [{ slug: "kiosk", displayName: "Kiosk", icon: "Box" }],
    });
    expect(getUserCustomSubtypes(testDb, "user-2")).toEqual({
      data: [{ slug: "ledger", displayName: "Ledger", icon: "Database" }],
    });
    expect(getUserCustomSubtypes(testDb, "missing-user")).toEqual({});
  });

  it("rejects malformed persisted custom subtype data", () => {
    testDb
      .insert(userSettings)
      .values({
        userId: "invalid-user",
        anthropicApiKey: null,
        model: DEFAULT_AI_MODEL,
        customSubtypes: '{"client":"not-an-array"}',
        createdAt: 1,
        updatedAt: 1,
      })
      .run();

    expect(() => getUserCustomSubtypes(testDb, "invalid-user")).toThrow(/must be an array/i);
  });
});
