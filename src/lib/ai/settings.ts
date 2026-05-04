import type { AppDatabase } from "@/db";
import { settings, userSettings, type UserRole } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decryptSecret } from "@/lib/secrets";
import { getActivePlan } from "@/lib/plans";
import { normalizeAiModel } from "@/lib/ai/models";

export function getSettings(db: AppDatabase) {
  const rows = db.select().from(settings).all();
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

export function getUserAnthropicKey(db: AppDatabase, userId: string): string | null {
  const row = db
    .select({ anthropicApiKey: userSettings.anthropicApiKey })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  if (!row?.anthropicApiKey) return null;
  return decryptSecret(row.anthropicApiKey);
}

export function getApiKey(db?: AppDatabase, userId?: string, role?: UserRole): string | null {
  if (!db || !userId || !role) return process.env.ANTHROPIC_API_KEY || null;

  const plan = getActivePlan(db, userId, role);
  if (plan === "free") {
    return getUserAnthropicKey(db, userId);
  }

  return process.env.ANTHROPIC_API_KEY || getUserAnthropicKey(db, userId);
}

export function getModel(settingsMap: Record<string, string>): string {
  return normalizeAiModel(settingsMap.model || process.env.ANTHROPIC_MODEL);
}

export function getPrompt(
  settingsMap: Record<string, string>,
  key: string,
  defaultValue: string
): string {
  return settingsMap[key] || defaultValue;
}
