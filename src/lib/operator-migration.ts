import { createHash } from "node:crypto";
import { readFileSync, statfsSync, statSync } from "node:fs";
import path from "node:path";
import { applyPendingMigrations } from "@/db/migrate";
import {
  assertCurrentOperatorSchema,
  fingerprintOperatorDatabase,
  openOperatorDatabaseFile,
  readOperatorDatabaseIdentity,
  revalidateOperatorDatabase,
} from "@/lib/operator-database";
import { isSqliteBusyError, sqliteErrorCode } from "@/lib/sqlite-errors";

type SqliteDatabase = import("better-sqlite3").Database;

interface MigrationJournal {
  entries: Array<{ idx: number; when: number }>;
}

interface RowDigest {
  count: number;
  digest: string;
}

interface PreservationSnapshot {
  users: RowDigest;
  projects: RowDigest;
  messages: RowDigest;
  templates: RowDigest;
  projectState: RowDigest;
  settingsFields: RowDigest;
  customSubtypes:
    | { mode: "preserve"; rows: RowDigest }
    | { mode: "backfill"; value: string; users: number };
}

export interface OfflineMigrationHooks {
  /** Test/release-gate hook for proving failures after the migration commit are reported safely. */
  afterCommit?: (sqlite: SqliteDatabase) => void;
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

function tableExists(sqlite: SqliteDatabase, table: string): boolean {
  return Boolean(
    sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)
  );
}

function tableColumns(sqlite: SqliteDatabase, table: string): Set<string> {
  if (!tableExists(sqlite, table)) return new Set();
  return new Set(
    (sqlite.pragma(`table_info(${table})`) as Array<{ name: string }>).map(({ name }) => name)
  );
}

function assertKnownMigrationHistory(sqlite: SqliteDatabase) {
  if (!tableExists(sqlite, "__drizzle_migrations")) {
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

function assertIntegrity(sqlite: SqliteDatabase, phase: string) {
  const integrity = sqlite.pragma("integrity_check") as Array<Record<string, unknown>>;
  if (integrity.length !== 1 || Object.values(integrity[0])[0] !== "ok") {
    throw new Error(`The database failed ${phase} integrity validation`);
  }
  if (sqlite.prepare("SELECT 1 FROM pragma_foreign_key_check LIMIT 1").get()) {
    throw new Error(`The database failed ${phase} foreign-key validation`);
  }
}

function existingFileBytes(filename: string): number {
  try {
    return statSync(filename).size;
  } catch (error) {
    if (sqliteErrorCode(error) === "ENOENT") return 0;
    throw error;
  }
}

export function requiredMigrationStorageBytes(databasePath: string): number {
  const sqliteStateBytes =
    existingFileBytes(databasePath) +
    existingFileBytes(`${databasePath}-wal`) +
    existingFileBytes(`${databasePath}-shm`);
  return sqliteStateBytes * 2 + 16 * 1024 * 1024;
}

function assertMigrationStorage(databasePath: string) {
  const filesystem = statfsSync(path.dirname(databasePath));
  const availableBytes = Number(filesystem.bavail) * Number(filesystem.bsize);
  const requiredBytes = requiredMigrationStorageBytes(databasePath);
  if (availableBytes < requiredBytes) {
    throw new Error(
      `Insufficient free storage for safe SQLite migration work; at least ${requiredBytes} bytes are required`
    );
  }
}

function digestRows(rows: unknown[]): RowDigest {
  return {
    count: rows.length,
    digest: createHash("sha256")
      .update("stackhatch-migration-preservation-v1\0")
      .update(JSON.stringify(rows))
      .digest("hex"),
  };
}

function queryDigest(sqlite: SqliteDatabase, sql: string): RowDigest {
  return digestRows(sqlite.prepare(sql).all());
}

function selectableColumn(columns: Set<string>, name: string): string {
  return columns.has(name) ? `\`${name}\`` : `NULL AS \`${name}\``;
}

function capturePreservationSnapshot(sqlite: SqliteDatabase): PreservationSnapshot {
  const userColumns = tableColumns(sqlite, "users");
  const projectColumns = tableColumns(sqlite, "projects");
  const settingsColumns = tableColumns(sqlite, "user_settings");
  const hasUsers = userColumns.size > 0;
  const hasProjects = projectColumns.size > 0;
  const hasMessages = tableExists(sqlite, "messages");
  const hasSettings = settingsColumns.size > 0;

  const users = hasUsers
    ? queryDigest(
        sqlite,
        `SELECT id, github_id, email, name, avatar_url, created_at FROM users ORDER BY id`
      )
    : digestRows([]);
  const projects = hasProjects
    ? queryDigest(
        sqlite,
        `SELECT id, name, description, repo_url,
                ${selectableColumn(projectColumns, "repo_commit_sha")},
                ${selectableColumn(projectColumns, "repo_scanned_at")},
                ${selectableColumn(projectColumns, "repo_analysis_status")},
                ${selectableColumn(projectColumns, "repo_analysis_warning")},
                canvas_state, user_id, created_at, updated_at
         FROM projects ORDER BY id`
      )
    : digestRows([]);
  const messages = hasMessages
    ? queryDigest(
        sqlite,
        "SELECT id, project_id, role, content, created_at FROM messages ORDER BY id"
      )
    : digestRows([]);

  let templates: RowDigest;
  if (tableExists(sqlite, "templates")) {
    templates = queryDigest(
      sqlite,
      "SELECT id, user_id, name, description, canvas_state, created_at FROM templates ORDER BY id"
    );
  } else if (tableExists(sqlite, "diagram_templates")) {
    templates = queryDigest(
      sqlite,
      `SELECT id, created_by AS user_id, name, description, canvas_state, created_at
       FROM diagram_templates ORDER BY id`
    );
  } else {
    templates = digestRows([]);
  }

  const projectState = tableExists(sqlite, "user_project_state")
    ? queryDigest(
        sqlite,
        "SELECT user_id, last_opened_project_id FROM user_project_state ORDER BY user_id"
      )
    : digestRows([]);
  const settingsFields = hasSettings
    ? queryDigest(
        sqlite,
        `SELECT users.id AS user_id,
                user_settings.anthropic_api_key AS anthropic_api_key,
                CASE WHEN user_settings.user_id IS NULL THEN 'claude-sonnet-5'
                     WHEN user_settings.model IN (
                  'claude-sonnet-4-20250514',
                  'claude-opus-4-20250514',
                  'claude-opus-4-1-20250805'
                ) THEN 'claude-sonnet-5' ELSE user_settings.model END AS model,
                CASE WHEN user_settings.user_id IS NULL THEN 'system'
                     ELSE user_settings.theme END AS theme,
                CASE WHEN user_settings.user_id IS NULL THEN users.created_at
                     ELSE user_settings.created_at END AS created_at,
                CASE WHEN user_settings.user_id IS NULL THEN users.created_at
                     ELSE user_settings.updated_at END AS updated_at
         FROM users
         LEFT JOIN user_settings ON user_settings.user_id = users.id
         ORDER BY users.id`
      )
    : hasUsers
      ? queryDigest(
          sqlite,
          `SELECT id AS user_id, NULL AS anthropic_api_key,
                  'claude-sonnet-5' AS model, 'system' AS theme,
                  created_at, created_at AS updated_at
           FROM users ORDER BY id`
        )
      : digestRows([]);

  let customSubtypes: PreservationSnapshot["customSubtypes"];
  if (settingsColumns.has("custom_subtypes")) {
    customSubtypes = {
      mode: "preserve",
      rows: queryDigest(
        sqlite,
        "SELECT user_id, custom_subtypes FROM user_settings ORDER BY user_id"
      ),
    };
  } else {
    const legacy = tableExists(sqlite, "settings")
      ? (sqlite.prepare("SELECT value FROM settings WHERE key = 'customSubtypes'").get() as
          | { value: string }
          | undefined)
      : undefined;
    customSubtypes = {
      mode: "backfill",
      value: legacy?.value ?? "{}",
      users: users.count,
    };
  }

  return {
    users,
    projects,
    messages,
    templates,
    projectState,
    settingsFields,
    customSubtypes,
  };
}

function assertDigest(label: string, expected: RowDigest, actual: RowDigest) {
  if (expected.count !== actual.count || expected.digest !== actual.digest) {
    throw new Error(`Migration preservation check failed for ${label}`);
  }
}

function normalizedForeignKeys(sqlite: SqliteDatabase, table: string) {
  return (
    sqlite.pragma(`foreign_key_list(${table})`) as Array<{
      table: string;
      from: string;
      to: string;
      on_update: string;
      on_delete: string;
    }>
  )
    .map(({ table: target, from, to, on_update, on_delete }) => ({
      target,
      from,
      to,
      onUpdate: on_update.toUpperCase(),
      onDelete: on_delete.toUpperCase(),
    }))
    .sort((left, right) =>
      `${left.target}:${left.from}:${left.to}`.localeCompare(
        `${right.target}:${right.from}:${right.to}`
      )
    );
}

function assertForeignKeyDefinitions(sqlite: SqliteDatabase) {
  const expected = {
    projects: [
      { target: "users", from: "user_id", to: "id", onUpdate: "NO ACTION", onDelete: "CASCADE" },
    ],
    messages: [
      {
        target: "projects",
        from: "project_id",
        to: "id",
        onUpdate: "NO ACTION",
        onDelete: "CASCADE",
      },
    ],
    templates: [
      { target: "users", from: "user_id", to: "id", onUpdate: "NO ACTION", onDelete: "CASCADE" },
    ],
    user_settings: [
      { target: "users", from: "user_id", to: "id", onUpdate: "NO ACTION", onDelete: "CASCADE" },
    ],
    user_project_state: [
      {
        target: "projects",
        from: "last_opened_project_id",
        to: "id",
        onUpdate: "NO ACTION",
        onDelete: "CASCADE",
      },
      {
        target: "projects",
        from: "user_id",
        to: "user_id",
        onUpdate: "NO ACTION",
        onDelete: "CASCADE",
      },
      { target: "users", from: "user_id", to: "id", onUpdate: "NO ACTION", onDelete: "CASCADE" },
    ],
  } as const;

  for (const [table, definitions] of Object.entries(expected)) {
    if (JSON.stringify(normalizedForeignKeys(sqlite, table)) !== JSON.stringify(definitions)) {
      throw new Error(`Migration verification failed for ${table} foreign-key definitions`);
    }
  }
}

function assertIndex(sqlite: SqliteDatabase, table: string, index: string, columns: string[]) {
  const indexes = sqlite.pragma(`index_list(${table})`) as Array<{ name: string }>;
  if (!indexes.some(({ name }) => name === index)) {
    throw new Error(`Migration verification failed: required ${table} index is missing`);
  }
  const actualColumns = (
    sqlite.pragma(`index_info(${index})`) as Array<{ seqno: number; name: string }>
  )
    .sort((left, right) => left.seqno - right.seqno)
    .map(({ name }) => name);
  if (JSON.stringify(actualColumns) !== JSON.stringify(columns)) {
    throw new Error(`Migration verification failed: required ${table} index has changed`);
  }
}

function verifyPreservation(sqlite: SqliteDatabase, before: PreservationSnapshot) {
  assertDigest(
    "users",
    before.users,
    queryDigest(
      sqlite,
      "SELECT id, github_id, email, name, avatar_url, created_at FROM users ORDER BY id"
    )
  );
  assertDigest(
    "projects",
    before.projects,
    queryDigest(
      sqlite,
      `SELECT id, name, description, repo_url, repo_commit_sha, repo_scanned_at,
              repo_analysis_status, repo_analysis_warning, canvas_state, user_id, created_at, updated_at
       FROM projects ORDER BY id`
    )
  );
  assertDigest(
    "messages",
    before.messages,
    queryDigest(
      sqlite,
      "SELECT id, project_id, role, content, created_at FROM messages ORDER BY id"
    )
  );
  assertDigest(
    "templates",
    before.templates,
    queryDigest(
      sqlite,
      "SELECT id, user_id, name, description, canvas_state, created_at FROM templates ORDER BY id"
    )
  );
  assertDigest(
    "user project state",
    before.projectState,
    queryDigest(
      sqlite,
      "SELECT user_id, last_opened_project_id FROM user_project_state ORDER BY user_id"
    )
  );
  assertDigest(
    "user settings fields",
    before.settingsFields,
    queryDigest(
      sqlite,
      `SELECT user_id, anthropic_api_key, model, theme, created_at, updated_at
       FROM user_settings ORDER BY user_id`
    )
  );

  if (before.customSubtypes.mode === "preserve") {
    assertDigest(
      "custom subtype settings",
      before.customSubtypes.rows,
      queryDigest(sqlite, "SELECT user_id, custom_subtypes FROM user_settings ORDER BY user_id")
    );
  } else {
    const backfill = sqlite
      .prepare(
        `SELECT COUNT(*) AS count
         FROM user_settings
         WHERE custom_subtypes = ?`
      )
      .get(before.customSubtypes.value) as { count: number };
    if (backfill.count !== before.customSubtypes.users) {
      throw new Error("Migration verification failed for custom subtype backfill");
    }
  }

  const counts = sqlite
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM users) AS users,
         (SELECT COUNT(*) FROM user_settings) AS settings`
    )
    .get() as { users: number; settings: number };
  if (counts.users !== counts.settings || counts.users !== before.users.count) {
    throw new Error("Migration verification failed: expected exactly one settings row per user");
  }

  assertIndex(sqlite, "messages", "messages_project_id_idx", ["project_id"]);
  assertIndex(sqlite, "templates", "templates_user_id_idx", ["user_id"]);
  assertIndex(sqlite, "projects", "projects_user_id_id_unique", ["user_id", "id"]);
  assertIndex(sqlite, "projects", "projects_user_resume_order_idx", [
    "user_id",
    "updated_at",
    "created_at",
    "id",
  ]);
  assertForeignKeyDefinitions(sqlite);

  return counts;
}

function committedVerificationError(error: unknown): Error {
  const detail = error instanceof Error ? error.message : "post-migration verification failed";
  return new Error(
    `Migration committed but verification failed: ${detail}. Keep traffic stopped; choose an explicit forward repair or verified restore before restarting StackHatch.`
  );
}

export function migrateDatabaseOffline(databasePath: string, hooks: OfflineMigrationHooks = {}) {
  const operator = openOperatorDatabaseFile(databasePath, { requireCurrentSchema: false });
  try {
    assertKnownMigrationHistory(operator.db.$client);
    assertIntegrity(operator.db.$client, "preflight");
    assertMigrationStorage(operator.canonicalPath);
    const snapshot = capturePreservationSnapshot(operator.db.$client);
    revalidateOperatorDatabase(operator);

    try {
      applyPendingMigrations(operator.db);
    } catch (error) {
      if (isSqliteBusyError(error)) {
        throw new Error(
          "The database is busy or locked. Stop StackHatch and every other SQLite writer, then retry during the maintenance window."
        );
      }
      throw error;
    }

    // Drizzle migrations commit before returning. Every failure after this point must tell the
    // operator that rollback is no longer implicit.
    try {
      hooks.afterCommit?.(operator.db.$client);
      assertCurrentOperatorSchema(operator.db);
      assertIntegrity(operator.db.$client, "post-migration");
      const counts = verifyPreservation(operator.db.$client, snapshot);
      const migratedIdentity = readOperatorDatabaseIdentity(operator.canonicalPath);

      return {
        databaseFingerprint: fingerprintOperatorDatabase(migratedIdentity),
        migrated: true as const,
        users: counts.users,
        settings: counts.settings,
      };
    } catch (error) {
      throw committedVerificationError(error);
    }
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
