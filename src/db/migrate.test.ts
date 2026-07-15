import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { readFileSync } from "node:fs";
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

function createLegacyDatabase() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  applyMigration(sqlite, "0000_useful_inhumans.sql");
  applyMigration(sqlite, "0001_skinny_old_lace.sql");
  applyMigration(sqlite, "0002_sleepy_kang.sql");
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
