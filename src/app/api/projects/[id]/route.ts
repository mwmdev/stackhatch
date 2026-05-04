import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth";
import { getAccessibleProject } from "@/lib/project-access";

const updateProjectSchema = z
  .object({
    name: z.string().min(1, "Name cannot be empty").optional(),
    description: z.string().nullable().optional(),
    repoUrl: z.string().nullable().optional(),
    canvasState: z.string().nullable().optional(),
  })
  .strict();

function parseCanvasState(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const db = getDb();
  runMigrations(db);

  const project = getAccessibleProject(db, id, userId);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...project,
    canvasState: parseCanvasState(project.canvasState),
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const parsed = updateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const db = getDb();
  runMigrations(db);

  const existing = getAccessibleProject(db, id, userId);

  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  db.update(projects)
    .set({ ...parsed.data, updatedAt: Date.now() })
    .where(eq(projects.id, id))
    .run();

  const updated = getAccessibleProject(db, id, userId);

  return NextResponse.json({
    ...updated,
    canvasState: parseCanvasState(updated!.canvasState),
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const db = getDb();
  runMigrations(db);

  // Only the project owner can delete
  const existing = db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .get();

  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  db.delete(projects).where(eq(projects.id, id)).run();

  return NextResponse.json({ success: true });
}
