import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { subscriptions, type UserRole } from "@/db/schema";
import type { AppDatabase } from "@/db";

let testDb: AppDatabase;
let mockUser: { userId: string; role: UserRole } | null = {
  userId: "test-user-id",
  role: "free-user",
};

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE subscriptions (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      plan TEXT DEFAULT 'free' NOT NULL,
      billing_interval TEXT DEFAULT 'monthly',
      status TEXT NOT NULL,
      current_period_end INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return drizzle(sqlite, { schema });
}

function addSubscription(values: {
  userId: string;
  plan: "free" | "starter" | "pro" | "team";
  billingInterval?: "monthly" | "annual";
  status?: "active" | "canceled" | "past_due";
}) {
  const now = Date.now();
  testDb
    .insert(subscriptions)
    .values({
      id: `${values.userId}-${values.plan}-${values.status ?? "active"}`,
      userId: values.userId,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      plan: values.plan,
      billingInterval: values.billingInterval ?? "monthly",
      status: values.status ?? "active",
      currentPeriodEnd: now + 30 * 24 * 60 * 60 * 1000,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

vi.mock("@/db", () => ({
  getDb: () => testDb,
}));

vi.mock("@/db/migrate", () => ({
  runMigrations: () => {},
}));

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn(() => Promise.resolve(mockUser)),
}));

const subscriptionRoute = await import("@/app/api/billing/subscription/route");

beforeEach(() => {
  testDb = createTestDb();
  mockUser = {
    userId: "test-user-id",
    role: "free-user",
  };
});

describe("GET /api/billing/subscription", () => {
  it("returns free for free users without a paid subscription", async () => {
    const res = await subscriptionRoute.GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      plan: "free",
      billingInterval: null,
      status: null,
      currentPeriodEnd: null,
    });
  });

  it("returns Studio for paid-role users without a subscription row", async () => {
    mockUser = {
      userId: "paid-user-id",
      role: "paid-user",
    };

    const res = await subscriptionRoute.GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      plan: "pro",
      billingInterval: null,
      status: null,
      currentPeriodEnd: null,
    });
  });

  it("preserves an active paid subscription plan when one exists", async () => {
    mockUser = {
      userId: "paid-user-id",
      role: "paid-user",
    };
    addSubscription({
      userId: "paid-user-id",
      plan: "starter",
      billingInterval: "annual",
    });

    const res = await subscriptionRoute.GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toMatchObject({
      plan: "starter",
      billingInterval: "annual",
      status: "active",
    });
    expect(data.currentPeriodEnd).toEqual(expect.any(Number));
  });

  it("returns authentication errors for anonymous users", async () => {
    mockUser = null;

    const res = await subscriptionRoute.GET();
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data).toEqual({ error: "Authentication required" });
  });
});
