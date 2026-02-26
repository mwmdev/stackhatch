import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { messages, projects, settings } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq, asc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, INIT_INSTRUCTION } from "@/lib/ai/system-prompt";

const chatSchema = z.object({
  message: z.string().min(1),
});

function getSettings(db: ReturnType<typeof getDb>) {
  const rows = db.select().from(settings).all();
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

function getApiKey(settingsMap: Record<string, string>): string | null {
  return settingsMap.apiKey || process.env.ANTHROPIC_API_KEY || null;
}

function getModel(settingsMap: Record<string, string>): string {
  return (
    settingsMap.model ||
    process.env.ANTHROPIC_MODEL ||
    "claude-sonnet-4-20250514"
  );
}

async function streamChat(
  db: ReturnType<typeof getDb>,
  projectId: string,
  userMessage: string | null,
) {
  const settingsMap = getSettings(db);
  const apiKey = getApiKey(settingsMap);
  if (!apiKey) {
    return new Response(
      `data: ${JSON.stringify({ type: "error", content: "API key not configured. Please set it in Settings." })}\n\n`,
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      },
    );
  }

  const model = getModel(settingsMap);

  // Save user message if present
  if (userMessage) {
    db.insert(messages)
      .values({
        id: uuid(),
        projectId,
        role: "user",
        content: userMessage,
        createdAt: Date.now(),
      })
      .run();
  }

  // Load chat history
  const history = db
    .select()
    .from(messages)
    .where(eq(messages.projectId, projectId))
    .orderBy(asc(messages.createdAt))
    .all();

  // Build Anthropic messages
  const anthropicMessages: Anthropic.MessageParam[] = history.map((msg) => ({
    role: msg.role as "user" | "assistant",
    content: msg.content,
  }));

  // For init (no user message and no history), add init instruction as user message
  if (!userMessage && history.length === 0) {
    anthropicMessages.push({
      role: "user",
      content: INIT_INSTRUCTION,
    });
  }

  const client = new Anthropic({ apiKey });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        let fullResponse = "";
        const anthropicStream = client.messages.stream({
          model,
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: anthropicMessages,
        });

        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const text = event.delta.text;
            fullResponse += text;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "text", content: text })}\n\n`,
              ),
            );
          }
        }

        // Save assistant message
        db.insert(messages)
          .values({
            id: uuid(),
            projectId,
            role: "assistant",
            content: fullResponse,
            createdAt: Date.now(),
          })
          .run();

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "done" })}\n\n`,
          ),
        );
        controller.close();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", content: errorMessage })}\n\n`,
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function POST(
  request: NextRequest,
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

  const body = await request.json();
  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: parsed.error.issues[0].message }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  return streamChat(db, id, parsed.data.message);
}
