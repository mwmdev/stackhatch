import type { AppDatabase } from "@/db";
import { settings, userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decryptSecret } from "@/lib/secrets";
import { normalizeAiModel, type AiModelId } from "@/lib/ai/models";

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

export function getApiKey(db: AppDatabase, userId: string): string | null {
  return getUserAnthropicKey(db, userId);
}

export function getModel(db: AppDatabase, userId: string): AiModelId {
  const row = db
    .select({ model: userSettings.model })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  return normalizeAiModel(row?.model);
}

export function getPrompt(
  settingsMap: Record<string, string>,
  key: string,
  defaultValue: string
): string {
  return settingsMap[key] || defaultValue;
}
