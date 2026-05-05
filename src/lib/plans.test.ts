import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { subscriptions } from "@/db/schema";
import type { AppDatabase } from "@/db";
import { getActivePlan } from "@/lib/plans";

let testDb: AppDatabase;

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
  status?: "active" | "canceled" | "past_due";
  currentPeriodEnd?: number | null;
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
      billingInterval: "monthly",
      status: values.status ?? "active",
      currentPeriodEnd: values.currentPeriodEnd ?? now + 30 * 24 * 60 * 60 * 1000,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

beforeEach(() => {
  testDb = createTestDb();
});

describe("getActivePlan", () => {
  it("falls back to Studio for paid users without an active paid subscription", () => {
    expect(getActivePlan(testDb, "paid-user-id", "paid-user")).toBe("pro");
  });

  it("falls back to Studio for admins without an active paid subscription", () => {
    expect(getActivePlan(testDb, "admin-user-id", "admin")).toBe("pro");
  });

  it("keeps free users on the Free plan without an active paid subscription", () => {
    expect(getActivePlan(testDb, "free-user-id", "free-user")).toBe("free");
  });

  it("prefers an active paid subscription over the role fallback", () => {
    addSubscription({ userId: "paid-user-id", plan: "starter" });

    expect(getActivePlan(testDb, "paid-user-id", "paid-user")).toBe("starter");
  });

  it("ignores expired subscriptions before applying the role fallback", () => {
    addSubscription({
      userId: "free-user-id",
      plan: "pro",
      currentPeriodEnd: Date.now() - 1000,
    });

    expect(getActivePlan(testDb, "free-user-id", "free-user")).toBe("free");
  });
});
