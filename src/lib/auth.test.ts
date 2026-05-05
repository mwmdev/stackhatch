import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { users } from "@/db/schema";
import type { AppDatabase } from "@/db";

let testDb: AppDatabase;
let mockSessionUserId: string | null = "admin-user";
let mockImpersonationCookie: string | undefined;

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY NOT NULL,
      github_id TEXT NOT NULL UNIQUE,
      email TEXT,
      name TEXT,
      avatar_url TEXT,
      role TEXT DEFAULT 'free' NOT NULL,
      created_at INTEGER NOT NULL
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

vi.mock("@/lib/auth-config", () => ({
  auth: vi.fn(() =>
    Promise.resolve(
      mockSessionUserId
        ? {
            user: {
              userId: mockSessionUserId,
            },
          }
        : null
    )
  ),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(() =>
    Promise.resolve({
      get: (name: string) =>
        name === "stackhatch_impersonate_user" && mockImpersonationCookie
          ? { value: mockImpersonationCookie }
          : undefined,
    })
  ),
}));

const authModule = await import("@/lib/auth");

beforeEach(() => {
  testDb = createTestDb();
  mockSessionUserId = "admin-user";
  mockImpersonationCookie = undefined;

  testDb
    .insert(users)
    .values([
      {
        id: "admin-user",
        githubId: "github-admin",
        email: "admin@example.com",
        name: "Admin User",
        avatarUrl: null,
        role: "admin",
        createdAt: 1000,
      },
      {
        id: "free",
        githubId: "manual:free",
        email: "free@example.com",
        name: "Free plan",
        avatarUrl: null,
        role: "free",
        createdAt: 2000,
      },
    ])
    .run();
});

describe("auth impersonation", () => {
  it("returns the actual admin without an impersonation cookie", async () => {
    const user = await authModule.getAuthenticatedUser();

    expect(user).toEqual(
      expect.objectContaining({
        userId: "admin-user",
        role: "admin",
      })
    );
    expect(user?.impersonatedBy).toBeUndefined();
  });

  it("returns the impersonated user while preserving the actual admin context", async () => {
    mockImpersonationCookie = "free";

    const user = await authModule.getAuthenticatedUser();

    expect(user).toEqual(
      expect.objectContaining({
        userId: "free",
        role: "free",
        name: "Free plan",
        impersonatedBy: expect.objectContaining({
          userId: "admin-user",
          role: "admin",
        }),
      })
    );
  });

  it("ignores impersonation cookies for non-admin users", async () => {
    mockSessionUserId = "free";
    mockImpersonationCookie = "admin-user";

    const user = await authModule.getAuthenticatedUser();

    expect(user).toEqual(
      expect.objectContaining({
        userId: "free",
        role: "free",
      })
    );
    expect(user?.impersonatedBy).toBeUndefined();
  });

  it("exposes the real admin through getActualAuthenticatedUser", async () => {
    mockImpersonationCookie = "free";

    const user = await authModule.getActualAuthenticatedUser();

    expect(user).toEqual(
      expect.objectContaining({
        userId: "admin-user",
        role: "admin",
      })
    );
  });
});
