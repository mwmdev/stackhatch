import { getDb } from "@/db";
import { usage, type UserRole } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createId } from "@/lib/id";
import { getActivePlan, getPlanCatalog, isUnlimited, type PublicPlanKey } from "@/lib/plans";

const PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // ~30 days

function getOrCreateUsage(db: ReturnType<typeof getDb>, userId: string) {
  const existing = db.select().from(usage).where(eq(usage.userId, userId)).get();

  if (existing) {
    // Reset if period has expired
    if (Date.now() >= existing.periodEnd) {
      const now = Date.now();
      db.update(usage)
        .set({
          messageCount: 0,
          scanCount: 0,
          periodStart: now,
          periodEnd: now + PERIOD_MS,
        })
        .where(eq(usage.id, existing.id))
        .run();
      return {
        ...existing,
        messageCount: 0,
        scanCount: 0,
        periodStart: now,
        periodEnd: now + PERIOD_MS,
      };
    }
    return existing;
  }

  const now = Date.now();
  const record = {
    id: createId(),
    userId,
    messageCount: 0,
    scanCount: 0,
    periodStart: now,
    periodEnd: now + PERIOD_MS,
  };
  db.insert(usage).values(record).run();
  return record;
}

export function getUsage(userId: string) {
  const db = getDb();
  return getOrCreateUsage(db, userId);
}

export function getUsageLimit(plan: PublicPlanKey, metric: "messages" | "scans") {
  const features = getPlanCatalog(getDb())[plan].features;
  return metric === "messages" ? features.messagesPerMonth : features.scansPerMonth;
}

export function incrementMessages(
  userId: string,
  role: UserRole = "free"
): {
  allowed: boolean;
  used: number;
  limit: number | "unlimited" | "byok";
  plan: PublicPlanKey;
} {
  const db = getDb();
  const plan = getActivePlan(db, userId, role);
  const limit = getPlanCatalog(db)[plan].features.messagesPerMonth;
  if (limit === "byok" || isUnlimited(limit)) {
    return { allowed: true, used: 0, limit, plan };
  }

  const record = getOrCreateUsage(db, userId);

  if (record.messageCount >= limit) {
    return { allowed: false, used: record.messageCount, limit, plan };
  }

  const newCount = record.messageCount + 1;
  db.update(usage).set({ messageCount: newCount }).where(eq(usage.id, record.id)).run();

  return { allowed: true, used: newCount, limit, plan };
}

export function incrementScans(
  userId: string,
  role: UserRole = "free"
): { allowed: boolean; used: number; limit: number | "unlimited" | "byok"; plan: PublicPlanKey } {
  const db = getDb();
  const plan = getActivePlan(db, userId, role);
  const limit = getPlanCatalog(db)[plan].features.scansPerMonth;
  if (isUnlimited(limit)) {
    return { allowed: true, used: 0, limit, plan };
  }

  const record = getOrCreateUsage(db, userId);

  if (record.scanCount >= limit) {
    return { allowed: false, used: record.scanCount, limit, plan };
  }

  const newCount = record.scanCount + 1;
  db.update(usage).set({ scanCount: newCount }).where(eq(usage.id, record.id)).run();

  return { allowed: true, used: newCount, limit, plan };
}

export function resetUsage(userId: string) {
  const db = getDb();
  const now = Date.now();

  const existing = db.select().from(usage).where(eq(usage.userId, userId)).get();

  if (existing) {
    db.update(usage)
      .set({
        messageCount: 0,
        scanCount: 0,
        periodStart: now,
        periodEnd: now + PERIOD_MS,
      })
      .where(eq(usage.id, existing.id))
      .run();
  } else {
    db.insert(usage)
      .values({
        id: createId(),
        userId,
        messageCount: 0,
        scanCount: 0,
        periodStart: now,
        periodEnd: now + PERIOD_MS,
      })
      .run();
  }
}
