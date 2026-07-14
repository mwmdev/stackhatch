import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { runMigrations } from "@/db/migrate";
import { z } from "zod";
import { analyzeRepo, formatRepoAnalysis, type RepoAnalysisErrorCode } from "@/lib/github-analyzer";
import { streamChat, sseEvent, SSE_HEADERS } from "@/lib/ai/stream-chat";
import { getAuthenticatedUser } from "@/lib/auth";
import { getAccessibleProject } from "@/lib/project-access";
import { getApiKey } from "@/lib/ai/settings";

const scanSchema = z.object({
  repoUrl: z.string().min(1, "Repository URL is required"),
});

const REPO_ERROR_CODES = new Set<RepoAnalysisErrorCode>([
  "invalid_url",
  "not_found_or_private",
  "github_rate_limited",
  "github_unavailable",
]);

function normalizeRepoError(error: unknown): {
  code: RepoAnalysisErrorCode;
  content: string;
} {
  const candidate = error as { code?: unknown; message?: unknown };
  const hasKnownCode =
    typeof candidate?.code === "string" &&
    REPO_ERROR_CODES.has(candidate.code as RepoAnalysisErrorCode);
  const code = hasKnownCode ? (candidate.code as RepoAnalysisErrorCode) : "github_unavailable";
  const content =
    hasKnownCode && typeof candidate?.message === "string" && candidate.message
      ? candidate.message
      : "GitHub could not be reached. Try the scan again in a moment.";
  return { code, content };
}

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
    const error = normalizeRepoError(err);
    return new Response(sseEvent({ type: "error", ...error }), {
      headers: SSE_HEADERS,
    });
  }

  const scannedAt = Date.now();
  const initMessage = formatRepoAnalysis(analysis);
  return streamChat(db, id, null, initMessage, user, {
    contextArchitecture: null,
    repositoryScanReplacement: {
      repoUrl: analysis.normalizedUrl,
      commitSha: analysis.commitSha,
      scannedAt,
      analysisStatus: analysis.status,
      analysisWarning: analysis.warnings.length > 0 ? analysis.warnings.join(" ") : null,
    },
  });
}
