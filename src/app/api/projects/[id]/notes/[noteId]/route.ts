import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { runMigrations } from "@/db/migrate";
import { notes } from "@/db/schema";
import { getAuthenticatedUserId } from "@/lib/auth";
import { getAccessibleProject } from "@/lib/project-access";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const { id, noteId } = await params;
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const db = getDb();
  runMigrations(db);

  if (!getAccessibleProject(db, id, userId)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const note = db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.projectId, id)))
    .get();
  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  db.delete(notes)
    .where(and(eq(notes.id, noteId), eq(notes.projectId, id)))
    .run();
  return NextResponse.json({ success: true });
}
