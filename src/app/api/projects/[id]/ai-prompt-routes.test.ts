import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { projects, userSettings, users } from "@/db/schema";
import type { AppDatabase } from "@/db";
import { encryptSecret } from "@/lib/secrets";
import { DEFAULT_ALTERNATIVES_PROMPT, DEFAULT_PRD_PROMPT } from "@/lib/ai/default-prompts";

let testDb: AppDatabase;

const anthropicMocks = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(() => ({ messages: { create: anthropicMocks.create } })),
}));

vi.mock("@/db", () => ({
  getDb: () => testDb,
}));

vi.mock("@/db/migrate", () => ({
  runMigrations: () => {},
}));

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn(() =>
    Promise.resolve({
      userId: "test-user",
      githubId: "github-user",
      name: "Test User",
      email: "test@example.com",
      image: null,
    })
  ),
}));

const alternativesRoute = await import("@/app/api/projects/[id]/alternatives/route");
const exportPrdRoute = await import("@/app/api/projects/[id]/export-prd/route");

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
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE user_settings (
      user_id TEXT PRIMARY KEY NOT NULL,
      anthropic_api_key TEXT,
      model TEXT DEFAULT 'claude-sonnet-5' NOT NULL,
      theme TEXT DEFAULT 'system' NOT NULL,
      custom_subtypes TEXT DEFAULT '{}' NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    INSERT INTO settings (key, value) VALUES
      ('prompt_alternatives', 'LEGACY MUTABLE ALTERNATIVES PROMPT'),
      ('prompt_prd', 'LEGACY MUTABLE PRD PROMPT');
  `);
  return drizzle(sqlite, { schema });
}

function makeParams() {
  return { params: Promise.resolve({ id: "project-1" }) };
}

beforeEach(() => {
  testDb = createTestDb();
  anthropicMocks.create.mockReset();

  testDb.insert(users).values({ id: "test-user", githubId: "github-user", createdAt: 1 }).run();
  testDb
    .insert(userSettings)
    .values({
      userId: "test-user",
      anthropicApiKey: encryptSecret("sk-ant-user-key"),
      createdAt: 1,
      updatedAt: 1,
    })
    .run();
  testDb
    .insert(projects)
    .values({
      id: "project-1",
      name: "Prompt ownership",
      canvasState: JSON.stringify({
        nodes: [
          {
            id: "web",
            category: "client",
            subtype: "web-app",
            name: "Web",
            technology: "React",
            description: "Browser client",
            reasoning: "Interactive UI",
            locked: false,
          },
        ],
        edges: [],
      }),
      userId: "test-user",
      createdAt: 1,
      updatedAt: 1,
    })
    .run();
});

describe("checked-in route prompts", () => {
  it("uses the checked-in alternatives prompt despite a legacy fixture override", async () => {
    anthropicMocks.create.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify([
            {
              name: "Vue",
              technology: "Vue 4",
              description: "Browser client",
              reasoning: "Alternative framework",
              category: "client",
              subtype: "web-app",
            },
          ]),
        },
      ],
    });

    const request = new Request("http://localhost/api/projects/project-1/alternatives", {
      method: "POST",
      body: JSON.stringify({
        node: {
          name: "Web",
          technology: "React",
          category: "client",
          subtype: "web-app",
          description: "Browser client",
        },
      }),
    });
    const response = await alternativesRoute.POST(request as never, makeParams());

    expect(response.status).toBe(200);
    expect(anthropicMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ system: DEFAULT_ALTERNATIVES_PROMPT })
    );
    expect(anthropicMocks.create.mock.calls[0][0].system).not.toContain("LEGACY MUTABLE");
  });

  it("uses the checked-in PRD prompt despite a legacy fixture override", async () => {
    anthropicMocks.create.mockResolvedValue({
      content: [{ type: "text", text: "# Prompt ownership" }],
    });

    const request = new Request("http://localhost/api/projects/project-1/export-prd", {
      method: "POST",
    });
    const response = await exportPrdRoute.POST(request as never, makeParams());

    expect(response.status).toBe(200);
    expect(anthropicMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ system: DEFAULT_PRD_PROMPT })
    );
    expect(anthropicMocks.create.mock.calls[0][0].system).not.toContain("LEGACY MUTABLE");
  });
});
