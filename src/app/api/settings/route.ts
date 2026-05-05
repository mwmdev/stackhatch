import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { settings, userSettings } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getAuthenticatedUser, requireRole } from "@/lib/auth";
import { encryptSecret } from "@/lib/secrets";
import { AI_MODEL_IDS, normalizeAiModel } from "@/lib/ai/models";

const VALID_THEMES = ["light", "dark", "system"] as const;

const VALID_KEYS = new Set([
  "model",
  "theme",
  "customSubtypes",
  "prompt_chat",
  "prompt_alternatives",
  "prompt_prd",
]);

const ADMIN_KEYS = new Set([
  "model",
  "customSubtypes",
  "prompt_chat",
  "prompt_alternatives",
  "prompt_prd",
]);

const updateSettingsSchema = z
  .object({
    apiKey: z.string().min(20).max(300).optional(),
    clearApiKey: z.boolean().optional(),
    model: z.enum(AI_MODEL_IDS).optional(),
    theme: z.enum(VALID_THEMES).optional(),
    customSubtypes: z.string().optional(),
    prompt_chat: z.string().optional(),
    prompt_alternatives: z.string().optional(),
    prompt_prd: z.string().optional(),
  })
  .strict();

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const db = getDb();
    runMigrations(db);

    const rows = db.select().from(settings).all();
    const result: Record<string, string> = {};
    for (const row of rows) {
      if (VALID_KEYS.has(row.key)) {
        result[row.key] = row.value;
      }
    }

    delete result.apiKey;
    result.model = normalizeAiModel(result.model || process.env.ANTHROPIC_MODEL);

    if (user.role !== "admin") {
      delete result.prompt_chat;
      delete result.prompt_alternatives;
      delete result.prompt_prd;
      delete result.customSubtypes;
    }

    const userConfig = db
      .select({ anthropicApiKey: userSettings.anthropicApiKey })
      .from(userSettings)
      .where(eq(userSettings.userId, user.userId))
      .get();
    return NextResponse.json({
      ...result,
      hasAnthropicKey: Boolean(userConfig?.anthropicApiKey),
      hasUserAnthropicKey: Boolean(userConfig?.anthropicApiKey),
      role: user.role,
      isAdmin: user.role === "admin",
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = updateSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    if (parsed.data.apiKey && parsed.data.clearApiKey) {
      return NextResponse.json(
        { error: "Provide apiKey or clearApiKey, not both" },
        { status: 400 }
      );
    }

    if (Object.keys(parsed.data).some((key) => ADMIN_KEYS.has(key))) {
      const roleErr = requireRole(user.role, ["admin"]);
      if (roleErr) return roleErr;
    }

    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: "No settings to update" }, { status: 400 });
    }

    const db = getDb();
    runMigrations(db);
    db.delete(settings).where(eq(settings.key, "apiKey")).run();

    const now = Date.now();
    if (parsed.data.clearApiKey) {
      db.delete(userSettings).where(eq(userSettings.userId, user.userId)).run();
    } else if (parsed.data.apiKey) {
      const existing = db
        .select({ userId: userSettings.userId })
        .from(userSettings)
        .where(eq(userSettings.userId, user.userId))
        .get();
      const encrypted = encryptSecret(parsed.data.apiKey);
      if (existing) {
        db.update(userSettings)
          .set({ anthropicApiKey: encrypted, updatedAt: now })
          .where(eq(userSettings.userId, user.userId))
          .run();
      } else {
        db.insert(userSettings)
          .values({
            userId: user.userId,
            anthropicApiKey: encrypted,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }
    }

    // Upsert each setting
    for (const [key, value] of Object.entries(parsed.data)) {
      if (key === "apiKey" || key === "clearApiKey") continue;
      if (typeof value !== "string") continue;
      const existing = db.select().from(settings).where(eq(settings.key, key)).get();

      if (existing) {
        db.update(settings).set({ value }).where(eq(settings.key, key)).run();
      } else {
        db.insert(settings).values({ key, value }).run();
      }
    }

    // Return all settings (same as GET)
    const rows = db.select().from(settings).all();
    const result: Record<string, string> = {};
    for (const row of rows) {
      if (VALID_KEYS.has(row.key)) {
        result[row.key] = row.value;
      }
    }

    delete result.apiKey;
    result.model = normalizeAiModel(result.model || process.env.ANTHROPIC_MODEL);

    if (user.role !== "admin") {
      delete result.prompt_chat;
      delete result.prompt_alternatives;
      delete result.prompt_prd;
      delete result.customSubtypes;
    }

    const userConfig = db
      .select({ anthropicApiKey: userSettings.anthropicApiKey })
      .from(userSettings)
      .where(eq(userSettings.userId, user.userId))
      .get();
    return NextResponse.json({
      ...result,
      hasAnthropicKey: Boolean(userConfig?.anthropicApiKey),
      hasUserAnthropicKey: Boolean(userConfig?.anthropicApiKey),
      role: user.role,
      isAdmin: user.role === "admin",
    });
  } catch {
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
