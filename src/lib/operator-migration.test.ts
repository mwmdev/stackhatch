import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateDatabaseOffline, parseOfflineMigrationArgs } from "@/lib/operator-migration";

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
    expect(migrated.pragma("foreign_key_check")).toEqual([]);
    migrated.close();
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

  it("runs the source wrapper against a disposable legacy database", () => {
    createThroughMigrationFive(filename).close();
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/migrate-database.ts", "--database", filename],
      { cwd: process.cwd(), encoding: "utf8" }
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('"migrated": true');
  });
});
