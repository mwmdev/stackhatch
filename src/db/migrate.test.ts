import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as schema from "./schema";
import { runMigrations } from "./migrate";

function applyMigration(sqlite: Database.Database, filename: string) {
  const sql = readFileSync(path.resolve(process.cwd(), "drizzle", filename), "utf8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

  sqlite.exec("BEGIN");
  try {
    for (const statement of statements) sqlite.exec(statement);
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
}

function createLegacyDatabase(filename = ":memory:") {
  const sqlite = new Database(filename);
  sqlite.pragma("foreign_keys = ON");
  applyMigration(sqlite, "0000_useful_inhumans.sql");
  applyMigration(sqlite, "0001_skinny_old_lace.sql");
  applyMigration(sqlite, "0002_sleepy_kang.sql");
  return sqlite;
}

function createPreResumeDatabase() {
  const sqlite = createLegacyDatabase();
  applyMigration(sqlite, "0003_jittery_starhawk.sql");
  applyMigration(sqlite, "0004_remove_private_notes.sql");
  return sqlite;
}

function createCurrentDatabase(filename = ":memory:") {
  const sqlite = createLegacyDatabase(filename);
  applyMigration(sqlite, "0003_jittery_starhawk.sql");
  applyMigration(sqlite, "0004_remove_private_notes.sql");
  applyMigration(sqlite, "0005_add_user_project_state.sql");

  const journal = JSON.parse(
    readFileSync(path.resolve(process.cwd(), "drizzle/meta/_journal.json"), "utf8")
  ) as { entries: Array<{ idx: number; when: number }> };
  const lastApplied = journal.entries.find((entry) => entry.idx === 5);
  if (!lastApplied) throw new Error("Missing migration journal entry 0005");
  sqlite.exec(`
    CREATE TABLE __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at NUMERIC
    )
  `);
  sqlite
    .prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)")
    .run("test-fixture-through-0005", lastApplied.when);

  return sqlite;
}

describe("teams removal migration", () => {
  it("preserves owned projects, messages, notes, and personal templates while dropping teams", () => {
    const sqlite = createLegacyDatabase();
    sqlite.exec(`
      INSERT INTO users (id, github_id, role, created_at)
      VALUES
        ('team-owner', 'github-owner', 'user', 100),
        ('project-creator', 'github-creator', 'user', 101);
      INSERT INTO teams (id, name, owner_id, created_at)
      VALUES ('team-1', 'Legacy team', 'team-owner', 200);
      INSERT INTO team_members (team_id, user_id, role, joined_at)
      VALUES
        ('team-1', 'team-owner', 'owner', 201),
        ('team-1', 'project-creator', 'member', 202);
      INSERT INTO team_invites (id, team_id, email, invited_by, token, expires_at, status)
      VALUES ('invite-1', 'team-1', 'invite@example.com', 'team-owner', 'token', 999, 'pending');
      INSERT INTO projects (
        id, name, description, repo_url, repo_commit_sha, repo_scanned_at,
        repo_analysis_status, repo_analysis_warning, canvas_state, user_id,
        team_id, created_at, updated_at
      ) VALUES (
        'project-1', 'Legacy team project', 'description', 'https://github.com/acme/app',
        'abc123', 300, 'partial', 'truncated', '{"nodes":[],"edges":[]}',
        'project-creator', 'team-1', 301, 302
      );
      INSERT INTO messages (id, project_id, role, content, created_at)
      VALUES ('message-1', 'project-1', 'assistant', 'Architecture', 400);
      INSERT INTO comments (id, project_id, user_id, content, node_id, created_at, updated_at)
      VALUES ('comment-1', 'project-1', 'team-owner', 'Check this boundary', 'api', 500, 501);
      INSERT INTO diagram_templates (
        id, team_id, name, description, canvas_state, created_by, created_at
      ) VALUES (
        'template-1', 'team-1', 'Service map', 'Reusable',
        '{"nodes":[],"edges":[]}', 'project-creator', 600
      );
    `);

    applyMigration(sqlite, "0003_jittery_starhawk.sql");

    expect(sqlite.prepare("SELECT * FROM projects").get()).toEqual({
      id: "project-1",
      name: "Legacy team project",
      description: "description",
      repo_url: "https://github.com/acme/app",
      repo_commit_sha: "abc123",
      repo_scanned_at: 300,
      repo_analysis_status: "partial",
      repo_analysis_warning: "truncated",
      canvas_state: '{"nodes":[],"edges":[]}',
      user_id: "project-creator",
      created_at: 301,
      updated_at: 302,
    });
    expect(sqlite.prepare("SELECT * FROM messages").get()).toEqual({
      id: "message-1",
      project_id: "project-1",
      role: "assistant",
      content: "Architecture",
      created_at: 400,
    });
    expect(sqlite.prepare("SELECT * FROM notes").get()).toEqual({
      id: "comment-1",
      project_id: "project-1",
      content: "Check this boundary",
      node_id: "api",
      created_at: 500,
      updated_at: 501,
    });
    expect(sqlite.prepare("SELECT * FROM templates").get()).toEqual({
      id: "template-1",
      user_id: "project-creator",
      name: "Service map",
      description: "Reusable",
      canvas_state: '{"nodes":[],"edges":[]}',
      created_at: 600,
    });

    const projectColumns = sqlite.pragma("table_info(projects)") as Array<{
      name: string;
      notnull: number;
    }>;
    expect(projectColumns.find((column) => column.name === "user_id")?.notnull).toBe(1);
    expect(projectColumns.some((column) => column.name === "team_id")).toBe(false);
    expect(
      (sqlite.pragma("table_info(notes)") as Array<{ name: string }>).map((column) => column.name)
    ).toEqual(["id", "project_id", "content", "node_id", "created_at", "updated_at"]);
    expect(
      (sqlite.pragma("table_info(templates)") as Array<{ name: string }>).map(
        (column) => column.name
      )
    ).toEqual(["id", "user_id", "name", "description", "canvas_state", "created_at"]);

    const remainingTables = new Set(
      (
        sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
          name: string;
        }>
      ).map((row) => row.name)
    );
    for (const removedTable of [
      "comments",
      "diagram_templates",
      "team_invites",
      "team_members",
      "teams",
    ]) {
      expect(remainingTables.has(removedTable)).toBe(false);
    }
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);

    sqlite.prepare("DELETE FROM projects WHERE id = ?").run("project-1");
    expect(sqlite.prepare("SELECT * FROM messages").all()).toEqual([]);
    expect(sqlite.prepare("SELECT * FROM notes").all()).toEqual([]);
  });

  it("fails safely instead of dropping or assigning an unowned legacy project", () => {
    const sqlite = createLegacyDatabase();
    sqlite.exec(`
      INSERT INTO projects (id, name, user_id, created_at, updated_at)
      VALUES ('unowned', 'Unowned', NULL, 1, 1);
    `);

    expect(() => applyMigration(sqlite, "0003_jittery_starhawk.sql")).toThrow();
    expect(sqlite.prepare("SELECT id, user_id FROM projects").get()).toEqual({
      id: "unowned",
      user_id: null,
    });
    expect(
      sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'teams'").get()
    ).toBeDefined();
  });

  it("reports an actionable recovery step for an unowned legacy project", () => {
    const sqlite = createLegacyDatabase();
    sqlite.exec(`
      INSERT INTO projects (id, name, user_id, created_at, updated_at)
      VALUES ('unowned', 'Unowned', NULL, 1, 1);
    `);
    const database = drizzle(sqlite, { schema });

    expect(() => runMigrations(database)).toThrow(
      "Back up the database, assign each projects.user_id to a valid users.id, and restart StackHatch."
    );
    expect(sqlite.prepare("SELECT id, user_id FROM projects").get()).toEqual({
      id: "unowned",
      user_id: null,
    });
  });
});

describe("private notes removal migration", () => {
  it("deletes stored notes while preserving projects, messages, and templates", () => {
    const sqlite = createLegacyDatabase();
    applyMigration(sqlite, "0003_jittery_starhawk.sql");
    sqlite.exec(`
      INSERT INTO users (id, github_id, role, created_at)
      VALUES ('user-1', 'github-user-1', 'user', 100);
      INSERT INTO projects (
        id, name, description, canvas_state, user_id, created_at, updated_at
      ) VALUES (
        'project-1', 'Architecture map', 'Keep this project',
        '{"nodes":[],"edges":[]}', 'user-1', 200, 201
      );
      INSERT INTO messages (id, project_id, role, content, created_at)
      VALUES ('message-1', 'project-1', 'assistant', 'Keep this message', 300);
      INSERT INTO notes (id, project_id, content, node_id, created_at, updated_at)
      VALUES ('note-1', 'project-1', 'Delete this private note', 'api', 400, 401);
      INSERT INTO templates (id, user_id, name, description, canvas_state, created_at)
      VALUES (
        'template-1', 'user-1', 'Service map', 'Keep this template',
        '{"nodes":[],"edges":[]}', 500
      );
    `);

    applyMigration(sqlite, "0004_remove_private_notes.sql");

    expect(
      sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'notes'").get()
    ).toBeUndefined();
    expect(sqlite.prepare("SELECT id, name, user_id FROM projects").get()).toEqual({
      id: "project-1",
      name: "Architecture map",
      user_id: "user-1",
    });
    expect(sqlite.prepare("SELECT id, project_id, content FROM messages").get()).toEqual({
      id: "message-1",
      project_id: "project-1",
      content: "Keep this message",
    });
    expect(sqlite.prepare("SELECT id, user_id, name FROM templates").get()).toEqual({
      id: "template-1",
      user_id: "user-1",
      name: "Service map",
    });
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);
  });
});

describe("project resume state migration", () => {
  it("preserves existing data and adds deletion-safe account ownership constraints", () => {
    const sqlite = createPreResumeDatabase();
    sqlite.exec(`
      INSERT INTO users (id, github_id, role, created_at)
      VALUES
        ('user-1', 'github-user-1', 'user', 100),
        ('user-2', 'github-user-2', 'user', 101);
      INSERT INTO projects (id, name, user_id, created_at, updated_at)
      VALUES
        ('project-1', 'First map', 'user-1', 200, 201),
        ('project-2', 'Other map', 'user-2', 300, 301);
      INSERT INTO messages (id, project_id, role, content, created_at)
      VALUES ('message-1', 'project-1', 'assistant', 'Keep me', 400);
    `);

    applyMigration(sqlite, "0005_add_user_project_state.sql");

    expect(sqlite.prepare("SELECT id, name, user_id FROM projects ORDER BY id").all()).toEqual([
      { id: "project-1", name: "First map", user_id: "user-1" },
      { id: "project-2", name: "Other map", user_id: "user-2" },
    ]);
    expect(sqlite.prepare("SELECT id, project_id, content FROM messages").get()).toEqual({
      id: "message-1",
      project_id: "project-1",
      content: "Keep me",
    });
    expect(sqlite.prepare("SELECT * FROM user_project_state").all()).toEqual([]);

    const stateColumns = sqlite.pragma("table_info(user_project_state)") as Array<{
      name: string;
      notnull: number;
      pk: number;
    }>;
    expect(stateColumns).toEqual([
      expect.objectContaining({ name: "user_id", notnull: 1, pk: 1 }),
      expect.objectContaining({ name: "last_opened_project_id", notnull: 0, pk: 0 }),
    ]);

    const projectIndexes = sqlite.pragma("index_list(projects)") as Array<{
      name: string;
      unique: number;
    }>;
    expect(projectIndexes).toContainEqual(
      expect.objectContaining({ name: "projects_user_id_id_unique", unique: 1 })
    );
    expect(projectIndexes).toContainEqual(
      expect.objectContaining({ name: "projects_user_resume_order_idx", unique: 0 })
    );

    const stateForeignKeys = sqlite.pragma("foreign_key_list(user_project_state)") as Array<{
      table: string;
      from: string;
      to: string;
      on_delete: string;
    }>;
    expect(stateForeignKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "users",
          from: "user_id",
          to: "id",
          on_delete: "CASCADE",
        }),
        expect.objectContaining({
          table: "projects",
          from: "user_id",
          to: "user_id",
          on_delete: "CASCADE",
        }),
        expect.objectContaining({
          table: "projects",
          from: "last_opened_project_id",
          to: "id",
          on_delete: "CASCADE",
        }),
      ])
    );

    expect(() =>
      sqlite
        .prepare("INSERT INTO user_project_state (user_id, last_opened_project_id) VALUES (?, ?)")
        .run("user-1", "project-2")
    ).toThrow(/FOREIGN KEY constraint failed/);

    sqlite
      .prepare("INSERT INTO user_project_state (user_id, last_opened_project_id) VALUES (?, ?)")
      .run("user-1", "project-1");
    sqlite.prepare("DELETE FROM projects WHERE id = ?").run("project-1");
    expect(sqlite.prepare("SELECT * FROM user_project_state").all()).toEqual([]);

    sqlite
      .prepare(
        "INSERT INTO projects (id, name, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run("project-3", "Third map", "user-1", 500, 501);
    sqlite
      .prepare("INSERT INTO user_project_state (user_id, last_opened_project_id) VALUES (?, ?)")
      .run("user-1", "project-3");
    sqlite.prepare("DELETE FROM users WHERE id = ?").run("user-1");
    expect(sqlite.prepare("SELECT * FROM user_project_state").all()).toEqual([]);
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);
  });

  it("is safe to run repeatedly through the migration runner", () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    const database = drizzle(sqlite, { schema });

    runMigrations(database);
    runMigrations(database);

    expect(
      sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user_project_state'"
        )
        .get()
    ).toEqual({ name: "user_project_state" });
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);
  });
});

describe("self-service account controls migration", () => {
  it("copies a valid legacy catalog to every user without changing existing personal settings", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "stackhatch-migration-"));
    const filename = path.join(directory, "stackhatch.db");
    const sqlite = createCurrentDatabase(filename);
    const catalog = '{ "client": [{"slug":"kiosk","displayName":"Kiosk","icon":"Box"}] }';

    try {
      sqlite.exec(`
        INSERT INTO users (id, github_id, email, name, role, created_at)
        VALUES
          ('configured-user', 'github-configured', 'configured@example.com', 'Configured', 'admin', 100),
          ('default-user', 'github-default', 'default@example.com', 'Default', 'user', 200);
        INSERT INTO user_settings (
          user_id, anthropic_api_key, model, theme, created_at, updated_at
        ) VALUES (
          'configured-user', 'encrypted:v1:opaque-bytes', 'claude-opus-4-8', 'dark', 301, 302
        );
        INSERT INTO projects (id, name, canvas_state, user_id, created_at, updated_at)
        VALUES (
          'project-1', 'Preserved map', '{"nodes":[{"id":"api"}],"edges":[]}',
          'configured-user', 400, 401
        );
        INSERT INTO messages (id, project_id, role, content, created_at)
        VALUES ('message-1', 'project-1', 'assistant', 'Preserved answer', 500);
        INSERT INTO templates (id, user_id, name, canvas_state, created_at)
        VALUES (
          'template-1', 'configured-user', 'Preserved template',
          '{"nodes":[{"id":"client"}],"edges":[]}', 600
        );
      `);
      sqlite
        .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
        .run("customSubtypes", catalog);
      const existingRowId = (
        sqlite
          .prepare("SELECT rowid AS rowId FROM user_settings WHERE user_id = 'configured-user'")
          .get() as { rowId: number }
      ).rowId;

      runMigrations(drizzle(sqlite, { schema }));

      expect(
        sqlite
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings'")
          .get()
      ).toBeUndefined();
      expect(
        (sqlite.pragma("table_info(users)") as Array<{ name: string }>).map((column) => column.name)
      ).not.toContain("role");
      expect(
        sqlite
          .prepare(
            `SELECT rowid AS rowId, user_id, anthropic_api_key, model, theme,
                    custom_subtypes, created_at, updated_at
             FROM user_settings ORDER BY user_id`
          )
          .all()
      ).toEqual([
        {
          rowId: existingRowId,
          user_id: "configured-user",
          anthropic_api_key: "encrypted:v1:opaque-bytes",
          model: "claude-opus-4-8",
          theme: "dark",
          custom_subtypes: catalog,
          created_at: 301,
          updated_at: 302,
        },
        {
          rowId: expect.any(Number),
          user_id: "default-user",
          anthropic_api_key: null,
          model: "claude-sonnet-5",
          theme: "system",
          custom_subtypes: catalog,
          created_at: 200,
          updated_at: 200,
        },
      ]);
      expect(
        sqlite.prepare("SELECT canvas_state FROM projects WHERE id = 'project-1'").get()
      ).toEqual({
        canvas_state: '{"nodes":[{"id":"api"}],"edges":[]}',
      });
      expect(sqlite.prepare("SELECT content FROM messages WHERE id = 'message-1'").get()).toEqual({
        content: "Preserved answer",
      });
      expect(
        sqlite.prepare("SELECT canvas_state FROM templates WHERE id = 'template-1'").get()
      ).toEqual({
        canvas_state: '{"nodes":[{"id":"client"}],"edges":[]}',
      });

      const messageIndexes = sqlite.pragma("index_list(messages)") as Array<{ name: string }>;
      const templateIndexes = sqlite.pragma("index_list(templates)") as Array<{ name: string }>;
      expect(messageIndexes).toContainEqual(
        expect.objectContaining({ name: "messages_project_id_idx" })
      );
      expect(templateIndexes).toContainEqual(
        expect.objectContaining({ name: "templates_user_id_idx" })
      );
      expect(sqlite.pragma("foreign_key_check")).toEqual([]);

      sqlite.prepare("DELETE FROM users WHERE id = ?").run("configured-user");
      expect(sqlite.prepare("SELECT * FROM projects").all()).toEqual([]);
      expect(sqlite.prepare("SELECT * FROM messages").all()).toEqual([]);
      expect(sqlite.prepare("SELECT * FROM templates").all()).toEqual([]);
      expect(sqlite.prepare("SELECT user_id FROM user_settings ORDER BY user_id").all()).toEqual([
        { user_id: "default-user" },
      ]);
      expect(sqlite.pragma("foreign_key_check")).toEqual([]);
    } finally {
      sqlite.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("uses an empty catalog when the legacy global row is missing", () => {
    const sqlite = createCurrentDatabase();
    sqlite.exec(`
      INSERT INTO users (id, github_id, role, created_at)
      VALUES ('user-1', 'github-user-1', 'user', 100);
    `);

    runMigrations(drizzle(sqlite, { schema }));

    expect(sqlite.prepare("SELECT custom_subtypes FROM user_settings").get()).toEqual({
      custom_subtypes: "{}",
    });
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);
  });

  it.each([
    ["not-json", "valid JSON"],
    ['{"client":[{"slug":"web-app","displayName":"Collision","icon":"Box"}]}', "built-in"],
  ])("rejects an invalid legacy catalog before schema mutation", (catalog, reason) => {
    const sqlite = createCurrentDatabase();
    sqlite
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
      .run("customSubtypes", catalog);

    expect(() => runMigrations(drizzle(sqlite, { schema }))).toThrow(reason);
    expect(() => runMigrations(drizzle(sqlite, { schema }))).toThrow(
      "Back up the database, repair or remove the settings.customSubtypes row"
    );
    expect(
      (sqlite.pragma("table_info(user_settings)") as Array<{ name: string }>).map(
        (column) => column.name
      )
    ).not.toContain("custom_subtypes");
    expect(
      (sqlite.pragma("table_info(users)") as Array<{ name: string }>).map((column) => column.name)
    ).toContain("role");
    expect(sqlite.prepare("SELECT value FROM settings WHERE key = 'customSubtypes'").get()).toEqual(
      {
        value: catalog,
      }
    );
  });

  it("rolls back the complete migration when a later statement fails", () => {
    const sqlite = createCurrentDatabase();
    const catalog = '{"client":[{"slug":"kiosk","displayName":"Kiosk","icon":"Box"}]}';
    sqlite.exec(`
      INSERT INTO users (id, github_id, role, created_at)
      VALUES ('user-1', 'github-user-1', 'user', 100);
      INSERT INTO user_settings (user_id, model, theme, created_at, updated_at)
      VALUES ('user-1', 'claude-opus-4-8', 'light', 200, 201);
      CREATE INDEX messages_project_id_idx ON messages (project_id);
    `);
    sqlite
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
      .run("customSubtypes", catalog);

    expect(() => runMigrations(drizzle(sqlite, { schema }))).toThrow(/messages_project_id_idx/);

    expect(
      (sqlite.pragma("table_info(user_settings)") as Array<{ name: string }>).map(
        (column) => column.name
      )
    ).not.toContain("custom_subtypes");
    expect(
      (sqlite.pragma("table_info(users)") as Array<{ name: string }>).map((column) => column.name)
    ).toContain("role");
    expect(sqlite.prepare("SELECT value FROM settings WHERE key = 'customSubtypes'").get()).toEqual(
      {
        value: catalog,
      }
    );
    expect(
      sqlite
        .prepare("SELECT model, theme, created_at, updated_at FROM user_settings WHERE user_id = ?")
        .get("user-1")
    ).toEqual({ model: "claude-opus-4-8", theme: "light", created_at: 200, updated_at: 201 });
  });
});
