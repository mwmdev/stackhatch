import { readFileSync, statfsSync, statSync } from "node:fs";
import path from "node:path";
import { runMigrations } from "@/db/migrate";
import {
  assertCurrentOperatorSchema,
  openOperatorMigrationDatabase,
  revalidateOperatorDatabase,
} from "@/lib/operator-account";
import { isSqliteBusyError } from "@/lib/sqlite-errors";

interface MigrationJournal {
  entries: Array<{ idx: number; when: number }>;
}

function journalVersions(): Set<number> {
  const journalPath = path.resolve(process.cwd(), "drizzle/meta/_journal.json");
  let journal: MigrationJournal;
  try {
    journal = JSON.parse(readFileSync(journalPath, "utf8")) as MigrationJournal;
  } catch {
    throw new Error("The bundled Drizzle migration journal is missing or invalid");
  }
  if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
    throw new Error("The bundled Drizzle migration journal contains no migrations");
  }
  return new Set(journal.entries.map(({ when }) => when));
}

function assertKnownMigrationHistory(sqlite: import("better-sqlite3").Database) {
  const hasHistory = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'")
    .get();
  if (!hasHistory) {
    const hasApplicationTables = sqlite
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name IN ('users', 'projects', 'user_settings') LIMIT 1"
      )
      .get();
    if (hasApplicationTables) {
      throw new Error(
        "The database has application tables but no migration history; refusing an unrecognized schema"
      );
    }
    return;
  }

  const latest = sqlite
    .prepare(
      "SELECT created_at AS createdAt FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1"
    )
    .get() as { createdAt: number } | undefined;
  if (latest && !journalVersions().has(Number(latest.createdAt))) {
    throw new Error(
      "The database has an unrecognized migration version; use the matching StackHatch build or restore the verified backup"
    );
  }
}

function assertIntegrity(sqlite: import("better-sqlite3").Database, phase: string) {
  const integrity = sqlite.pragma("integrity_check") as Array<Record<string, unknown>>;
  if (integrity.length !== 1 || Object.values(integrity[0])[0] !== "ok") {
    throw new Error(`The database failed ${phase} integrity validation`);
  }
  if (sqlite.prepare("SELECT 1 FROM pragma_foreign_key_check LIMIT 1").get()) {
    throw new Error(`The database failed ${phase} foreign-key validation`);
  }
}

function assertMigrationStorage(databasePath: string) {
  const databaseBytes = statSync(databasePath).size;
  const filesystem = statfsSync(path.dirname(databasePath));
  const availableBytes = Number(filesystem.bavail) * Number(filesystem.bsize);
  const requiredBytes = databaseBytes * 2 + 16 * 1024 * 1024;
  if (availableBytes < requiredBytes) {
    throw new Error(
      `Insufficient free storage for safe SQLite migration work; at least ${requiredBytes} bytes are required`
    );
  }
}

export function migrateDatabaseOffline(databasePath: string) {
  const operator = openOperatorMigrationDatabase(databasePath);
  try {
    assertKnownMigrationHistory(operator.db.$client);
    assertIntegrity(operator.db.$client, "preflight");
    assertMigrationStorage(operator.canonicalPath);
    revalidateOperatorDatabase(operator);

    try {
      runMigrations(operator.db);
    } catch (error) {
      if (isSqliteBusyError(error)) {
        throw new Error(
          "The database is busy or locked. Stop StackHatch and every other SQLite writer, then retry during the maintenance window."
        );
      }
      throw error;
    }

    assertCurrentOperatorSchema(operator.db);
    assertIntegrity(operator.db.$client, "post-migration");
    const counts = operator.db.$client
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM users) AS users,
           (SELECT COUNT(*) FROM user_settings) AS settings`
      )
      .get() as { users: number; settings: number };
    if (counts.users !== counts.settings) {
      throw new Error("Migration verification failed: expected exactly one settings row per user");
    }

    return {
      databaseFingerprint: operator.databaseFingerprint,
      migrated: true as const,
      users: counts.users,
      settings: counts.settings,
    };
  } finally {
    operator.close();
  }
}

export function parseOfflineMigrationArgs(args: string[]): { database: string } {
  let database: string | undefined;
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (option !== "--database") throw new Error(`Unknown option: ${option ?? ""}`);
    if (!value || value.startsWith("--")) throw new Error("--database requires a value");
    if (database) throw new Error("--database may be provided only once");
    database = value;
  }
  if (!database) throw new Error("--database is required");
  return { database };
}
