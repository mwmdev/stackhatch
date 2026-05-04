import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { messages, projects } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { analyzeRepo, formatRepoAnalysis } from "@/lib/github-analyzer";
import { streamChat, sseEvent, SSE_HEADERS } from "@/lib/ai/stream-chat";
import { getAuthenticatedUser } from "@/lib/auth";
import { incrementScans } from "@/lib/usage";
import { getAccessibleProject } from "@/lib/project-access";

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

  // Enforce usage limits for free users
  let scansRemaining: number | null = null;
  if (user.role !== "admin") {
    const result = incrementScans(userId, user.role);
    if (!result.allowed) {
      return new Response(
        JSON.stringify({
          error: `Monthly scan limit reached (${result.limit})`,
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
    scansRemaining = typeof result.limit === "number" ? result.limit - result.used : null;
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
  const response = streamChat(db, id, null, initMessage, user);
  if (scansRemaining !== null) {
    response.headers.set("X-Usage-Remaining", String(scansRemaining));
  }
  return response;
}
