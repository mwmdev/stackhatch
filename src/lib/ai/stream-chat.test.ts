import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, asc } from "drizzle-orm";
import * as schema from "@/db/schema";
import { projects, messages, users, userSettings } from "@/db/schema";
import { createTestDb as createConfiguredTestDb, type AppDatabase } from "@/db";
import { runMigrations } from "@/db/migrate";
import { deleteAccountById } from "@/lib/account-deletion";
import type { StackArchitecture } from "@/types/stack";
import { encryptSecret } from "@/lib/secrets";
import { DEFAULT_CHAT_PROMPT } from "@/lib/ai/default-prompts";

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
    CREATE TABLE users (
      id TEXT PRIMARY KEY NOT NULL,
      github_id TEXT NOT NULL UNIQUE,
      email TEXT,
      name TEXT,
      avatar_url TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      repo_url TEXT,
      repo_commit_sha TEXT,
      repo_scanned_at INTEGER,
      repo_analysis_status TEXT,
      repo_analysis_warning TEXT,
      canvas_state TEXT,
      user_id TEXT,
      team_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
    CREATE TABLE user_settings (
      user_id TEXT PRIMARY KEY NOT NULL,
      anthropic_api_key TEXT,
      model TEXT DEFAULT 'claude-sonnet-5' NOT NULL,
      theme TEXT DEFAULT 'system' NOT NULL,
      custom_subtypes TEXT DEFAULT '{}' NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    INSERT INTO settings (key, value)
    VALUES ('prompt_chat', 'LEGACY MUTABLE CHAT PROMPT');
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
  response: Response
): Promise<Array<{ type: string; content?: unknown; code?: string; settingsUrl?: string }>> {
  const text = await response.text();
  const events: Array<{
    type: string;
    content?: unknown;
    code?: string;
    settingsUrl?: string;
  }> = [];
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
const testUser = {
  id: "test-user-1",
  githubId: "12345",
  email: "test@example.com",
  name: "Test User",
  avatarUrl: "https://example.com/avatar.png",
  createdAt: Date.now(),
};
const authenticatedUser = {
  userId: testUser.id,
  githubId: testUser.githubId,
  name: testUser.name,
  email: testUser.email,
  image: testUser.avatarUrl,
};

function seedStreamDatabase(targetDb: AppDatabase) {
  targetDb.insert(users).values(testUser).run();
  targetDb
    .insert(projects)
    .values({
      id: projectId,
      name: "Test Project",
      description: null,
      canvasState: null,
      userId: testUser.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    .run();
  targetDb
    .insert(userSettings)
    .values({
      userId: testUser.id,
      anthropicApiKey: encryptSecret("sk-ant-test123"),
      model: "claude-sonnet-5",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    .run();
}

function createRaceDatabases() {
  const directory = mkdtempSync(join(tmpdir(), "stackhatch-stream-race-"));
  const databasePath = join(directory, "race.db");
  const streamDb = createConfiguredTestDb(databasePath);
  runMigrations(streamDb);
  seedStreamDatabase(streamDb);
  const deletionDb = createConfiguredTestDb(databasePath);
  runMigrations(deletionDb);
  return {
    streamDb,
    deletionDb,
    close() {
      deletionDb.$client.close();
      streamDb.$client.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

beforeEach(() => {
  db = createTestDb();
  vi.clearAllMocks();
  seedStreamDatabase(db);
});

describe("streamChat", () => {
  it("streams text response via SSE", async () => {
    const mockClient = mockAnthropicStream("Hello, world!");
    vi.mocked(Anthropic).mockImplementation(() => mockClient as unknown as Anthropic);

    const response = streamChat(db, projectId, "Hi there", undefined, authenticatedUser);
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
    vi.mocked(Anthropic).mockImplementation(() => mockClient as unknown as Anthropic);

    const response = streamChat(db, projectId, "My test message", undefined, authenticatedUser);
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
    vi.mocked(Anthropic).mockImplementation(() => mockClient as unknown as Anthropic);

    const response = streamChat(db, projectId, "Hello", undefined, authenticatedUser);
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
    vi.mocked(Anthropic).mockImplementation(() => mockClient as unknown as Anthropic);

    const response = streamChat(db, projectId, "Build a React app", undefined, authenticatedUser);
    const events = await readSSEEvents(response);

    // Should emit architecture event
    const archEvent = events.find((e) => e.type === "architecture");
    expect(archEvent).toBeDefined();
    expect(archEvent!.content).toEqual(architecture);

    // Should save to canvasState in DB
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
    expect(project!.canvasState).not.toBeNull();
    const savedArch = JSON.parse(project!.canvasState!);
    expect(savedArch.nodes).toHaveLength(1);
    expect(savedArch.nodes[0].name).toBe("React Frontend");
  });

  it("handles response without architecture (pure chat)", async () => {
    const mockClient = mockAnthropicStream("What kind of app are you building?");
    vi.mocked(Anthropic).mockImplementation(() => mockClient as unknown as Anthropic);

    const response = streamChat(
      db,
      projectId,
      "I want to build an app",
      undefined,
      authenticatedUser
    );
    const events = await readSSEEvents(response);

    // No architecture event
    const archEvent = events.find((e) => e.type === "architecture");
    expect(archEvent).toBeUndefined();

    // canvasState should still be null
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
    expect(project!.canvasState).toBeNull();
  });

  it("returns error when API key is not configured", async () => {
    db.delete(userSettings).where(eq(userSettings.userId, testUser.id)).run();

    const response = streamChat(db, projectId, "Hello", undefined, authenticatedUser);
    const events = await readSSEEvents(response);

    expect(response.status).toBe(503);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
    expect(events[0].code).toBe("AI_NOT_CONFIGURED");
    expect(events[0].content).toContain("Add your Anthropic API key");
    expect(events[0].settingsUrl).toBe("/settings");
    expect(Anthropic).not.toHaveBeenCalled();
  });

  it("does not fall back to a server API key", async () => {
    db.delete(userSettings).where(eq(userSettings.userId, testUser.id)).run();
    process.env.ANTHROPIC_API_KEY = "sk-ant-env-key";

    try {
      const response = streamChat(db, projectId, "Hello", undefined, authenticatedUser);
      const events = await readSSEEvents(response);

      expect(response.status).toBe(503);
      expect(events[0].code).toBe("AI_NOT_CONFIGURED");
      expect(Anthropic).not.toHaveBeenCalled();
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it("uses the authenticated user's encrypted BYOK key", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-env-key";
    db.update(userSettings)
      .set({ anthropicApiKey: encryptSecret("sk-ant-user-key"), updatedAt: Date.now() })
      .where(eq(userSettings.userId, testUser.id))
      .run();

    const mockClient = mockAnthropicStream("Response");
    vi.mocked(Anthropic).mockImplementation(() => mockClient as unknown as Anthropic);

    const response = streamChat(db, projectId, "Hello", undefined, authenticatedUser);
    await response.text();

    expect(Anthropic).toHaveBeenCalledWith({ apiKey: "sk-ant-user-key" });
    delete process.env.ANTHROPIC_API_KEY;
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
    vi.mocked(Anthropic).mockImplementation(() => mockClient as unknown as Anthropic);

    const response = streamChat(db, projectId, "Hello", undefined, authenticatedUser);
    const events = await readSSEEvents(response);

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.code).toBe("AI_RATE_LIMITED");
    expect(errorEvent!.content).toBe("AI provider rate limit exceeded. Please try again later.");
    expect(db.select().from(messages).where(eq(messages.projectId, projectId)).all()).toEqual([
      expect.objectContaining({ role: "user", content: "Hello" }),
    ]);
  });

  it("normalizes Anthropic authentication errors", async () => {
    const authError = new Error(
      '401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'
    );
    const mockClient = {
      messages: {
        stream: vi.fn().mockReturnValue({
          [Symbol.asyncIterator]: () => ({
            async next() {
              throw authError;
            },
          }),
        }),
      },
    };
    vi.mocked(Anthropic).mockImplementation(() => mockClient as unknown as Anthropic);

    const response = streamChat(db, projectId, "Hello", undefined, authenticatedUser);
    const events = await readSSEEvents(response);

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.code).toBe("AI_AUTH_FAILED");
    expect(errorEvent!.content).toBe(
      "AI provider authentication failed. Check your Anthropic API key in Settings."
    );
  });

  it("normalizes unavailable model errors", async () => {
    const modelError = Object.assign(
      new Error(
        '404 {"type":"error","error":{"type":"not_found_error","message":"model: claude-haiku-235-20241022"}}'
      ),
      { status: 404 }
    );
    const mockClient = {
      messages: {
        stream: vi.fn().mockReturnValue({
          [Symbol.asyncIterator]: () => ({
            async next() {
              throw modelError;
            },
          }),
        }),
      },
    };
    vi.mocked(Anthropic).mockImplementation(() => mockClient as unknown as Anthropic);

    const response = streamChat(db, projectId, "Hello", undefined, authenticatedUser);
    const events = await readSSEEvents(response);

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.code).toBe("AI_MODEL_UNAVAILABLE");
    expect(errorEvent!.content).toBe(
      "Selected AI model is unavailable. Switch models in Settings and try again."
    );
  });

  it("triggers init flow when no user message and no history", async () => {
    const mockClient = mockAnthropicStream("Welcome! What are you building?");
    vi.mocked(Anthropic).mockImplementation(() => mockClient as unknown as Anthropic);

    const response = streamChat(db, projectId, null, undefined, authenticatedUser);
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

  it("uses the authenticated user's selected model", async () => {
    db.update(userSettings)
      .set({ model: "claude-opus-4-8", updatedAt: Date.now() })
      .where(eq(userSettings.userId, testUser.id))
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
    vi.mocked(Anthropic).mockImplementation(() => mockClient as unknown as Anthropic);

    const response = streamChat(db, projectId, "Hello", undefined, authenticatedUser);
    await response.text();

    expect(streamFn).toHaveBeenCalledWith(expect.objectContaining({ model: "claude-opus-4-8" }));
  });

  it("uses the checked-in chat prompt with only the authenticated user's subtype catalog", async () => {
    db.update(userSettings)
      .set({
        customSubtypes: JSON.stringify({
          client: [{ slug: "owner-kiosk", displayName: "Owner kiosk", icon: "Box" }],
        }),
        updatedAt: Date.now(),
      })
      .where(eq(userSettings.userId, testUser.id))
      .run();
    db.insert(users)
      .values({
        id: "other-user",
        githubId: "67890",
        createdAt: Date.now(),
      })
      .run();
    db.insert(userSettings)
      .values({
        userId: "other-user",
        customSubtypes: JSON.stringify({
          client: [{ slug: "other-kiosk", displayName: "Other kiosk", icon: "Box" }],
        }),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();

    const streamFn = vi.fn().mockReturnValue({
      [Symbol.asyncIterator]: () => ({
        async next() {
          return { done: true, value: undefined };
        },
      }),
    });
    vi.mocked(Anthropic).mockImplementation(
      () => ({ messages: { stream: streamFn } }) as unknown as Anthropic
    );

    const response = streamChat(db, projectId, "Hello", undefined, authenticatedUser);
    await response.text();

    const system = streamFn.mock.calls[0][0].system as string;
    expect(system).toContain(DEFAULT_CHAT_PROMPT);
    expect(system).toContain("owner-kiosk");
    expect(system).not.toContain("other-kiosk");
    expect(system).not.toContain("LEGACY MUTABLE CHAT PROMPT");
  });

  it("uses Sonnet by default", async () => {
    const mockClient = mockAnthropicStream("Response");
    const streamFn = vi.fn().mockReturnValue({
      [Symbol.asyncIterator]: () => ({
        async next() {
          return { done: true, value: undefined };
        },
      }),
    });
    (mockClient.messages as { stream: typeof streamFn }).stream = streamFn;
    vi.mocked(Anthropic).mockImplementation(() => mockClient as unknown as Anthropic);

    const response = streamChat(db, projectId, "Hello", undefined, authenticatedUser);
    await response.text();

    expect(streamFn).toHaveBeenCalledWith(expect.objectContaining({ model: "claude-sonnet-5" }));
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
    vi.mocked(Anthropic).mockImplementation(() => mockClient as unknown as Anthropic);

    const response = streamChat(db, projectId, "Add a cache layer", undefined, authenticatedUser);
    await response.text();

    // Verify that the messages include architecture context
    const callArgs = streamFn.mock.calls[0][0];
    const allContent = callArgs.messages.map((m: { content: string }) => m.content).join(" ");
    expect(allContent).toContain("LOCKED");
    expect(allContent).toContain("PostgreSQL");
  });

  it("uses request-provided architecture context instead of stale persisted canvasState", async () => {
    const staleArch: StackArchitecture = {
      nodes: [
        {
          id: "stale-1",
          category: "data",
          subtype: "sql-db",
          name: "Old Database",
          technology: "MySQL",
          description: "Persisted but stale",
          reasoning: "",
          locked: false,
        },
      ],
      edges: [],
    };
    const liveArch: StackArchitecture = {
      nodes: [
        {
          id: "live-1",
          category: "note",
          subtype: "note",
          name: "Live Note",
          technology: "",
          description: "Fresh unsaved edit",
          reasoning: "",
          locked: false,
          noteColor: "sky",
        },
      ],
      edges: [],
    };

    db.update(projects)
      .set({ canvasState: JSON.stringify(staleArch) })
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
    vi.mocked(Anthropic).mockImplementation(() => mockClient as unknown as Anthropic);

    const response = streamChat(db, projectId, "Use the note", undefined, authenticatedUser, {
      contextArchitecture: liveArch,
    });
    await response.text();

    const callArgs = streamFn.mock.calls[0][0];
    const allContent = callArgs.messages.map((m: { content: string }) => m.content).join(" ");
    expect(allContent).toContain("Live Note");
    expect(allContent).toContain('"noteColor":"sky"');
    expect(allContent).not.toContain("Old Database");
  });

  it("handles malformed canvasState gracefully", async () => {
    // Set malformed canvas state
    db.update(projects)
      .set({ canvasState: "not-valid-json" })
      .where(eq(projects.id, projectId))
      .run();

    const mockClient = mockAnthropicStream("Response");
    vi.mocked(Anthropic).mockImplementation(() => mockClient as unknown as Anthropic);

    const response = streamChat(db, projectId, "Hello", undefined, authenticatedUser);
    const events = await readSSEEvents(response);

    // Should still work — just no architecture context
    const textEvents = events.filter((e) => e.type === "text");
    const fullText = textEvents.map((e) => e.content).join("");
    expect(fullText).toBe("Response");
    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  it("handles malformed <stack> JSON in AI response", async () => {
    const responseText = "Here's your architecture:\n\n<stack>\n{invalid json}\n</stack>";
    const mockClient = mockAnthropicStream(responseText);
    vi.mocked(Anthropic).mockImplementation(() => mockClient as unknown as Anthropic);

    const response = streamChat(db, projectId, "Build something", undefined, authenticatedUser);
    const events = await readSSEEvents(response);

    // No architecture event for malformed JSON
    expect(events.find((e) => e.type === "architecture")).toBeUndefined();

    // canvasState should stay null
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
    expect(project!.canvasState).toBeNull();

    // Should still emit done
    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  it("keeps the current map and conversation when repository output is invalid", async () => {
    const existingArchitecture: StackArchitecture = {
      nodes: [
        {
          id: "existing",
          category: "client",
          subtype: "web-app",
          name: "Existing map",
          technology: "React",
          description: "Keep this map",
          reasoning: "It is the last valid scan",
          locked: false,
        },
      ],
      edges: [],
    };
    db.update(projects)
      .set({
        repoUrl: "https://github.com/acme/old",
        canvasState: JSON.stringify(existingArchitecture),
      })
      .where(eq(projects.id, projectId))
      .run();
    db.insert(messages)
      .values({
        id: "old-message",
        projectId,
        role: "assistant",
        content: "Existing conversation",
        createdAt: 1,
      })
      .run();

    vi.mocked(Anthropic).mockImplementation(
      () => mockAnthropicStream("No structured map was returned") as unknown as Anthropic
    );

    const response = streamChat(db, projectId, null, "Analyze new evidence", authenticatedUser, {
      repositoryScanReplacement: {
        repoUrl: "https://github.com/acme/new",
        commitSha: "newsha",
        scannedAt: 200,
        analysisStatus: "complete",
        analysisWarning: null,
      },
    });
    const events = await readSSEEvents(response);

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "error", code: "AI_INVALID_OUTPUT" }),
      ])
    );
    expect(events.some((event) => event.type === "done")).toBe(false);
    expect(db.select().from(projects).where(eq(projects.id, projectId)).get()).toMatchObject({
      repoUrl: "https://github.com/acme/old",
      canvasState: JSON.stringify(existingArchitecture),
    });
    expect(db.select().from(messages).where(eq(messages.projectId, projectId)).all()).toEqual([
      expect.objectContaining({ id: "old-message" }),
    ]);
  });

  it("atomically replaces a repository map, conversation, and provenance after valid output", async () => {
    const replacement: StackArchitecture = {
      nodes: [
        {
          id: "new-api",
          category: "api",
          subtype: "rest-api",
          name: "New API",
          technology: "Next.js",
          description: "Replacement map",
          reasoning: "Observed in the new revision",
          locked: false,
        },
      ],
      edges: [],
    };
    db.update(projects)
      .set({ canvasState: JSON.stringify({ nodes: [], edges: [] }) })
      .where(eq(projects.id, projectId))
      .run();
    db.insert(messages)
      .values({
        id: "old-message",
        projectId,
        role: "assistant",
        content: "Old conversation",
        createdAt: 1,
      })
      .run();
    const responseText = `<stack>${JSON.stringify(replacement)}</stack>`;
    vi.mocked(Anthropic).mockImplementation(
      () => mockAnthropicStream(responseText) as unknown as Anthropic
    );

    const response = streamChat(db, projectId, null, "Analyze new evidence", authenticatedUser, {
      repositoryScanReplacement: {
        repoUrl: "https://github.com/acme/new",
        commitSha: "newsha",
        scannedAt: 200,
        analysisStatus: "partial",
        analysisWarning: "README was shortened.",
      },
    });
    const events = await readSSEEvents(response);

    expect(events.find((event) => event.type === "architecture")).toMatchObject({
      content: replacement,
    });
    expect(db.select().from(projects).where(eq(projects.id, projectId)).get()).toMatchObject({
      repoUrl: "https://github.com/acme/new",
      repoCommitSha: "newsha",
      repoScannedAt: 200,
      repoAnalysisStatus: "partial",
      repoAnalysisWarning: "README was shortened.",
      canvasState: JSON.stringify(replacement),
    });
    const savedMessages = db
      .select()
      .from(messages)
      .where(eq(messages.projectId, projectId))
      .orderBy(asc(messages.createdAt))
      .all();
    expect(savedMessages).toHaveLength(2);
    expect(savedMessages.some((message) => message.id === "old-message")).toBe(false);
  });

  it("aborts provider output and persists nothing after account deletion is observed", async () => {
    const race = createRaceDatabases();
    const abort = vi.fn();
    let index = 0;
    const providerStream = {
      abort,
      [Symbol.asyncIterator]: () => ({
        async next() {
          if (index++ === 0) {
            return {
              done: false,
              value: {
                type: "content_block_delta",
                delta: { type: "text_delta", text: "A" },
              },
            };
          }
          deleteAccountById(race.deletionDb, testUser.id);
          return {
            done: false,
            value: {
              type: "content_block_delta",
              delta: { type: "text_delta", text: "B" },
            },
          };
        },
      }),
    };
    vi.mocked(Anthropic).mockImplementation(
      () => ({ messages: { stream: vi.fn(() => providerStream) } }) as unknown as Anthropic
    );

    const response = streamChat(
      race.streamDb,
      projectId,
      "Keep this history on provider failure",
      undefined,
      authenticatedUser
    );
    const events = await readSSEEvents(response);

    expect(events.filter((event) => event.type === "text").map((event) => event.content)).toEqual([
      "A",
    ]);
    expect(events.some((event) => event.type === "done")).toBe(false);
    expect(abort).toHaveBeenCalledTimes(1);
    expect(race.streamDb.select().from(users).all()).toEqual([]);
    expect(race.streamDb.select().from(projects).all()).toEqual([]);
    expect(race.streamDb.select().from(messages).all()).toEqual([]);
    race.close();
  });

  it("begins final persistence by rechecking the original project owner", async () => {
    const race = createRaceDatabases();
    let finished = false;
    const providerStream = {
      [Symbol.asyncIterator]: () => ({
        async next() {
          if (!finished) {
            finished = true;
            return {
              done: false,
              value: {
                type: "content_block_delta",
                delta: { type: "text_delta", text: "Complete response" },
              },
            };
          }
          deleteAccountById(race.deletionDb, testUser.id);
          return { done: true, value: undefined };
        },
      }),
    };
    vi.mocked(Anthropic).mockImplementation(
      () => ({ messages: { stream: vi.fn(() => providerStream) } }) as unknown as Anthropic
    );

    const response = streamChat(
      race.streamDb,
      projectId,
      "User message",
      undefined,
      authenticatedUser,
      {
        repositoryScanReplacement: {
          repoUrl: "https://github.com/acme/new",
          commitSha: "newsha",
          scannedAt: 200,
          analysisStatus: "complete",
          analysisWarning: null,
        },
      }
    );
    const events = await readSSEEvents(response);

    expect(events.some((event) => event.type === "architecture")).toBe(false);
    expect(events.some((event) => event.type === "done")).toBe(false);
    expect(race.streamDb.select().from(users).all()).toEqual([]);
    expect(race.streamDb.select().from(projects).all()).toEqual([]);
    expect(race.streamDb.select().from(messages).all()).toEqual([]);
    race.close();
  });
});
