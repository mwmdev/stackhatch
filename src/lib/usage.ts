import { getDb } from "@/db";
import { usage } from "@/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { PLAN_CONFIG } from "@/lib/stripe";

const PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // ~30 days

function getOrCreateUsage(db: ReturnType<typeof getDb>, userId: string) {
  const existing = db
    .select()
    .from(usage)
    .where(eq(usage.userId, userId))
    .get();

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
      return { ...existing, messageCount: 0, scanCount: 0, periodStart: now, periodEnd: now + PERIOD_MS };
    }
    return existing;
  }

  const now = Date.now();
  const record = {
    id: uuid(),
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

export function incrementMessages(userId: string): { allowed: boolean; used: number; limit: number } {
  const db = getDb();
  const record = getOrCreateUsage(db, userId);
  const limit = PLAN_CONFIG.free.features.messagesPerMonth;

  if (record.messageCount >= limit) {
    return { allowed: false, used: record.messageCount, limit };
  }

  const newCount = record.messageCount + 1;
  db.update(usage)
    .set({ messageCount: newCount })
    .where(eq(usage.id, record.id))
    .run();

  return { allowed: true, used: newCount, limit };
}

export function incrementScans(userId: string): { allowed: boolean; used: number; limit: number } {
  const db = getDb();
  const record = getOrCreateUsage(db, userId);
  const limit = PLAN_CONFIG.free.features.scansPerMonth;

  if (record.scanCount >= limit) {
    return { allowed: false, used: record.scanCount, limit };
  }

  const newCount = record.scanCount + 1;
  db.update(usage)
    .set({ scanCount: newCount })
    .where(eq(usage.id, record.id))
    .run();

  return { allowed: true, used: newCount, limit };
}

export function resetUsage(userId: string) {
  const db = getDb();
  const now = Date.now();

  const existing = db
    .select()
    .from(usage)
    .where(eq(usage.userId, userId))
    .get();

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
        id: uuid(),
        userId,
        messageCount: 0,
        scanCount: 0,
        periodStart: now,
        periodEnd: now + PERIOD_MS,
      })
      .run();
  }
}
