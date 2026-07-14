import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { settings, userSettings } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/secrets";
import { AI_MODEL_IDS, DEFAULT_AI_MODEL, normalizeAiModel } from "@/lib/ai/models";

const VALID_THEMES = ["light", "dark", "system"] as const;
const DEFAULT_THEME = "system";

const updateSettingsSchema = z
  .object({
    apiKey: z.string().min(20).max(300).optional(),
    clearApiKey: z.boolean().optional(),
    model: z.enum(AI_MODEL_IDS).optional(),
    theme: z.enum(VALID_THEMES).optional(),
  })
  .strict();

type Db = ReturnType<typeof getDb>;

function getPublicSettings(db: Db, user: { userId: string; role: "user" | "admin" }) {
  const customSubtypesRow = db
    .select()
    .from(settings)
    .where(eq(settings.key, "customSubtypes"))
    .get();
  const userConfig = db
    .select({
      anthropicApiKey: userSettings.anthropicApiKey,
      model: userSettings.model,
      theme: userSettings.theme,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, user.userId))
    .get();

  return {
    hasAnthropicKey: Boolean(userConfig?.anthropicApiKey),
    model: normalizeAiModel(userConfig?.model),
    theme: VALID_THEMES.includes(userConfig?.theme as (typeof VALID_THEMES)[number])
      ? userConfig!.theme
      : DEFAULT_THEME,
    customSubtypes: customSubtypesRow?.value ?? "{}",
    role: user.role,
    isAdmin: user.role === "admin",
  };
}

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const db = getDb();
    runMigrations(db);
    return NextResponse.json(getPublicSettings(db, user));
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

    if (parsed.data.apiKey !== undefined && parsed.data.clearApiKey === true) {
      return NextResponse.json(
        { error: "Provide apiKey or clearApiKey, not both" },
        { status: 400 }
      );
    }

    const hasUserConfigUpdate =
      parsed.data.apiKey !== undefined ||
      parsed.data.clearApiKey === true ||
      parsed.data.model !== undefined ||
      parsed.data.theme !== undefined;
    if (!hasUserConfigUpdate) {
      return NextResponse.json({ error: "No settings to update" }, { status: 400 });
    }

    const db = getDb();
    runMigrations(db);

    const now = Date.now();
    if (hasUserConfigUpdate) {
      const existing = db
        .select({ userId: userSettings.userId })
        .from(userSettings)
        .where(eq(userSettings.userId, user.userId))
        .get();

      const encrypted = parsed.data.apiKey ? encryptSecret(parsed.data.apiKey) : undefined;
      if (existing) {
        const updates: {
          anthropicApiKey?: string | null;
          model?: (typeof AI_MODEL_IDS)[number];
          theme?: (typeof VALID_THEMES)[number];
          updatedAt: number;
        } = { updatedAt: now };
        if (encrypted !== undefined) updates.anthropicApiKey = encrypted;
        if (parsed.data.clearApiKey === true) updates.anthropicApiKey = null;
        if (parsed.data.model !== undefined) updates.model = parsed.data.model;
        if (parsed.data.theme !== undefined) updates.theme = parsed.data.theme;

        db.update(userSettings).set(updates).where(eq(userSettings.userId, user.userId)).run();
      } else {
        db.insert(userSettings)
          .values({
            userId: user.userId,
            anthropicApiKey: encrypted ?? null,
            model: parsed.data.model ?? DEFAULT_AI_MODEL,
            theme: parsed.data.theme ?? DEFAULT_THEME,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }
    }

    return NextResponse.json(getPublicSettings(db, user));
  } catch {
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
