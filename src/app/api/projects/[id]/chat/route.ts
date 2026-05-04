import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { runMigrations } from "@/db/migrate";
import { z } from "zod";
import { streamChat } from "@/lib/ai/stream-chat";
import { getAuthenticatedUser } from "@/lib/auth";
import { incrementMessages } from "@/lib/usage";
import { getAccessibleProject } from "@/lib/project-access";

const chatSchema = z.object({
  message: z.string().min(1),
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0].message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Enforce usage limits for free users
  let usageRemaining: number | null = null;
  if (user.role === "free-user") {
    const result = incrementMessages(userId);
    if (!result.allowed) {
      return new Response(
        JSON.stringify({
          error: `Monthly message limit reached (${result.limit})`,
          limit: result.limit,
          used: result.used,
          upgradeUrl: "/pricing",
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    usageRemaining = result.limit - result.used;
  }

  const response = streamChat(db, id, parsed.data.message);
  if (usageRemaining !== null) {
    response.headers.set("X-Usage-Remaining", String(usageRemaining));
  }
  return response;
}
