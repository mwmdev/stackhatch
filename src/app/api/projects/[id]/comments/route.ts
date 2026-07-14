import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { comments, projects, teamMembers, users } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq, and, asc } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/auth";
import { createId } from "@/lib/id";

/**
 * Verify that a user can comment on a project.
 * Returns the project if the user is a team member, null otherwise.
 * Comments are only available on team projects.
 */
function verifyCommentAccess(db: ReturnType<typeof getDb>, projectId: string, userId: string) {
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();

  if (!project) return null;

  // Comments only available on team projects
  if (!project.teamId) return null;

  const membership = db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, project.teamId), eq(teamMembers.userId, userId)))
    .get();

  if (!membership) return null;

  return project;
}

// GET /api/projects/[id]/comments - List comments with author info
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const db = getDb();
  runMigrations(db);

  const project = verifyCommentAccess(db, id, userId);
  if (!project) {
    return NextResponse.json({ error: "Comments not available for this project" }, { status: 403 });
  }

  const result = db
    .select({
      id: comments.id,
      content: comments.content,
      nodeId: comments.nodeId,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
      userId: comments.userId,
      authorName: users.name,
      authorAvatarUrl: users.avatarUrl,
    })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.projectId, id))
    .orderBy(asc(comments.createdAt))
    .all();

  return NextResponse.json(result);
}

// POST /api/projects/[id]/comments - Add a comment
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: { content?: string; nodeId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.content?.trim()) {
    return NextResponse.json({ error: "Comment content is required" }, { status: 400 });
  }

  const db = getDb();
  runMigrations(db);

  const project = verifyCommentAccess(db, id, userId);
  if (!project) {
    return NextResponse.json({ error: "Comments not available for this project" }, { status: 403 });
  }

  const now = Date.now();
  const commentId = createId();

  db.insert(comments)
    .values({
      id: commentId,
      projectId: id,
      userId,
      content: body.content.trim(),
      nodeId: body.nodeId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  // Return the comment with author info
  const user = db
    .select({ name: users.name, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  return NextResponse.json(
    {
      id: commentId,
      content: body.content.trim(),
      nodeId: body.nodeId ?? null,
      createdAt: now,
      updatedAt: now,
      userId,
      authorName: user?.name ?? null,
      authorAvatarUrl: user?.avatarUrl ?? null,
    },
    { status: 201 }
  );
}
