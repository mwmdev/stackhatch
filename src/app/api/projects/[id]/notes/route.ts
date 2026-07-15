import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { runMigrations } from "@/db/migrate";
import { notes } from "@/db/schema";
import { getAuthenticatedUserId } from "@/lib/auth";
import { createId } from "@/lib/id";
import { getAccessibleProject } from "@/lib/project-access";

const createNoteSchema = z
  .object({
    content: z.string().trim().min(1, "Note content is required"),
    nodeId: z.string().nullable().optional(),
  })
  .strict();

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const db = getDb();
  runMigrations(db);

  if (!getAccessibleProject(db, id, userId)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const result = db
    .select({
      id: notes.id,
      content: notes.content,
      nodeId: notes.nodeId,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .where(eq(notes.projectId, id))
    .orderBy(asc(notes.createdAt))
    .all();

  return NextResponse.json(result);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  const parsed = createNoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const db = getDb();
  runMigrations(db);

  if (!getAccessibleProject(db, id, userId)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const now = Date.now();
  const note = {
    id: createId(),
    projectId: id,
    content: parsed.data.content,
    nodeId: parsed.data.nodeId ?? null,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(notes).values(note).run();

  return NextResponse.json(
    {
      id: note.id,
      content: note.content,
      nodeId: note.nodeId,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    },
    { status: 201 }
  );
}
