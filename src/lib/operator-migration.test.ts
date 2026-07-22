import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  migrateDatabaseOffline,
  parseOfflineMigrationArgs,
  requiredMigrationStorageBytes,
} from "@/lib/operator-migration";

let directory: string;
let filename: string;

function applyMigration(sqlite: Database.Database, migration: string) {
  const sql = readFileSync(path.join(process.cwd(), "drizzle", migration), "utf8");
  sqlite.exec("BEGIN");
  try {
    for (const statement of sql.split("--> statement-breakpoint").map((part) => part.trim())) {
      if (statement) sqlite.exec(statement);
    }
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
}

function createThroughMigrationFive(databasePath: string) {
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  for (const migration of [
    "0000_useful_inhumans.sql",
    "0001_skinny_old_lace.sql",
    "0002_sleepy_kang.sql",
    "0003_jittery_starhawk.sql",
    "0004_remove_private_notes.sql",
    "0005_add_user_project_state.sql",
  ]) {
    applyMigration(sqlite, migration);
  }
  const journal = JSON.parse(
    readFileSync(path.join(process.cwd(), "drizzle/meta/_journal.json"), "utf8")
  ) as { entries: Array<{ idx: number; when: number }> };
  const throughFive = journal.entries.find(({ idx }) => idx === 5)!;
  sqlite.exec(
    "CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at NUMERIC)"
  );
  sqlite
    .prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)")
    .run("fixture-through-five", throughFive.when);
  return sqlite;
}

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "stackhatch-offline-migration-"));
  filename = path.join(directory, "stackhatch.db");
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe("offline database migration", () => {
  it("migrates a known legacy database on the explicit connection and verifies the result", () => {
    const sqlite = createThroughMigrationFive(filename);
    sqlite.exec(`
      INSERT INTO users (id, github_id, email, name, role, created_at)
      VALUES ('user-1', 'github-1', 'person@example.com', 'Person', 'admin', 1);
      INSERT INTO user_settings (
        user_id, anthropic_api_key, model, theme, created_at, updated_at
      ) VALUES ('user-1', 'encrypted:opaque', 'claude-opus-4-8', 'dark', 2, 3);
      INSERT INTO projects (
        id, name, description, repo_url, canvas_state, user_id, created_at, updated_at
      ) VALUES (
        'project-1', 'Project', 'Description', 'https://example.com/private',
        '{"nodes":[]}', 'user-1', 4, 5
      );
      INSERT INTO messages (id, project_id, role, content, created_at)
      VALUES ('message-1', 'project-1', 'assistant', 'Preserve me', 6);
      INSERT INTO templates (id, user_id, name, description, canvas_state, created_at)
      VALUES ('template-1', 'user-1', 'Template', 'Description', '{"nodes":[]}', 7);
      INSERT INTO user_project_state (user_id, last_opened_project_id)
      VALUES ('user-1', 'project-1');
      INSERT INTO settings (key, value)
      VALUES ('customSubtypes', '{"client":[{"slug":"kiosk","displayName":"Kiosk","icon":"Box"}]}');
    `);
    sqlite.close();

    expect(migrateDatabaseOffline(filename)).toEqual(
      expect.objectContaining({ migrated: true, users: 1, settings: 1 })
    );

    const migrated = new Database(filename);
    expect(
      (migrated.pragma("table_info(users)") as Array<{ name: string }>).map((c) => c.name)
    ).not.toContain("role");
    expect(migrated.prepare("SELECT custom_subtypes FROM user_settings").get()).toEqual({
      custom_subtypes: '{"client":[{"slug":"kiosk","displayName":"Kiosk","icon":"Box"}]}',
    });
    expect(
      migrated
        .prepare(
          "SELECT anthropic_api_key, model, theme, created_at, updated_at FROM user_settings"
        )
        .get()
    ).toEqual({
      anthropic_api_key: "encrypted:opaque",
      model: "claude-opus-4-8",
      theme: "dark",
      created_at: 2,
      updated_at: 3,
    });
    expect(migrated.prepare("SELECT content FROM messages").get()).toEqual({
      content: "Preserve me",
    });
    expect(migrated.prepare("SELECT last_opened_project_id FROM user_project_state").get()).toEqual(
      { last_opened_project_id: "project-1" }
    );
    expect(migrated.pragma("foreign_key_check")).toEqual([]);
    migrated.close();
  });

  it("counts main, WAL, and shared-memory files in the conservative storage preflight", () => {
    createThroughMigrationFive(filename).close();
    const mainBytes = statSync(filename).size;
    writeFileSync(`${filename}-wal`, Buffer.alloc(7));
    writeFileSync(`${filename}-shm`, Buffer.alloc(11));

    expect(requiredMigrationStorageBytes(filename)).toBe(
      (mainBytes + 7 + 11) * 2 + 16 * 1024 * 1024
    );
  });

  it("marks preservation failures after commit and gives explicit recovery choices", () => {
    const sqlite = createThroughMigrationFive(filename);
    sqlite.exec(`
      INSERT INTO users (id, github_id, name, role, created_at)
      VALUES ('user-1', 'github-1', 'Original', 'user', 1)
    `);
    sqlite.close();

    expect(() =>
      migrateDatabaseOffline(filename, {
        afterCommit(database) {
          database.prepare("UPDATE users SET name = 'Fault injected' WHERE id = 'user-1'").run();
        },
      })
    ).toThrow(
      /Migration committed but verification failed:.*Keep traffic stopped.*forward repair or verified restore/
    );

    const committed = new Database(filename);
    expect(
      (committed.pragma("table_info(users)") as Array<{ name: string }>).map(({ name }) => name)
    ).not.toContain("role");
    committed.close();
  });

  it("rejects unknown migration history before mutation", () => {
    const sqlite = createThroughMigrationFive(filename);
    sqlite.prepare("UPDATE __drizzle_migrations SET created_at = ?").run(9999999999999);
    sqlite.close();

    expect(() => migrateDatabaseOffline(filename)).toThrow("unrecognized migration version");
    const unchanged = new Database(filename);
    expect(
      (unchanged.pragma("table_info(users)") as Array<{ name: string }>).map((c) => c.name)
    ).toContain("role");
    unchanged.close();
  });

  it("requires exactly one explicit database option", () => {
    expect(parseOfflineMigrationArgs(["--database", filename])).toEqual({ database: filename });
    expect(() => parseOfflineMigrationArgs([])).toThrow("--database is required");
    expect(() => parseOfflineMigrationArgs(["--database", filename, "--extra", "x"])).toThrow(
      "Unknown option"
    );
  });

  it("builds and executes both shipped CJS operator bundles against a disposable database", () => {
    const sqlite = createThroughMigrationFive(filename);
    sqlite.exec(`
      INSERT INTO users (id, github_id, role, created_at)
      VALUES ('user-1', 'github-1', 'user', 1)
    `);
    sqlite.close();

    const build = spawnSync("npm", ["run", "build:operators"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    expect(build.status, build.stderr).toBe(0);

    const migration = spawnSync(
      process.execPath,
      ["operator/migrate-database.cjs", "--database", filename],
      { cwd: process.cwd(), encoding: "utf8" }
    );
    expect(migration.status, migration.stderr).toBe(0);
    expect(migration.stdout).toContain('"migrated": true');
    const migrationResult = JSON.parse(migration.stdout) as { databaseFingerprint: string };

    const preview = spawnSync(
      process.execPath,
      ["operator/manage-account.cjs", "preview", "--database", filename, "--id", "user-1"],
      { cwd: process.cwd(), encoding: "utf8" }
    );
    expect(preview.status, preview.stderr).toBe(0);
    expect(preview.stdout).toContain('"internalId": "user-1"');
    const previewResult = JSON.parse(preview.stdout) as { databaseFingerprint: string };
    expect(previewResult.databaseFingerprint).toBe(migrationResult.databaseFingerprint);
  });
});
