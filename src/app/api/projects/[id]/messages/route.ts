import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { messages, projects } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq, asc, and } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const db = getDb();
  runMigrations(db);

  const project = db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .get();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const projectMessages = db
    .select()
    .from(messages)
    .where(eq(messages.projectId, id))
    .orderBy(asc(messages.createdAt))
    .all();

  return NextResponse.json(projectMessages);
}
