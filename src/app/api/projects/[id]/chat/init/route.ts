import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { messages, projects } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq, asc } from "drizzle-orm";
import { streamChat } from "@/lib/ai/stream-chat";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  runMigrations(db);

  const project = db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, id))
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
