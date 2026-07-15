import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { runMigrations } from "@/db/migrate";
import { templates } from "@/db/schema";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const { templateId } = await params;
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const db = getDb();
  runMigrations(db);
  const template = db
    .select({ id: templates.id })
    .from(templates)
    .where(and(eq(templates.id, templateId), eq(templates.userId, userId)))
    .get();
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  db.delete(templates)
    .where(and(eq(templates.id, templateId), eq(templates.userId, userId)))
    .run();
  return NextResponse.json({ success: true });
}
