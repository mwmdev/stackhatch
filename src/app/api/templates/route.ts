import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { runMigrations } from "@/db/migrate";
import { templates } from "@/db/schema";
import { getAuthenticatedUserId } from "@/lib/auth";
import { createId } from "@/lib/id";

const createTemplateSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    description: z.string().nullable().optional(),
    canvasState: z.string().min(1, "Canvas state is required"),
  })
  .strict();

function responseShape(template: typeof templates.$inferSelect) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    canvasState: template.canvasState,
    createdAt: template.createdAt,
  };
}

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const db = getDb();
  runMigrations(db);
  const result = db
    .select()
    .from(templates)
    .where(eq(templates.userId, userId))
    .orderBy(desc(templates.createdAt))
    .all()
    .map(responseShape);

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const db = getDb();
  runMigrations(db);
  const template = {
    id: createId(),
    userId,
    name: parsed.data.name,
    description: parsed.data.description?.trim() || null,
    canvasState: parsed.data.canvasState,
    createdAt: Date.now(),
  };
  db.insert(templates).values(template).run();

  return NextResponse.json(responseShape(template), { status: 201 });
}
