import { describe, it, expect, beforeEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, asc } from "drizzle-orm";
import * as schema from "@/db/schema";
import { projects, messages, settings } from "@/db/schema";
import type { AppDatabase } from "@/db";

// Mock the Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn(),
  };
});

// Import after mock setup
import Anthropic from "@anthropic-ai/sdk";
import { streamChat } from "./stream-chat";

function createTestDb(): AppDatabase {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");

  sqlite.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      repo_url TEXT,
      canvas_state TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);

  return drizzle(sqlite, { schema });
}

/** Helper to create a mock Anthropic stream that yields text events */
function mockAnthropicStream(text: string) {
  const chunks = text.split("");
  return {
    messages: {
      stream: vi.fn().mockReturnValue({
        [Symbol.asyncIterator]: () => {
          let index = 0;
          return {
            async next() {
              if (index < chunks.length) {
                const chunk = chunks[index++];
                return {
                  done: false,
                  value: {
                    type: "content_block_delta",
                    delta: { type: "text_delta", text: chunk },
                  },
                };
              }
              return { done: true, value: undefined };
            },
          };
        },
      }),
    },
  };
}

/** Helper to read the full SSE response body as parsed events */
async function readSSEEvents(
  response: Response,
): Promise<Array<{ type: string; content?: unknown }>> {
  const text = await response.text();
  const events: Array<{ type: string; content?: unknown }> = [];
  const lines = text.split("\n");
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try {
        events.push(JSON.parse(line.slice(6)));
      } catch {
        // skip malformed
      }
    }
  }
  return events;
}

let db: AppDatabase;
const projectId = "test-proj-1";

beforeEach(() => {
  db = createTestDb();
  vi.clearAllMocks();

  // Insert a test project
  db.insert(projects)
    .values({
      id: projectId,
      name: "Test Project",
      description: null,
      canvasState: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    .run();

  // Set API key in settings
  db.insert(settings).values({ key: "apiKey", value: "sk-ant-test123" }).run();
});

describe("streamChat", () => {
  it("streams text response via SSE", async () => {
    const mockClient = mockAnthropicStream("Hello, world!");
    vi.mocked(Anthropic).mockImplementation(
      () => mockClient as unknown as Anthropic,
    );

    const response = streamChat(db, projectId, "Hi there");
    const events = await readSSEEvents(response);

    // Should have text events + done
    const textEvents = events.filter((e) => e.type === "text");
    expect(textEvents.length).toBeGreaterThan(0);

    // Reassemble text
    const fullText = textEvents.map((e) => e.content).join("");
    expect(fullText).toBe("Hello, world!");

    // Should have a done event
    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  it("persists user message to database", async () => {
    const mockClient = mockAnthropicStream("Response");
    vi.mocked(Anthropic).mockImplementation(
      () => mockClient as unknown as Anthropic,
    );

    const response = streamChat(db, projectId, "My test message");
    await response.text(); // consume stream

    const msgs = db
      .select()
      .from(messages)
      .where(eq(messages.projectId, projectId))
      .orderBy(asc(messages.createdAt))
      .all();

    const userMsg = msgs.find((m) => m.role === "user");
    expect(userMsg).toBeDefined();
    expect(userMsg!.content).toBe("My test message");
  });

  it("persists assistant response to database", async () => {
    const mockClient = mockAnthropicStream("AI response text");
    vi.mocked(Anthropic).mockImplementation(
      () => mockClient as unknown as Anthropic,
    );

    const response = streamChat(db, projectId, "Hello");
    await response.text();

    const msgs = db
      .select()
      .from(messages)
      .where(eq(messages.projectId, projectId))
      .orderBy(asc(messages.createdAt))
      .all();

    const assistantMsg = msgs.find((m) => m.role === "assistant");
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg!.content).toBe("AI response text");
  });

  it("extracts architecture from <stack> block and saves to canvasState", async () => {
    const architecture = {
      nodes: [
        {
          id: "node-1",
          category: "client",
          subtype: "web-app",
          name: "React Frontend",
          technology: "React 19",
          description: "Main web client",
          reasoning: "Modern React for SPA",
          locked: false,
        },
      ],
      edges: [],
    };

    const responseText = `Here's your architecture:\n\n<stack>\n${JSON.stringify(architecture)}\n</stack>\n\nLet me know what you think!`;
    const mockClient = mockAnthropicStream(responseText);
    vi.mocked(Anthropic).mockImplementation(
      () => mockClient as unknown as Anthropic,
    );

    const response = streamChat(db, projectId, "Build a React app");
    const events = await readSSEEvents(response);

    // Should emit architecture event
    const archEvent = events.find((e) => e.type === "architecture");
    expect(archEvent).toBeDefined();
    expect(archEvent!.content).toEqual(architecture);

    // Should save to canvasState in DB
    const project = db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .get();
    expect(project!.canvasState).not.toBeNull();
    const savedArch = JSON.parse(project!.canvasState!);
    expect(savedArch.nodes).toHaveLength(1);
    expect(savedArch.nodes[0].name).toBe("React Frontend");
  });

  it("handles response without architecture (pure chat)", async () => {
    const mockClient = mockAnthropicStream(
      "What kind of app are you building?",
    );
    vi.mocked(Anthropic).mockImplementation(
      () => mockClient as unknown as Anthropic,
    );

    const response = streamChat(db, projectId, "I want to build an app");
    const events = await readSSEEvents(response);

    // No architecture event
    const archEvent = events.find((e) => e.type === "architecture");
    expect(archEvent).toBeUndefined();

    // canvasState should still be null
    const project = db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .get();
    expect(project!.canvasState).toBeNull();
  });

  it("returns error when API key is not configured", async () => {
    // Remove API key
    db.delete(settings).where(eq(settings.key, "apiKey")).run();

    // Clear env var
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    try {
      const response = streamChat(db, projectId, "Hello");
      const events = await readSSEEvents(response);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("error");
      expect(events[0].content).toContain("API key not configured");
    } finally {
      if (original) process.env.ANTHROPIC_API_KEY = original;
    }
  });

  it("falls back to env var for API key", async () => {
    // Remove DB setting
    db.delete(settings).where(eq(settings.key, "apiKey")).run();

    // Set env var
    const original = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-env-key";

    try {
      const mockClient = mockAnthropicStream("Response");
      vi.mocked(Anthropic).mockImplementation(
        () => mockClient as unknown as Anthropic,
      );

      const response = streamChat(db, projectId, "Hello");
      await response.text();

      // Verify Anthropic was called with the env key
      expect(Anthropic).toHaveBeenCalledWith({ apiKey: "sk-ant-env-key" });
    } finally {
      if (original) {
        process.env.ANTHROPIC_API_KEY = original;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
    }
  });

  it("handles Anthropic API errors gracefully", async () => {
    const mockClient = {
      messages: {
        stream: vi.fn().mockReturnValue({
          [Symbol.asyncIterator]: () => ({
            async next() {
              throw new Error("Rate limit exceeded");
            },
          }),
        }),
      },
    };
    vi.mocked(Anthropic).mockImplementation(
      () => mockClient as unknown as Anthropic,
    );

    const response = streamChat(db, projectId, "Hello");
    const events = await readSSEEvents(response);

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.content).toBe("Rate limit exceeded");
  });

  it("triggers init flow when no user message and no history", async () => {
    const mockClient = mockAnthropicStream(
      "Welcome! What are you building?",
    );
    vi.mocked(Anthropic).mockImplementation(
      () => mockClient as unknown as Anthropic,
    );

    const response = streamChat(db, projectId, null);
    const events = await readSSEEvents(response);

    const textEvents = events.filter((e) => e.type === "text");
    const fullText = textEvents.map((e) => e.content).join("");
    expect(fullText).toBe("Welcome! What are you building?");

    // Should save init instruction + assistant response
    const msgs = db
      .select()
      .from(messages)
      .where(eq(messages.projectId, projectId))
      .orderBy(asc(messages.createdAt))
      .all();

    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toContain("Begin the architecture interview");
    expect(msgs[1].role).toBe("assistant");
    expect(msgs[1].content).toBe("Welcome! What are you building?");
  });

  it("uses model from settings", async () => {
    db.insert(settings)
      .values({ key: "model", value: "claude-opus-4-20250514" })
      .run();

    const mockClient = mockAnthropicStream("Response");
    const streamFn = vi.fn().mockReturnValue({
      [Symbol.asyncIterator]: () => ({
        async next() {
          return { done: true, value: undefined };
        },
      }),
    });
    (mockClient.messages as { stream: typeof streamFn }).stream = streamFn;
    vi.mocked(Anthropic).mockImplementation(
      () => mockClient as unknown as Anthropic,
    );

    const response = streamChat(db, projectId, "Hello");
    await response.text();

    expect(streamFn).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-opus-4-20250514" }),
    );
  });

  it("includes architecture context when canvasState exists", async () => {
    const existingArch = {
      nodes: [
        {
          id: "existing-1",
          category: "data",
          subtype: "sql-db",
          name: "PostgreSQL",
          technology: "PostgreSQL 16",
          description: "Primary database",
          reasoning: "Reliable SQL DB",
          locked: true,
        },
      ],
      edges: [],
    };

    // Set existing canvas state
    db.update(projects)
      .set({ canvasState: JSON.stringify(existingArch) })
      .where(eq(projects.id, projectId))
      .run();

    const streamFn = vi.fn().mockReturnValue({
      [Symbol.asyncIterator]: () => ({
        async next() {
          return { done: true, value: undefined };
        },
      }),
    });
    const mockClient = { messages: { stream: streamFn } };
    vi.mocked(Anthropic).mockImplementation(
      () => mockClient as unknown as Anthropic,
    );

    const response = streamChat(db, projectId, "Add a cache layer");
    await response.text();

    // Verify that the messages include architecture context
    const callArgs = streamFn.mock.calls[0][0];
    const allContent = callArgs.messages
      .map((m: { content: string }) => m.content)
      .join(" ");
    expect(allContent).toContain("LOCKED");
    expect(allContent).toContain("PostgreSQL");
  });

  it("handles malformed canvasState gracefully", async () => {
    // Set malformed canvas state
    db.update(projects)
      .set({ canvasState: "not-valid-json" })
      .where(eq(projects.id, projectId))
      .run();

    const mockClient = mockAnthropicStream("Response");
    vi.mocked(Anthropic).mockImplementation(
      () => mockClient as unknown as Anthropic,
    );

    const response = streamChat(db, projectId, "Hello");
    const events = await readSSEEvents(response);

    // Should still work — just no architecture context
    const textEvents = events.filter((e) => e.type === "text");
    const fullText = textEvents.map((e) => e.content).join("");
    expect(fullText).toBe("Response");
    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  it("handles malformed <stack> JSON in AI response", async () => {
    const responseText =
      "Here's your architecture:\n\n<stack>\n{invalid json}\n</stack>";
    const mockClient = mockAnthropicStream(responseText);
    vi.mocked(Anthropic).mockImplementation(
      () => mockClient as unknown as Anthropic,
    );

    const response = streamChat(db, projectId, "Build something");
    const events = await readSSEEvents(response);

    // No architecture event for malformed JSON
    expect(events.find((e) => e.type === "architecture")).toBeUndefined();

    // canvasState should stay null
    const project = db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .get();
    expect(project!.canvasState).toBeNull();

    // Should still emit done
    expect(events.some((e) => e.type === "done")).toBe(true);
  });
});
