import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDatabase } from "@/db";
import * as schema from "@/db/schema";
import { userSettings, users } from "@/db/schema";

let testDb: AppDatabase;
let mockSessionIdentity: { userId: string; githubId: string } | null = {
  userId: "user-1",
  githubId: "github-1",
};
let mockDatabaseFailure = false;

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
    CREATE TABLE user_settings (
      user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      anthropic_api_key TEXT,
      model TEXT DEFAULT 'claude-sonnet-5' NOT NULL,
      theme TEXT DEFAULT 'system' NOT NULL,
      custom_subtypes TEXT DEFAULT '{}' NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return drizzle(sqlite, { schema });
}

vi.mock("@/db", () => ({
  getDb: () => {
    if (mockDatabaseFailure) throw new Error("database unavailable");
    return testDb;
  },
}));

vi.mock("@/db/migrate", () => ({
  runMigrations: () => {},
}));

vi.mock("@/lib/auth-config", () => ({
  auth: vi.fn(() => Promise.resolve(mockSessionIdentity ? { user: mockSessionIdentity } : null)),
}));

const authModule = await import("@/lib/auth");

beforeEach(() => {
  testDb = createTestDb();
  mockSessionIdentity = { userId: "user-1", githubId: "github-1" };
  mockDatabaseFailure = false;
  delete process.env.STACKHATCH_DEV_AUTH;

  testDb
    .insert(users)
    .values({
      id: "user-1",
      githubId: "github-1",
      email: "user@example.com",
      name: "User One",
      avatarUrl: null,
      createdAt: 1000,
    })
    .run();
});

describe("database-backed authentication", () => {
  it("resolves one current user identity without role or impersonation state", async () => {
    await expect(authModule.getAuthenticatedUser()).resolves.toEqual({
      userId: "user-1",
      githubId: "github-1",
      name: "User One",
      email: "user@example.com",
      image: null,
    });
  });

  it("rejects a session whose internal user no longer exists", async () => {
    mockSessionIdentity = { userId: "deleted-user", githubId: "github-1" };

    await expect(authModule.getAuthenticatedUser()).resolves.toBeNull();
    await expect(authModule.getAuthenticatedUserId()).resolves.toBeNull();
  });

  it("returns null without a session", async () => {
    mockSessionIdentity = null;

    await expect(authModule.getAuthenticatedUser()).resolves.toBeNull();
  });

  it("rejects a signed identity unless the internal ID and GitHub ID match one row", async () => {
    mockSessionIdentity = { userId: "user-1", githubId: "different-github" };
    await expect(authModule.getAuthenticatedUser()).resolves.toBeNull();
  });

  it("fails closed when identity lookup cannot reach the database", async () => {
    mockDatabaseFailure = true;
    await expect(authModule.getAuthenticatedUser()).resolves.toBeNull();
  });
});

describe("development authentication", () => {
  it("provisions the fixed development user and settings without a role", async () => {
    process.env.STACKHATCH_DEV_AUTH = "1";

    await expect(authModule.getAuthenticatedUser()).resolves.toEqual({
      userId: "dev-user",
      githubId: "dev-user",
      name: "Dev User",
      email: "dev@stackhatch.local",
      image: null,
    });
    expect(testDb.select().from(userSettings).all()).toEqual([
      expect.objectContaining({ userId: "dev-user", customSubtypes: "{}" }),
    ]);
  });

  it("preserves development user settings on repeat authentication", async () => {
    process.env.STACKHATCH_DEV_AUTH = "1";
    await authModule.getAuthenticatedUser();
    testDb.update(userSettings).set({ theme: "dark" }).run();

    await authModule.getAuthenticatedUser();

    expect(testDb.select().from(userSettings).get()?.theme).toBe("dark");
  });
});
