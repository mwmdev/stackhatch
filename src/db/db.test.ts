import { describe, it, expect, beforeEach } from "vitest";
import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import { messages, projects, settings, templates, users } from "./schema";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");

  // Apply schema directly for in-memory test DB
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY NOT NULL,
      github_id TEXT NOT NULL UNIQUE,
      email TEXT,
      name TEXT,
      avatar_url TEXT,
      role TEXT DEFAULT 'user' NOT NULL,
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
    CREATE TABLE templates (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      canvas_state TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  return drizzle(sqlite, { schema });
}

let db: ReturnType<typeof createTestDb>;

const testUser = {
  id: "test-user-1",
  githubId: "12345",
  email: "test@example.com",
  name: "Test User",
  avatarUrl: "https://example.com/avatar.png",
  role: "user" as const,
  createdAt: Date.now(),
};

beforeEach(() => {
  db = createTestDb();
  // Create a test user for all project tests
  db.insert(users).values(testUser).run();
});

describe("projects", () => {
  const sampleProject = {
    id: "proj-1",
    name: "Test Project",
    description: "A test project",
    canvasState: null,
    userId: testUser.id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  it("inserts and queries a project", () => {
    db.insert(projects).values(sampleProject).run();

    const result = db.select().from(projects).all();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Test Project");
    expect(result[0].description).toBe("A test project");
  });

  it("updates a project", () => {
    db.insert(projects).values(sampleProject).run();

    const newTimestamp = Date.now() + 1000;
    db.update(projects)
      .set({ name: "Updated Name", updatedAt: newTimestamp })
      .where(eq(projects.id, "proj-1"))
      .run();

    const result = db.select().from(projects).where(eq(projects.id, "proj-1")).get();
    expect(result?.name).toBe("Updated Name");
    expect(result?.updatedAt).toBe(newTimestamp);
  });

  it("deletes a project", () => {
    db.insert(projects).values(sampleProject).run();

    db.delete(projects).where(eq(projects.id, "proj-1")).run();

    const result = db.select().from(projects).all();
    expect(result).toHaveLength(0);
  });

  it("stores and retrieves canvasState as JSON string", () => {
    const canvas = JSON.stringify({ nodes: [], edges: [] });
    db.insert(projects)
      .values({ ...sampleProject, canvasState: canvas })
      .run();

    const result = db.select().from(projects).where(eq(projects.id, "proj-1")).get();
    expect(JSON.parse(result!.canvasState!)).toEqual({ nodes: [], edges: [] });
  });

  it("lists projects ordered by updatedAt descending", () => {
    const now = Date.now();
    db.insert(projects)
      .values([
        { ...sampleProject, id: "proj-old", name: "Old", updatedAt: now - 1000 },
        { ...sampleProject, id: "proj-new", name: "New", updatedAt: now },
      ])
      .run();

    const result = db.select().from(projects).orderBy(desc(projects.updatedAt)).all();

    expect(result[0].name).toBe("New");
    expect(result[1].name).toBe("Old");
  });
});

describe("messages", () => {
  const projectId = "proj-msg";
  const sampleProject = {
    id: projectId,
    name: "Msg Project",
    description: null,
    canvasState: null,
    userId: testUser.id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  beforeEach(() => {
    db.insert(projects).values(sampleProject).run();
  });

  it("inserts and queries messages for a project", () => {
    const now = Date.now();
    db.insert(messages)
      .values([
        { id: "msg-1", projectId, role: "user" as const, content: "Hello", createdAt: now },
        {
          id: "msg-2",
          projectId,
          role: "assistant" as const,
          content: "Hi there",
          createdAt: now + 1,
        },
      ])
      .run();

    const result = db.select().from(messages).where(eq(messages.projectId, projectId)).all();

    expect(result).toHaveLength(2);
    expect(result[0].role).toBe("user");
    expect(result[1].role).toBe("assistant");
  });

  it("cascade deletes messages when project is deleted", () => {
    db.insert(messages)
      .values({
        id: "msg-cascade",
        projectId,
        role: "user",
        content: "test",
        createdAt: Date.now(),
      })
      .run();

    // Verify message exists
    expect(db.select().from(messages).all()).toHaveLength(1);

    // Delete the project
    db.delete(projects).where(eq(projects.id, projectId)).run();

    // Messages should be gone
    expect(db.select().from(messages).all()).toHaveLength(0);
  });

  it("rejects messages with invalid project reference", () => {
    expect(() => {
      db.insert(messages)
        .values({
          id: "msg-bad",
          projectId: "nonexistent",
          role: "user",
          content: "test",
          createdAt: Date.now(),
        })
        .run();
    }).toThrow();
  });
});

describe("personal project resources", () => {
  it("stores templates under their user owner", () => {
    const now = Date.now();
    db.insert(templates)
      .values({
        id: "template-1",
        userId: testUser.id,
        name: "Service map",
        canvasState: '{"nodes":[],"edges":[]}',
        createdAt: now,
      })
      .run();

    expect(db.select().from(templates).get()).toMatchObject({
      id: "template-1",
      userId: testUser.id,
      name: "Service map",
      createdAt: now,
    });
  });
});

describe("settings", () => {
  it("inserts and retrieves a setting", () => {
    db.insert(settings).values({ key: "theme", value: "dark" }).run();

    const result = db.select().from(settings).where(eq(settings.key, "theme")).get();
    expect(result?.value).toBe("dark");
  });

  it("upserts a setting (update on conflict)", () => {
    db.insert(settings).values({ key: "prompt_chat", value: "old prompt" }).run();

    // Upsert with onConflictDoUpdate
    db.insert(settings)
      .values({ key: "prompt_chat", value: "new prompt" })
      .onConflictDoUpdate({ target: settings.key, set: { value: "new prompt" } })
      .run();

    const result = db.select().from(settings).where(eq(settings.key, "prompt_chat")).get();
    expect(result?.value).toBe("new prompt");
  });

  it("retrieves all settings as key-value pairs", () => {
    db.insert(settings)
      .values([
        { key: "prompt_chat", value: "chat prompt" },
        { key: "customSubtypes", value: "{}" },
        { key: "theme", value: "dark" },
      ])
      .run();

    const rows = db.select().from(settings).all();
    const kv = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    expect(kv).toEqual({
      prompt_chat: "chat prompt",
      customSubtypes: "{}",
      theme: "dark",
    });
  });

  it("deletes a setting", () => {
    db.insert(settings).values({ key: "theme", value: "light" }).run();
    db.delete(settings).where(eq(settings.key, "theme")).run();

    const result = db.select().from(settings).where(eq(settings.key, "theme")).get();
    expect(result).toBeUndefined();
  });
});
