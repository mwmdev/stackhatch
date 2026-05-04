import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { messages } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq, asc } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/auth";
import { getAccessibleProject } from "@/lib/project-access";

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

  const projectMessages = db
    .select()
    .from(messages)
    .where(eq(messages.projectId, id))
    .orderBy(asc(messages.createdAt))
    .all();

  return NextResponse.json(projectMessages);
}
