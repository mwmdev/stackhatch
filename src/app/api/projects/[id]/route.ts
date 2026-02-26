import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq } from "drizzle-orm";
import { z } from "zod";

const updateProjectSchema = z
  .object({
    name: z.string().min(1, "Name cannot be empty").optional(),
    description: z.string().nullable().optional(),
    canvasState: z.string().nullable().optional(),
  })
  .strict();

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  runMigrations(db);

  const project = db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .get();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...project,
    canvasState: project.canvasState
      ? JSON.parse(project.canvasState)
      : null,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = updateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 },
    );
  }

  const db = getDb();
  runMigrations(db);

  const existing = db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, id))
    .get();

  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  db.update(projects)
    .set({ ...parsed.data, updatedAt: Date.now() })
    .where(eq(projects.id, id))
    .run();

  const updated = db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .get();

  return NextResponse.json({
    ...updated,
    canvasState: updated!.canvasState
      ? JSON.parse(updated!.canvasState)
      : null,
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  runMigrations(db);

  const existing = db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, id))
    .get();

  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  db.delete(projects).where(eq(projects.id, id)).run();

  return NextResponse.json({ success: true });
}
