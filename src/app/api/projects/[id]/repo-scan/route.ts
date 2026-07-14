import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { messages, projects } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { analyzeRepo, formatRepoAnalysis } from "@/lib/github-analyzer";
import { streamChat, sseEvent, SSE_HEADERS } from "@/lib/ai/stream-chat";
import { getAuthenticatedUser } from "@/lib/auth";
import { getAccessibleProject } from "@/lib/project-access";
import { getApiKey } from "@/lib/ai/settings";

const scanSchema = z.object({
  repoUrl: z.string().min(1, "Repository URL is required"),
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

  const parsed = scanSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0].message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { repoUrl } = parsed.data;

  if (!getApiKey(db, userId)) {
    return new Response(
      JSON.stringify({
        error: "Add your Anthropic API key in Settings to analyze a repository.",
        code: "AI_NOT_CONFIGURED",
        settingsUrl: "/settings",
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

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

  db.transaction((tx) => {
    tx.update(projects)
      .set({ repoUrl, canvasState: null, updatedAt: Date.now() })
      .where(eq(projects.id, id))
      .run();
    tx.delete(messages).where(eq(messages.projectId, id)).run();
  });

  const initMessage = formatRepoAnalysis(analysis);
  return streamChat(db, id, null, initMessage, user);
}
