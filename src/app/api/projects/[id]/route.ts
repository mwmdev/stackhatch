import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq } from "drizzle-orm";

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
