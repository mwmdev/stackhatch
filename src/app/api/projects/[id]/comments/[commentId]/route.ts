import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { comments, projects, teamMembers, teams } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq, and } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/auth";

// DELETE /api/projects/[id]/comments/[commentId] - Delete a comment (author or team owner only)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  const { id, commentId } = await params;

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const db = getDb();
  runMigrations(db);

  const comment = db
    .select()
    .from(comments)
    .where(and(eq(comments.id, commentId), eq(comments.projectId, id)))
    .get();

  if (!comment) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  // Check if user is the comment author
  if (comment.userId === userId) {
    db.delete(comments).where(eq(comments.id, commentId)).run();
    return NextResponse.json({ success: true });
  }

  // Check if user is team owner
  const project = db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .get();

  if (project?.teamId) {
    const team = db
      .select()
      .from(teams)
      .where(eq(teams.id, project.teamId))
      .get();

    if (team?.ownerId === userId) {
      db.delete(comments).where(eq(comments.id, commentId)).run();
      return NextResponse.json({ success: true });
    }
  }

  return NextResponse.json({ error: "Access denied" }, { status: 403 });
}
