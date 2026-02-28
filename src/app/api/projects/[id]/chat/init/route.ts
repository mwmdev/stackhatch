import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { messages, projects } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq, asc, and } from "drizzle-orm";
import { streamChat } from "@/lib/ai/stream-chat";
import { getAuthenticatedUser, requireRole } from "@/lib/auth";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const user = await getAuthenticatedUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const roleErr = requireRole(user.role, ["admin", "paid-user"]);
  if (roleErr) return roleErr;
  const userId = user.userId;

  const db = getDb();
  runMigrations(db);

  const project = db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .get();

  if (!project) {
    return new Response(JSON.stringify({ error: "Project not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Check if project already has messages
  const existing = db
    .select()
    .from(messages)
    .where(eq(messages.projectId, id))
    .orderBy(asc(messages.createdAt))
    .all();

  if (existing.length > 0) {
    return new Response(
      JSON.stringify({ error: "Chat already initialized" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return streamChat(db, id, null);
}
