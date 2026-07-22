import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { userSettings } from "@/db/schema";
import type { AppDatabase } from "@/db";
import { decryptSecret } from "@/lib/secrets";
import { DEFAULT_AI_MODEL } from "@/lib/ai/models";

let testDb: AppDatabase;
let mockUserId = "test-user-id";

function createTestDb() {
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
      userId: mockUserId,
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
  mockUserId = "test-user-id";
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
      customSubtypes: {},
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
      .update(userSettings)
      .set({
        customSubtypes: JSON.stringify({
          client: [{ slug: "kiosk", displayName: "Kiosk", icon: "Box" }],
        }),
      })
      .run();

    const res = await settingsRoute.GET();
    const data = await res.json();

    expect(data).toEqual({
      hasAnthropicKey: true,
      model: "claude-opus-4-8",
      theme: "dark",
      customSubtypes: {
        client: [{ slug: "kiosk", displayName: "Kiosk", icon: "Box" }],
      },
    });
  });

  it("ignores server AI configuration", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-env-key";
    process.env.ANTHROPIC_MODEL = "claude-opus-4-8";
    const res = await settingsRoute.GET();
    const data = await res.json();

    expect(data.hasAnthropicKey).toBe(false);
    expect(data.model).toBe(DEFAULT_AI_MODEL);
    expect(data.apiKey).toBeUndefined();
  });

  it("returns only the authenticated user's subtype catalog", async () => {
    testDb
      .insert(userSettings)
      .values([
        {
          userId: "test-user-id",
          model: DEFAULT_AI_MODEL,
          customSubtypes: JSON.stringify({
            client: [{ slug: "kiosk", displayName: "Kiosk", icon: "Box" }],
          }),
          createdAt: 1,
          updatedAt: 1,
        },
        {
          userId: "other-user-id",
          model: DEFAULT_AI_MODEL,
          customSubtypes: JSON.stringify({
            data: [{ slug: "ledger", displayName: "Ledger", icon: "Database" }],
          }),
          createdAt: 1,
          updatedAt: 1,
        },
      ])
      .run();

    const first = await (await settingsRoute.GET()).json();
    mockUserId = "other-user-id";
    const second = await (await settingsRoute.GET()).json();

    expect(first.customSubtypes).toEqual({
      client: [{ slug: "kiosk", displayName: "Kiosk", icon: "Box" }],
    });
    expect(second.customSubtypes).toEqual({
      data: [{ slug: "ledger", displayName: "Ledger", icon: "Database" }],
    });
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
  });

  it("stores a structured custom subtype catalog alongside other settings", async () => {
    const customSubtypes = {
      services: [{ slug: "fraud-engine", displayName: "Fraud engine", icon: "ShieldCheck" }],
      client: [{ slug: "kiosk", displayName: "Kiosk", icon: "Box" }],
    };

    const res = await settingsRoute.PATCH(makeRequest({ customSubtypes, theme: "dark" }) as never);
    const data = await res.json();
    const stored = testDb.select().from(userSettings).get();

    expect(res.status).toBe(200);
    expect(data.customSubtypes).toEqual(customSubtypes);
    expect(data.theme).toBe("dark");
    expect(JSON.parse(stored!.customSubtypes)).toEqual(customSubtypes);
    expect(stored?.theme).toBe("dark");
  });

  it.each([
    [{ unknown: [] }, /unknown category/i],
    [{ client: [{ slug: "extra", displayName: "Extra", icon: "Box", extra: true }] }, /exactly/i],
    [{ client: [{ slug: "Not Kebab", displayName: "Name", icon: "Box" }] }, /kebab-case/i],
    [{ client: [{ slug: "kiosk", displayName: " Kiosk", icon: "Box" }] }, /trimmed/i],
    [{ client: [{ slug: "kiosk", displayName: "Kiosk\nterminal", icon: "Box" }] }, /line breaks/i],
    [{ client: [{ slug: "", displayName: "Kiosk", icon: "Box" }] }, /1-40/i],
    [{ client: [{ slug: "kiosk", displayName: "K".repeat(61), icon: "Box" }] }, /1-60/i],
    [{ client: [{ slug: "kiosk", displayName: "Kiosk", icon: "MissingIcon" }] }, /Lucide/i],
    [{ client: [{ slug: "web-app", displayName: "Web app", icon: "Box" }] }, /built-in/i],
    [
      {
        client: [
          { slug: "kiosk", displayName: "Kiosk", icon: "Box" },
          { slug: "kiosk", displayName: "Kiosk 2", icon: "Box" },
        ],
      },
      /unique/i,
    ],
    [
      {
        client: Array.from({ length: 21 }, (_, index) => ({
          slug: `custom-${index}`,
          displayName: `Custom ${index}`,
          icon: "Box",
        })),
      },
      /20/i,
    ],
  ])(
    "rejects invalid custom subtype payload %# without partial persistence",
    async (catalog, error) => {
      testDb
        .insert(userSettings)
        .values({
          userId: "test-user-id",
          model: DEFAULT_AI_MODEL,
          theme: "light",
          createdAt: 1,
          updatedAt: 1,
        })
        .run();

      const res = await settingsRoute.PATCH(
        makeRequest({ customSubtypes: catalog, theme: "dark" }) as never
      );
      const data = await res.json();
      const stored = testDb.select().from(userSettings).get();

      expect(res.status).toBe(400);
      expect(data.error).toMatch(error);
      expect(stored?.theme).toBe("light");
      expect(stored?.customSubtypes).toBe("{}");
    }
  );

  it("rejects an empty update and unknown settings keys", async () => {
    expect((await settingsRoute.PATCH(makeRequest({}) as never)).status).toBe(400);
    expect(
      (await settingsRoute.PATCH(makeRequest({ customSubtypes: {}, surprise: true }) as never))
        .status
    ).toBe(400);
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
