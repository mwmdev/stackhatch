import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb, type AppDatabase } from "./index";
import { parseCustomSubtypes } from "@/lib/custom-subtypes";
import { assertCurrentOperatorSchema } from "@/lib/operator-database";
import path from "path";

const migratedDatabases = new WeakSet<AppDatabase>();

function assertLegacyProjectsHaveOwners(database: AppDatabase) {
  const sqlite = database.$client;
  const projectsTable = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'projects'")
    .get();
  if (!projectsTable) return;

  const columns = sqlite.pragma("table_info(projects)") as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "user_id")) return;

  const unowned = sqlite
    .prepare("SELECT COUNT(*) AS count FROM projects WHERE user_id IS NULL")
    .get() as { count: number };
  if (unowned.count === 0) return;

  throw new Error(
    `Cannot migrate ${unowned.count} project${unowned.count === 1 ? "" : "s"} without an owner. ` +
      "Back up the database, assign each projects.user_id to a valid users.id, and restart StackHatch."
  );
}

export function installLegacyCustomSubtypeMigrationGuard(database: AppDatabase) {
  const sqlite = database.$client;
  const settingsTable = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'settings'")
    .get();
  const row = settingsTable
    ? (sqlite.prepare("SELECT value FROM settings WHERE key = 'customSubtypes'").get() as
        | { value: string }
        | undefined)
    : undefined;
  const capturedValue = row?.value ?? null;

  if (capturedValue !== null) {
    try {
      parseCustomSubtypes(capturedValue);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "the value is invalid";
      throw new Error(
        `Cannot migrate the global custom subtype catalog: ${detail}. ` +
          "No schema changes were applied. Back up the database, repair or remove the settings.customSubtypes row, and restart StackHatch."
      );
    }
  }

  sqlite.function("stackhatch_validated_custom_subtypes", { deterministic: true }, (value) => {
    const currentValue = value === null ? null : String(value);
    if (currentValue !== capturedValue) {
      throw new Error("The legacy custom subtype catalog changed after migration preflight");
    }
    return capturedValue ?? "{}";
  });

  return capturedValue;
}

export function applyPendingMigrations(db?: AppDatabase) {
  const database = db ?? getDb();
  if (migratedDatabases.has(database)) return;

  assertLegacyProjectsHaveOwners(database);
  installLegacyCustomSubtypeMigrationGuard(database);
  const migrationsFolder = path.resolve(process.cwd(), "drizzle");
  migrate(database, { migrationsFolder });
  migratedDatabases.add(database);
}

/**
 * Prepare a database for an application request. Production requests may only validate schema:
 * mutation is reserved for the explicit offline operator command. Development and tests retain
 * automatic setup so disposable local databases remain convenient.
 */
export function runMigrations(db?: AppDatabase) {
  const database = db ?? getDb();
  if (migratedDatabases.has(database)) return;

  if (process.env.NODE_ENV === "production") {
    assertCurrentOperatorSchema(database);
    migratedDatabases.add(database);
    return;
  }

  applyPendingMigrations(database);
}
