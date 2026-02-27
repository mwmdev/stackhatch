import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { messages, projects } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { analyzeRepo, formatRepoAnalysis } from "@/lib/github-analyzer";
import { streamChat, sseEvent, SSE_HEADERS } from "@/lib/ai/stream-chat";
import { getAuthenticatedUserId } from "@/lib/auth";

const scanSchema = z.object({
  repoUrl: z.string().min(1, "Repository URL is required"),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = scanSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: parsed.error.issues[0].message }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { repoUrl } = parsed.data;

  // Save repoUrl and clear canvas state for fresh architecture
  db.update(projects)
    .set({ repoUrl, canvasState: null, updatedAt: Date.now() })
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .run();

  // Delete existing messages (reset conversation for re-scan)
  db.delete(messages).where(eq(messages.projectId, id)).run();

  // Analyze the repo
  let analysis;
  try {
    analysis = await analyzeRepo(repoUrl);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Failed to analyze repository";
    return new Response(sseEvent({ type: "error", content: errorMessage }), {
      headers: SSE_HEADERS,
    });
  }

  const initMessage = formatRepoAnalysis(analysis);
  return streamChat(db, id, null, initMessage);
}
