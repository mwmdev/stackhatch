import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { messages } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq, asc } from "drizzle-orm";
import { streamChat } from "@/lib/ai/stream-chat";
import { chatCanvasStateSchema } from "@/lib/ai/request-context";
import { getAuthenticatedUser } from "@/lib/auth";
import { getAccessibleProject } from "@/lib/project-access";
import { z } from "zod";

const initSchema = z.object({
  canvasState: chatCanvasStateSchema.optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await getAuthenticatedUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const userId = user.userId;

  const db = getDb();
  runMigrations(db);

  const project = getAccessibleProject(db, id, userId);

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
    return new Response(JSON.stringify({ error: "Chat already initialized" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let parsedBody: z.infer<typeof initSchema> = {};
  try {
    const body = await request.json();
    const parsed = initSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.issues[0].message }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    parsedBody = parsed.data;
  } catch {
    parsedBody = {};
  }

  return streamChat(db, id, null, undefined, user, {
    contextArchitecture: parsedBody.canvasState,
  });
}
