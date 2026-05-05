import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { users, type UserRole } from "@/db/schema";
import type { AppDatabase } from "@/db";

let testDb: AppDatabase;
let mockUserRole: UserRole = "admin";
let mockUserId = "admin-user";

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
    CREATE TABLE projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      repo_url TEXT,
      canvas_state TEXT,
      user_id TEXT,
      team_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
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

vi.mock("@/lib/auth", () => {
  return {
    IMPERSONATION_COOKIE: "stackhatch_impersonate_user",
    getActualAuthenticatedUser: vi.fn(() =>
      Promise.resolve({
        userId: mockUserId,
        role: mockUserRole,
        name: "Admin User",
        email: "admin@example.com",
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
  };
});

const usersRoute = await import("@/app/api/admin/users/route");
const impersonationRoute = await import("@/app/api/admin/impersonation/route");
const plansRoute = await import("@/app/api/admin/plans/route");

function makeRequest(path: string, body?: unknown) {
  const init: RequestInit = { method: body ? "POST" : "GET" };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new Request(`http://localhost:3000${path}`, init);
}

beforeEach(() => {
  testDb = createTestDb();
  mockUserRole = "admin";
  mockUserId = "admin-user";
  testDb
    .insert(users)
    .values({
      id: "admin-user",
      githubId: "github-admin",
      email: "admin@example.com",
      name: "Admin User",
      avatarUrl: null,
      role: "admin",
      createdAt: 1000,
    })
    .run();
});

describe("admin users API", () => {
  it("lists users and marks the current admin", async () => {
    const res = await usersRoute.GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual([
      expect.objectContaining({
        id: "admin-user",
        role: "admin",
        isCurrent: true,
      }),
    ]);
  });

  it("creates a manual user without requiring a GitHub ID", async () => {
    const req = makeRequest("/api/admin/users", {
      name: "QA User",
      email: "qa@example.com",
      role: "starter",
    });

    const res = await usersRoute.POST(req as never);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.name).toBe("QA User");
    expect(data.email).toBe("qa@example.com");
    expect(data.role).toBe("starter");
    expect(data.githubId).toMatch(/^manual:/);
    expect(data.isCurrent).toBe(false);
  });

  it("blocks non-admin user creation", async () => {
    mockUserRole = "free";
    const req = makeRequest("/api/admin/users", {
      name: "QA User",
      role: "free",
    });

    const res = await usersRoute.POST(req as never);

    expect(res.status).toBe(403);
  });

  it("rejects duplicate GitHub IDs", async () => {
    const req = makeRequest("/api/admin/users", {
      name: "Duplicate",
      githubId: "github-admin",
      role: "free",
    });

    const res = await usersRoute.POST(req as never);

    expect(res.status).toBe(409);
  });
});

describe("admin plans API", () => {
  it("returns the saved plan catalog to admins", async () => {
    const res = await plansRoute.GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.plans.starter.name).toBe("Builder");
    expect(data.plans.starter.features.projects).toBe(5);
    expect(data.plans.free.features.connectionTypes).toBe(false);
    expect(data.plans.starter.features.connectionTypes).toBe(false);
    expect(data.plans.pro.features.connectionTypes).toBe(true);
  });

  it("saves an updated plan catalog", async () => {
    const getRes = await plansRoute.GET();
    const { plans } = await getRes.json();
    plans.starter.name = "Launch";
    plans.starter.features.projects = 7;
    plans.starter.features.connectionTypes = true;
    plans.starter.billing.monthlyStripePriceId = "price_launch_monthly";

    const res = await plansRoute.PATCH(makeRequest("/api/admin/plans", { plans }) as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.plans.starter.name).toBe("Launch");
    expect(data.plans.starter.features.projects).toBe(7);
    expect(data.plans.starter.features.connectionTypes).toBe(true);

    const persisted = await plansRoute.GET();
    const persistedData = await persisted.json();
    expect(persistedData.plans.starter.billing.monthlyStripePriceId).toBe("price_launch_monthly");
  });

  it("blocks non-admin plan updates", async () => {
    mockUserRole = "free";

    const res = await plansRoute.PATCH(makeRequest("/api/admin/plans", { plans: {} }) as never);

    expect(res.status).toBe(403);
  });
});

describe("admin impersonation API", () => {
  beforeEach(() => {
    testDb
      .insert(users)
      .values({
        id: "target-user",
        githubId: "manual:target-user",
        email: "target@example.com",
        name: "Target User",
        avatarUrl: null,
        role: "free",
        createdAt: 2000,
      })
      .run();
  });

  it("sets an impersonation cookie for a target user", async () => {
    const req = makeRequest("/api/admin/impersonation", { userId: "target-user" });

    const res = await impersonationRoute.POST(req as never);
    const data = await res.json();
    const cookie = res.headers.get("set-cookie");

    expect(res.status).toBe(200);
    expect(data.user.id).toBe("target-user");
    expect(cookie).toContain("stackhatch_impersonate_user=target-user");
    expect(cookie).toContain("HttpOnly");
  });

  it("does not allow impersonating yourself", async () => {
    const req = makeRequest("/api/admin/impersonation", { userId: "admin-user" });

    const res = await impersonationRoute.POST(req as never);

    expect(res.status).toBe(400);
  });

  it("clears the impersonation cookie", async () => {
    const res = await impersonationRoute.DELETE();
    const cookie = res.headers.get("set-cookie");

    expect(res.status).toBe(200);
    expect(cookie).toContain("stackhatch_impersonate_user=");
    expect(cookie).toContain("Max-Age=0");
  });
});
