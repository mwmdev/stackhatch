import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { accessSync, constants, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import type { AppDatabase } from "@/db";
import { deleteAccountById, type AccountDeletionCounts } from "@/lib/account-deletion";
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

interface DatabaseIdentity {
  canonicalPath: string;
  device: number;
  inode: number;
}

export interface OperatorDatabase {
  db: AppDatabase;
  canonicalPath: string;
  databaseFingerprint: string;
  close: () => void;
  identity: DatabaseIdentity;
}

export type AccountSelector = { id: string } | { githubId: string } | { email: string };

export interface AccountPreviewCandidate {
  internalId: string;
  githubId: string;
  email: string | null;
  deletionConfirmation: string;
  counts: AccountDeletionCounts;
}

export interface AccountPreview {
  databaseFingerprint: string;
  confirmationFormat: "DELETE {databaseFingerprint} {internalId}";
  candidates: AccountPreviewCandidate[];
}

export type ManageAccountArgs =
  | { command: "preview"; database: string; selector: AccountSelector }
  | { command: "delete"; database: string; id: string; confirmation: string };

function asOperatorError(error: unknown, action: string): Error {
  if (isSqliteBusyError(error)) {
    return new Error(
      `The database is busy or locked while ${action}. Stop StackHatch and every other SQLite writer, then retry during the maintenance window.`
    );
  }
  return error instanceof Error ? error : new Error(`Unable to ${action}`);
}

function readIdentity(databasePath: string): DatabaseIdentity {
  if (!databasePath.trim()) throw new Error("--database requires an explicit path");

  const absolutePath = path.resolve(databasePath);
  let canonicalPath: string;
  try {
    canonicalPath = realpathSync(absolutePath);
    accessSync(canonicalPath, constants.R_OK | constants.W_OK);
  } catch (error) {
    const code = sqliteErrorCode(error);
    if (code === "ENOENT") {
      throw new Error("The explicit database path does not exist");
    }
    throw new Error("The explicit database path is not readable and writable");
  }

  const stat = statSync(canonicalPath);
  if (!stat.isFile()) throw new Error("The explicit database path is not a regular file");
  return { canonicalPath, device: stat.dev, inode: stat.ino };
}

function fingerprint(identity: DatabaseIdentity): string {
  return createHash("sha256")
    .update(
      `stackhatch-database-v1\0${identity.canonicalPath}\0${identity.device}\0${identity.inode}`
    )
    .digest("hex")
    .slice(0, 20);
}

function requirePragmas(db: AppDatabase) {
  for (const pragma of ["foreign_keys", "secure_delete"] as const) {
    if (db.$client.pragma(pragma, { simple: true }) !== 1) {
      throw new Error(`${pragma} must be enabled for operator account operations`);
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
      "The database failed foreign-key validation; no account operation was attempted"
    );
  }
}

function openOperatorDatabaseFile(
  databasePath: string,
  options: { requireCurrentSchema: boolean }
): OperatorDatabase {
  const identity = readIdentity(databasePath);
  let sqlite: Database.Database | undefined;
  try {
    sqlite = new Database(identity.canonicalPath, { fileMustExist: true, timeout: 1_000 });
    sqlite.pragma("foreign_keys = ON");
    sqlite.pragma("secure_delete = ON");
    const db = drizzle(sqlite, { schema });
    requirePragmas(db);
    if (options.requireCurrentSchema) assertCurrentOperatorSchema(db);
    return {
      db,
      canonicalPath: identity.canonicalPath,
      databaseFingerprint: fingerprint(identity),
      identity,
      close: () => sqlite?.close(),
    };
  } catch (error) {
    sqlite?.close();
    throw asOperatorError(error, "opening the database");
  }
}

export function openOperatorDatabase(databasePath: string): OperatorDatabase {
  return openOperatorDatabaseFile(databasePath, { requireCurrentSchema: true });
}

export function openOperatorMigrationDatabase(databasePath: string): OperatorDatabase {
  return openOperatorDatabaseFile(databasePath, { requireCurrentSchema: false });
}

export function revalidateOperatorDatabase(operator: OperatorDatabase) {
  let current: DatabaseIdentity;
  try {
    current = readIdentity(operator.canonicalPath);
  } catch {
    throw new Error("The database path changed since it was opened; no account was deleted");
  }
  if (
    current.canonicalPath !== operator.identity.canonicalPath ||
    current.device !== operator.identity.device ||
    current.inode !== operator.identity.inode ||
    fingerprint(current) !== operator.databaseFingerprint
  ) {
    throw new Error("The database path changed since it was opened; no account was deleted");
  }
}

function redactOpaque(value: string): string {
  const visible = value.slice(-4);
  return `${"*".repeat(Math.max(3, value.length - visible.length))}${visible}`;
}

function redactEmail(value: string | null): string | null {
  if (!value) return null;
  const at = value.indexOf("@");
  if (at < 1) return "***";
  return `${value[0]}${"*".repeat(Math.max(3, at - 1))}${value.slice(at)}`;
}

interface CandidateRow {
  internalId: string;
  githubId: string;
  email: string | null;
  users: number;
  projects: number;
  messages: number;
  templates: number;
  settings: number;
  projectState: number;
}

function selectorSql(selector: AccountSelector): { clause: string; value: string } {
  if ("id" in selector) return { clause: "u.id = ?", value: selector.id };
  if ("githubId" in selector) return { clause: "u.github_id = ?", value: selector.githubId };
  return { clause: "u.email = ?", value: selector.email };
}

export function previewAccounts(
  operator: OperatorDatabase,
  selector: AccountSelector
): AccountPreview {
  requirePragmas(operator.db);
  assertCurrentOperatorSchema(operator.db);
  const exact = selectorSql(selector);

  try {
    const rows = operator.db.$client
      .prepare(
        `SELECT
           u.id AS internalId,
           u.github_id AS githubId,
           u.email AS email,
           1 AS users,
           (SELECT COUNT(*) FROM projects p WHERE p.user_id = u.id) AS projects,
           (SELECT COUNT(*) FROM messages m
              INNER JOIN projects p ON p.id = m.project_id
              WHERE p.user_id = u.id) AS messages,
           (SELECT COUNT(*) FROM templates t WHERE t.user_id = u.id) AS templates,
           (SELECT COUNT(*) FROM user_settings s WHERE s.user_id = u.id) AS settings,
           (SELECT COUNT(*) FROM user_project_state ps WHERE ps.user_id = u.id) AS projectState
         FROM users u
         WHERE ${exact.clause}
         ORDER BY u.id`
      )
      .all(exact.value) as CandidateRow[];

    return {
      databaseFingerprint: operator.databaseFingerprint,
      confirmationFormat: "DELETE {databaseFingerprint} {internalId}",
      candidates: rows.map((row) => ({
        internalId: row.internalId,
        githubId: redactOpaque(row.githubId),
        email: redactEmail(row.email),
        deletionConfirmation: buildDeletionConfirmation(
          operator.databaseFingerprint,
          row.internalId
        ),
        counts: {
          users: row.users,
          projects: row.projects,
          messages: row.messages,
          templates: row.templates,
          settings: row.settings,
          projectState: row.projectState,
        },
      })),
    };
  } catch (error) {
    throw asOperatorError(error, "previewing the account");
  }
}

export function buildDeletionConfirmation(databaseFingerprint: string, internalId: string) {
  return `DELETE ${databaseFingerprint} ${internalId}`;
}

export function deleteOperatorAccount(
  operator: OperatorDatabase,
  internalId: string,
  confirmation: string
) {
  const expected = buildDeletionConfirmation(operator.databaseFingerprint, internalId);
  if (confirmation !== expected) {
    throw new Error(
      "The confirmation does not exactly match the selected database fingerprint and internal user ID"
    );
  }

  const preview = previewAccounts(operator, { id: internalId });
  if (preview.candidates.length === 0) {
    throw new Error(`No user exists for internal ID ${internalId}`);
  }
  revalidateOperatorDatabase(operator);

  try {
    const result = deleteAccountById(operator.db, internalId);
    if (!result.deleted) {
      throw new Error(`No user exists for internal ID ${internalId}`);
    }
    return {
      databaseFingerprint: operator.databaseFingerprint,
      internalId,
      deleted: true as const,
      counts: result.counts,
    };
  } catch (error) {
    throw asOperatorError(error, "deleting the account");
  }
}

function parseOptions(args: string[]) {
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!option?.startsWith("--")) throw new Error(`Unexpected argument: ${option ?? ""}`);
    if (!["--database", "--id", "--github-id", "--email", "--confirm"].includes(option)) {
      throw new Error(`Unknown option: ${option}`);
    }
    if (value === undefined || value.startsWith("--"))
      throw new Error(`${option} requires a value`);
    if (options.has(option)) throw new Error(`${option} may be provided only once`);
    options.set(option, value);
  }
  return options;
}

export function parseManageAccountArgs(args: string[]): ManageAccountArgs {
  const [command, ...rest] = args;
  if (command !== "preview" && command !== "delete") {
    throw new Error("Expected account command: preview or delete");
  }
  const options = parseOptions(rest);
  const database = options.get("--database");
  if (!database) throw new Error("--database is required");

  if (command === "delete") {
    const id = options.get("--id");
    if (!id || options.has("--github-id") || options.has("--email")) {
      throw new Error("delete requires --id and does not accept --github-id or --email");
    }
    const confirmation = options.get("--confirm");
    if (!confirmation) throw new Error("delete requires --confirm");
    return { command, database, id, confirmation };
  }

  if (options.has("--confirm")) throw new Error("preview does not accept --confirm");
  const selectors = [
    options.has("--id") ? ({ id: options.get("--id")! } as const) : null,
    options.has("--github-id") ? ({ githubId: options.get("--github-id")! } as const) : null,
    options.has("--email") ? ({ email: options.get("--email")! } as const) : null,
  ].filter((selector): selector is AccountSelector => selector !== null);
  if (selectors.length !== 1) {
    throw new Error("preview requires exactly one of --id, --github-id, or --email");
  }
  return { command, database, selector: selectors[0] };
}

export function executeManageAccount(args: string[]) {
  const parsed = parseManageAccountArgs(args);
  const operator = openOperatorDatabase(parsed.database);
  try {
    if (parsed.command === "preview") return previewAccounts(operator, parsed.selector);
    return deleteOperatorAccount(operator, parsed.id, parsed.confirmation);
  } finally {
    operator.close();
  }
}
