import { and, asc, eq } from "drizzle-orm";
import { createId } from "@/lib/id";
import Anthropic from "@anthropic-ai/sdk";
import type { AppDatabase } from "@/db";
import { messages, projects } from "@/db/schema";
import { buildSystemPrompt, INIT_INSTRUCTION } from "@/lib/ai/system-prompt";
import { buildMessages } from "@/lib/ai/context-builder";
import { parseAIResponse } from "@/lib/ai/output-parser";
import { getUserAiSettings } from "@/lib/ai/settings";
import type { ChatMessage } from "@/types/chat";
import type { StackArchitecture } from "@/types/stack";
import type { AuthenticatedUser } from "@/lib/auth";
import { modelSupportsEffort } from "@/lib/ai/models";
import { prepareAccessibleProjectCheck } from "@/lib/project-access";

export function sseEvent(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

export interface RepositoryScanReplacement {
  repoUrl: string;
  commitSha: string;
  scannedAt: number;
  analysisStatus: "complete" | "partial";
  analysisWarning: string | null;
}

interface StreamChatOptions {
  contextArchitecture?: StackArchitecture | null;
  repositoryScanReplacement?: RepositoryScanReplacement;
}

class ProjectOwnershipLostError extends Error {}

const PROJECT_UNAVAILABLE_ERROR = {
  type: "error",
  code: "PROJECT_UNAVAILABLE",
  content: "This project is no longer available. Return to your maps or sign in again.",
} as const;

type OwnershipLossPhase = "request_persistence" | "provider_stream" | "persistence";

function logProjectOwnershipLoss(userId: string, projectId: string, phase: OwnershipLossPhase) {
  console.warn("stackhatch.assistant.project_ownership_lost", {
    userId,
    projectId,
    phase,
    errorCode: PROJECT_UNAVAILABLE_ERROR.code,
  });
}

function abortProviderStream(stream: { abort(): void }) {
  try {
    stream.abort();
  } catch {
    // Ownership loss remains authoritative if the provider has already completed cancellation.
  }
}

function getErrorStatus(err: unknown): number | null {
  if (typeof err !== "object" || err === null) return null;
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function normalizeAIError(err: unknown): { code: string; content: string } {
  const status = getErrorStatus(err);
  const message = err instanceof Error ? err.message : "";

  if (status === 401 || /invalid x-api-key|authentication_error/i.test(message)) {
    return {
      code: "AI_AUTH_FAILED",
      content: "AI provider authentication failed. Check your Anthropic API key in Settings.",
    };
  }

  if (status === 429 || /rate limit/i.test(message)) {
    return {
      code: "AI_RATE_LIMITED",
      content: "AI provider rate limit exceeded. Please try again later.",
    };
  }

  if (status === 404 && /model:/i.test(message)) {
    return {
      code: "AI_MODEL_UNAVAILABLE",
      content: "Selected AI model is unavailable. Switch models in Settings and try again.",
    };
  }

  return {
    code: "AI_REQUEST_FAILED",
    content: "AI request failed. Please try again later.",
  };
}

/**
 * Core streaming function used by both chat and chat/init routes.
 * - Saves user message (if provided) to DB
 * - Builds Anthropic messages with architecture context
 * - Streams the AI response via SSE
 * - Parses response for <stack> blocks, saves architecture to canvasState
 * - Emits architecture SSE event if architecture is found
 */
export function streamChat(
  db: AppDatabase,
  projectId: string,
  userMessage: string | null,
  initMessage?: string,
  user?: AuthenticatedUser,
  options: StreamChatOptions = {}
): Response {
  if (!user) {
    return new Response(
      sseEvent({
        type: "error",
        code: "AI_NOT_CONFIGURED",
        content: "Add your Anthropic API key in Settings to use StackHatch AI.",
        settingsUrl: "/settings",
      }),
      { headers: SSE_HEADERS, status: 503 }
    );
  }

  const { apiKey, model, customSubtypes } = getUserAiSettings(db, user.userId);
  if (!apiKey) {
    return new Response(
      sseEvent({
        type: "error",
        code: "AI_NOT_CONFIGURED",
        content: "Add your Anthropic API key in Settings to use StackHatch AI.",
        settingsUrl: "/settings",
      }),
      { headers: SSE_HEADERS, status: 503 }
    );
  }

  const systemPrompt = buildSystemPrompt(customSubtypes, {
    includeNoteNodes: true,
  });

  const originalOwnerId = user.userId;
  const hasOriginalOwner = prepareAccessibleProjectCheck(db, projectId, originalOwnerId);
  let project: { description: string | null; canvasState: string | null };
  try {
    project = db.transaction((tx) => {
      const ownedProject = tx
        .select({ description: projects.description, canvasState: projects.canvasState })
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, originalOwnerId)))
        .get();
      if (!ownedProject) throw new ProjectOwnershipLostError();

      if (userMessage) {
        tx.insert(messages)
          .values({
            id: createId(),
            projectId,
            role: "user",
            content: userMessage,
            createdAt: Date.now(),
          })
          .run();
      }
      return ownedProject;
    });
  } catch (error) {
    if (!(error instanceof ProjectOwnershipLostError)) throw error;
    logProjectOwnershipLoss(originalOwnerId, projectId, "request_persistence");
    return new Response(sseEvent(PROJECT_UNAVAILABLE_ERROR), {
      headers: SSE_HEADERS,
      status: 404,
    });
  }

  // Load chat history
  const history = db
    .select()
    .from(messages)
    .where(eq(messages.projectId, projectId))
    .orderBy(asc(messages.createdAt))
    .all();

  let persistedArchitecture: StackArchitecture | null = null;
  if (project?.canvasState) {
    try {
      persistedArchitecture = JSON.parse(project.canvasState);
    } catch {
      // Ignore malformed canvas state
    }
  }
  const currentArchitecture = options.repositoryScanReplacement
    ? null
    : options.contextArchitecture !== undefined
      ? options.contextArchitecture
      : persistedArchitecture;
  const effectiveHistory = options.repositoryScanReplacement ? [] : history;

  // Convert DB messages to ChatMessage format for context builder
  const chatHistory: ChatMessage[] = effectiveHistory.map((msg) => ({
    id: msg.id,
    projectId: msg.projectId,
    role: msg.role as "user" | "assistant",
    content: msg.content,
    createdAt: msg.createdAt,
  }));

  // Build Anthropic messages with architecture context
  let anthropicMessages = buildMessages(chatHistory, currentArchitecture, {
    nodeLockingEnabled: true,
  });

  // For init (no user message and no history), add init instruction as user message
  const isInitialization = !userMessage && effectiveHistory.length === 0;
  if (isInitialization) {
    const initContent =
      initMessage ??
      (project?.description
        ? `${INIT_INSTRUCTION}\n\nProject description: ${project.description}`
        : INIT_INSTRUCTION);
    anthropicMessages.push({
      role: "user",
      content: initContent,
    });
  }

  // Ensure messages alternate properly — Anthropic requires user first
  if (anthropicMessages.length > 0 && anthropicMessages[0].role !== "user") {
    anthropicMessages = [{ role: "user", content: INIT_INSTRUCTION }, ...anthropicMessages];
  }

  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let ownershipLossPhase: OwnershipLossPhase = "provider_stream";
      try {
        let fullResponse = "";
        const anthropicStream = client.messages.stream({
          model,
          max_tokens: 8192,
          system: systemPrompt,
          messages: anthropicMessages,
          ...(modelSupportsEffort(model) ? { output_config: { effort: "low" as const } } : {}),
        });

        for await (const event of anthropicStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            if (!hasOriginalOwner()) {
              abortProviderStream(anthropicStream);
              throw new ProjectOwnershipLostError();
            }
            const text = event.delta.text;
            fullResponse += text;
            controller.enqueue(encoder.encode(sseEvent({ type: "text", content: text })));
          }
        }

        ownershipLossPhase = "persistence";
        if (!hasOriginalOwner()) {
          abortProviderStream(anthropicStream);
          throw new ProjectOwnershipLostError();
        }

        // Parse the full response for architecture
        const parsed = parseAIResponse(fullResponse, { allowNoteNodes: true });

        if (
          options.repositoryScanReplacement &&
          (!parsed.architecture || parsed.architecture.nodes.length === 0)
        ) {
          controller.enqueue(
            encoder.encode(
              sseEvent({
                type: "error",
                code: "AI_INVALID_OUTPUT",
                content:
                  "StackHatch could not produce a usable architecture map. Your current map was kept; try scanning again.",
              })
            )
          );
          controller.close();
          return;
        }

        const saveTimestamp = Date.now();
        db.transaction((tx) => {
          const ownedProject = tx
            .select({ id: projects.id })
            .from(projects)
            .where(and(eq(projects.id, projectId), eq(projects.userId, originalOwnerId)))
            .get();
          if (!ownedProject) throw new ProjectOwnershipLostError();

          if (options.repositoryScanReplacement) {
            tx.delete(messages).where(eq(messages.projectId, projectId)).run();
          }

          if (isInitialization) {
            tx.insert(messages)
              .values({
                id: createId(),
                projectId,
                role: "user",
                content: initMessage ?? INIT_INSTRUCTION,
                createdAt: saveTimestamp - 1,
              })
              .run();
          }

          tx.insert(messages)
            .values({
              id: createId(),
              projectId,
              role: "assistant",
              content: fullResponse,
              createdAt: saveTimestamp,
            })
            .run();

          if (parsed.architecture) {
            tx.update(projects)
              .set({
                canvasState: JSON.stringify(parsed.architecture),
                ...(options.repositoryScanReplacement
                  ? {
                      repoUrl: options.repositoryScanReplacement.repoUrl,
                      repoCommitSha: options.repositoryScanReplacement.commitSha,
                      repoScannedAt: options.repositoryScanReplacement.scannedAt,
                      repoAnalysisStatus: options.repositoryScanReplacement.analysisStatus,
                      repoAnalysisWarning: options.repositoryScanReplacement.analysisWarning,
                    }
                  : {}),
                updatedAt: saveTimestamp,
              })
              .where(eq(projects.id, projectId))
              .run();
          }
        });

        if (!hasOriginalOwner()) {
          abortProviderStream(anthropicStream);
          throw new ProjectOwnershipLostError();
        }

        if (parsed.architecture) {
          controller.enqueue(
            encoder.encode(
              sseEvent({
                type: "architecture",
                content: parsed.architecture,
                ...(options.repositoryScanReplacement
                  ? { provenance: options.repositoryScanReplacement }
                  : {}),
              })
            )
          );
        }

        controller.enqueue(encoder.encode(sseEvent({ type: "done" })));
        controller.close();
      } catch (err) {
        if (err instanceof ProjectOwnershipLostError) {
          logProjectOwnershipLoss(originalOwnerId, projectId, ownershipLossPhase);
          controller.enqueue(encoder.encode(sseEvent(PROJECT_UNAVAILABLE_ERROR)));
          controller.close();
          return;
        }
        const error = normalizeAIError(err);
        controller.enqueue(encoder.encode(sseEvent({ type: "error", ...error })));
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
