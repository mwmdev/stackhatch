import Database from "better-sqlite3";
import { createHash, type Hash } from "node:crypto";
import {
  accessSync,
  closeSync,
  constants,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import type { AppDatabase } from "@/db";
import { isSqliteBusyError, sqliteErrorCode } from "@/lib/sqlite-errors";

const REQUIRED_TABLES = [
  "__drizzle_migrations",
  "messages",
  "projects",
  "templates",
  "user_project_state",
  "user_settings",
  "users",
] as const;

export interface DatabaseIdentity {
  canonicalPath: string;
  device: number;
  inode: number;
  contentDigest: string;
}

export interface OperatorDatabase {
  db: AppDatabase;
  canonicalPath: string;
  databaseFingerprint: string;
  close: () => void;
  identity: DatabaseIdentity;
}

function updateHashFromFile(hash: Hash, filename: string, label: string, required: boolean) {
  let descriptor: number | undefined;
  try {
    const stat = statSync(filename);
    if (!stat.isFile()) throw new Error(`${label} is not a regular file`);
    hash.update(`${label}\0present\0${stat.size}\0`);
    descriptor = openSync(filename, "r");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let offset = 0;
    for (;;) {
      const bytesRead = readSync(descriptor, buffer, 0, buffer.length, offset);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      offset += bytesRead;
    }
  } catch (error) {
    if (!required && sqliteErrorCode(error) === "ENOENT") {
      hash.update(`${label}\0absent\0`);
      return;
    }
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function databaseContentDigest(canonicalPath: string): string {
  const hash = createHash("sha256").update("stackhatch-database-content-v1\0");
  updateHashFromFile(hash, canonicalPath, "main", true);
  // A WAL contains committed database state that may not yet be checkpointed into the main file.
  updateHashFromFile(hash, `${canonicalPath}-wal`, "wal", false);
  return hash.digest("hex");
}

export function readOperatorDatabaseIdentity(databasePath: string): DatabaseIdentity {
  if (!databasePath.trim()) throw new Error("--database requires an explicit path");

  const absolutePath = path.resolve(databasePath);
  let canonicalPath: string;
  try {
    canonicalPath = realpathSync(absolutePath);
    accessSync(canonicalPath, constants.R_OK | constants.W_OK);
  } catch (error) {
    if (sqliteErrorCode(error) === "ENOENT") {
      throw new Error("The explicit database path does not exist");
    }
    throw new Error("The explicit database path is not readable and writable");
  }

  const stat = statSync(canonicalPath);
  if (!stat.isFile()) throw new Error("The explicit database path is not a regular file");
  return {
    canonicalPath,
    device: stat.dev,
    inode: stat.ino,
    contentDigest: databaseContentDigest(canonicalPath),
  };
}

export function fingerprintOperatorDatabase(identity: DatabaseIdentity): string {
  return createHash("sha256")
    .update(
      `stackhatch-database-v2\0${identity.canonicalPath}\0${identity.device}\0${identity.inode}\0${identity.contentDigest}`
    )
    .digest("hex")
    .slice(0, 20);
}

export function requireOperatorPragmas(db: AppDatabase) {
  for (const pragma of ["foreign_keys", "secure_delete"] as const) {
    if (db.$client.pragma(pragma, { simple: true }) !== 1) {
      throw new Error(`${pragma} must be enabled for operator database operations`);
    }
  }
}

function tableColumns(sqlite: Database.Database, table: string): string[] {
  return (sqlite.pragma(`table_info(${table})`) as Array<{ name: string }>).map(
    (column) => column.name
  );
}

function expectedMigrationVersion(): number {
  try {
    const journal = JSON.parse(
      readFileSync(path.resolve(process.cwd(), "drizzle/meta/_journal.json"), "utf8")
    ) as { entries?: Array<{ when: number }> };
    const latest = journal.entries?.at(-1)?.when;
    if (typeof latest !== "number") throw new Error("missing latest migration");
    return latest;
  } catch {
    throw new Error("The bundled Drizzle migration journal is missing or invalid");
  }
}

export function assertCurrentOperatorSchema(db: AppDatabase) {
  const sqlite = db.$client;
  const tables = new Set(
    (
      sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
        name: string;
      }>
    ).map(({ name }) => name)
  );
  const missing = REQUIRED_TABLES.filter((table) => !tables.has(table));
  const userColumns = tables.has("users") ? tableColumns(sqlite, "users") : [];
  const settingsColumns = tables.has("user_settings") ? tableColumns(sqlite, "user_settings") : [];

  if (
    missing.length > 0 ||
    tables.has("settings") ||
    userColumns.includes("role") ||
    !settingsColumns.includes("custom_subtypes")
  ) {
    throw new Error(
      "The database does not have the current StackHatch schema. Stop the app, verify a SQLite-consistent backup, and run the explicit offline migration command first."
    );
  }
  const latestMigration = sqlite
    .prepare(
      "SELECT created_at AS createdAt FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1"
    )
    .get() as { createdAt: number } | undefined;
  if (Number(latestMigration?.createdAt) !== expectedMigrationVersion()) {
    throw new Error(
      "The database does not have the current StackHatch schema. Stop the app, verify a SQLite-consistent backup, and run the explicit offline migration command first."
    );
  }
  if (sqlite.prepare("SELECT 1 FROM pragma_foreign_key_check LIMIT 1").get()) {
    throw new Error(
      "The database failed foreign-key validation; no operator operation was attempted"
    );
  }
}

function asOpenError(error: unknown): Error {
  if (isSqliteBusyError(error)) {
    return new Error(
      "The database is busy or locked while opening it. Stop StackHatch and every other SQLite writer, then retry during the maintenance window."
    );
  }
  return error instanceof Error ? error : new Error("Unable to open the operator database");
}

export function openOperatorDatabaseFile(
  databasePath: string,
  options: { requireCurrentSchema: boolean }
): OperatorDatabase {
  const initialIdentity = readOperatorDatabaseIdentity(databasePath);
  let sqlite: Database.Database | undefined;
  try {
    sqlite = new Database(initialIdentity.canonicalPath, { fileMustExist: true, timeout: 1_000 });
    sqlite.pragma("foreign_keys = ON");
    sqlite.pragma("secure_delete = ON");
    const db = drizzle(sqlite, { schema });
    requireOperatorPragmas(db);
    if (options.requireCurrentSchema) assertCurrentOperatorSchema(db);

    // Opening SQLite can recover/checkpoint a WAL. Bind confirmation to the stable state after open,
    // while still rejecting a path swap that raced the open itself.
    const identity = readOperatorDatabaseIdentity(initialIdentity.canonicalPath);
    if (
      identity.canonicalPath !== initialIdentity.canonicalPath ||
      identity.device !== initialIdentity.device ||
      identity.inode !== initialIdentity.inode
    ) {
      throw new Error("The database path changed while it was being opened");
    }
    return {
      db,
      canonicalPath: identity.canonicalPath,
      databaseFingerprint: fingerprintOperatorDatabase(identity),
      identity,
      close: () => sqlite?.close(),
    };
  } catch (error) {
    sqlite?.close();
    throw asOpenError(error);
  }
}

export function revalidateOperatorDatabase(operator: OperatorDatabase) {
  let current: DatabaseIdentity;
  try {
    current = readOperatorDatabaseIdentity(operator.canonicalPath);
  } catch {
    throw new Error(
      "The database contents or path changed since it was opened; no operator operation was performed"
    );
  }
  if (
    current.canonicalPath !== operator.identity.canonicalPath ||
    current.device !== operator.identity.device ||
    current.inode !== operator.identity.inode ||
    current.contentDigest !== operator.identity.contentDigest ||
    fingerprintOperatorDatabase(current) !== operator.databaseFingerprint
  ) {
    throw new Error(
      "The database contents or path changed since it was opened; no operator operation was performed"
    );
  }
}
