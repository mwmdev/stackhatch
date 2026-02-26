import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { messages, projects, settings } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq, asc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, INIT_INSTRUCTION } from "@/lib/ai/system-prompt";

function getSettings(db: ReturnType<typeof getDb>) {
  const rows = db.select().from(settings).all();
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

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
    return new Response(JSON.stringify({ error: "Chat already initialized" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const settingsMap = getSettings(db);
  const apiKey =
    settingsMap.apiKey || process.env.ANTHROPIC_API_KEY || null;

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

  const model =
    settingsMap.model ||
    process.env.ANTHROPIC_MODEL ||
    "claude-sonnet-4-20250514";

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
          messages: [{ role: "user", content: INIT_INSTRUCTION }],
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

        // Save the init instruction as a hidden user message and the response
        db.insert(messages)
          .values({
            id: uuid(),
            projectId: id,
            role: "user",
            content: INIT_INSTRUCTION,
            createdAt: Date.now(),
          })
          .run();

        db.insert(messages)
          .values({
            id: uuid(),
            projectId: id,
            role: "assistant",
            content: fullResponse,
            createdAt: Date.now() + 1,
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
