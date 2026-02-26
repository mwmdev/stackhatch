import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { settings } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq } from "drizzle-orm";
import { z } from "zod";

const VALID_MODELS = [
  "claude-sonnet-4-20250514",
  "claude-opus-4-20250514",
  "claude-haiku-235-20241022",
] as const;

const VALID_THEMES = ["light", "dark", "system"] as const;

const VALID_KEYS = new Set(["apiKey", "model", "theme"]);

const updateSettingsSchema = z
  .object({
    apiKey: z.string().optional(),
    model: z.enum(VALID_MODELS).optional(),
    theme: z.enum(VALID_THEMES).optional(),
  })
  .strict();

export async function GET() {
  try {
    const db = getDb();
    runMigrations(db);

    const rows = db.select().from(settings).all();
    const result: Record<string, string> = {};
    for (const row of rows) {
      if (VALID_KEYS.has(row.key)) {
        result[row.key] = row.value;
      }
    }

    // Fallback to env vars for unset keys
    if (!result.apiKey && process.env.ANTHROPIC_API_KEY) {
      result.apiKey = process.env.ANTHROPIC_API_KEY;
    }
    if (!result.model) {
      result.model =
        process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const parsed = updateSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json(
        { error: "No settings to update" },
        { status: 400 },
      );
    }

    const db = getDb();
    runMigrations(db);

    // Upsert each setting
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value === undefined) continue;
      const existing = db
        .select()
        .from(settings)
        .where(eq(settings.key, key))
        .get();

      if (existing) {
        db.update(settings)
          .set({ value })
          .where(eq(settings.key, key))
          .run();
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

    if (!result.apiKey && process.env.ANTHROPIC_API_KEY) {
      result.apiKey = process.env.ANTHROPIC_API_KEY;
    }
    if (!result.model) {
      result.model =
        process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 },
    );
  }
}
