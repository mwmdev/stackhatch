import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { runMigrations } from "@/db/migrate";
import { settings } from "@/db/schema";
import { getActualAuthenticatedUser, requireRole } from "@/lib/auth";
import { AI_MODEL_IDS, normalizeAiModel } from "@/lib/ai/models";

const ADMIN_SETTING_KEYS = new Set([
  "model",
  "customSubtypes",
  "prompt_chat",
  "prompt_alternatives",
  "prompt_prd",
]);

const updateAdminSettingsSchema = z
  .object({
    model: z.enum(AI_MODEL_IDS).optional(),
    customSubtypes: z.string().optional(),
    prompt_chat: z.string().optional(),
    prompt_alternatives: z.string().optional(),
    prompt_prd: z.string().optional(),
  })
  .strict();

async function requireAdminResponse(): Promise<Response | null> {
  const user = await getActualAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const roleErr = requireRole(user.role, ["admin"]);
  if (roleErr) return roleErr;

  return null;
}

export async function GET() {
  const adminError = await requireAdminResponse();
  if (adminError) return adminError;

  const db = getDb();
  runMigrations(db);

  const rows = db.select().from(settings).all();
  const result: Record<string, string> = {};
  for (const row of rows) {
    if (ADMIN_SETTING_KEYS.has(row.key)) {
      result[row.key] = row.value;
    }
  }

  result.model = normalizeAiModel(result.model || process.env.ANTHROPIC_MODEL);

  return NextResponse.json(result);
}

export async function PATCH(request: NextRequest) {
  const adminError = await requireAdminResponse();
  if (adminError) return adminError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateAdminSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No settings to update" }, { status: 400 });
  }

  const db = getDb();
  runMigrations(db);

  for (const [key, value] of Object.entries(parsed.data)) {
    if (typeof value !== "string") continue;
    const existing = db.select().from(settings).where(eq(settings.key, key)).get();
    if (existing) {
      db.update(settings).set({ value }).where(eq(settings.key, key)).run();
    } else {
      db.insert(settings).values({ key, value }).run();
    }
  }

  const rows = db.select().from(settings).all();
  const result: Record<string, string> = {};
  for (const row of rows) {
    if (ADMIN_SETTING_KEYS.has(row.key)) {
      result[row.key] = row.value;
    }
  }
  result.model = normalizeAiModel(result.model || process.env.ANTHROPIC_MODEL);

  return NextResponse.json(result);
}
