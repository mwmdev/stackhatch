import type { AppDatabase } from "@/db";
import { settings } from "@/db/schema";

export function getSettings(db: AppDatabase) {
  const rows = db.select().from(settings).all();
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

export function getApiKey(settingsMap: Record<string, string>): string | null {
  return settingsMap.apiKey || process.env.ANTHROPIC_API_KEY || null;
}

export function getModel(settingsMap: Record<string, string>): string {
  return (
    settingsMap.model ||
    process.env.ANTHROPIC_MODEL ||
    "claude-sonnet-4-20250514"
  );
}

export function getPrompt(
  settingsMap: Record<string, string>,
  key: string,
  defaultValue: string,
): string {
  return settingsMap[key] || defaultValue;
}
