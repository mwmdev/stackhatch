import type { AppDatabase } from "@/db";
import { userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decryptSecret } from "@/lib/secrets";
import { normalizeAiModel, type AiModelId } from "@/lib/ai/models";
import { parseCustomSubtypes, type CustomSubtypesMap } from "@/lib/custom-subtypes";

export interface UserAiCredentials {
  apiKey: string | null;
  model: AiModelId;
}

export interface UserAiSettings extends UserAiCredentials {
  customSubtypes: CustomSubtypesMap;
}

function decryptApiKey(value: string | null | undefined): string | null {
  return value ? decryptSecret(value) : null;
}

export function getUserAiCredentials(db: AppDatabase, userId: string): UserAiCredentials {
  const row = db
    .select({ anthropicApiKey: userSettings.anthropicApiKey, model: userSettings.model })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  return {
    apiKey: decryptApiKey(row?.anthropicApiKey),
    model: normalizeAiModel(row?.model),
  };
}

export function getUserAiSettings(db: AppDatabase, userId: string): UserAiSettings {
  const row = db
    .select({
      anthropicApiKey: userSettings.anthropicApiKey,
      model: userSettings.model,
      customSubtypes: userSettings.customSubtypes,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  return {
    apiKey: decryptApiKey(row?.anthropicApiKey),
    model: normalizeAiModel(row?.model),
    customSubtypes: parseCustomSubtypes(row?.customSubtypes),
  };
}

export function getUserAnthropicKey(db: AppDatabase, userId: string): string | null {
  const row = db
    .select({ anthropicApiKey: userSettings.anthropicApiKey })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  return decryptApiKey(row?.anthropicApiKey);
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

export function getUserCustomSubtypes(db: AppDatabase, userId: string): CustomSubtypesMap {
  const row = db
    .select({ customSubtypes: userSettings.customSubtypes })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  return parseCustomSubtypes(row?.customSubtypes);
}
