import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb, type AppDatabase } from "./index";
import { parseCustomSubtypes } from "@/lib/custom-subtypes";
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

function assertLegacyCustomSubtypesAreValid(database: AppDatabase) {
  const sqlite = database.$client;
  const settingsTable = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'settings'")
    .get();
  if (!settingsTable) return;

  const row = sqlite.prepare("SELECT value FROM settings WHERE key = 'customSubtypes'").get() as
    | { value: string }
    | undefined;
  if (!row) return;

  try {
    parseCustomSubtypes(row.value);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "the value is invalid";
    throw new Error(
      `Cannot migrate the global custom subtype catalog: ${detail}. ` +
        "No schema changes were applied. Back up the database, repair or remove the settings.customSubtypes row, and restart StackHatch."
    );
  }
}

export function runMigrations(db?: AppDatabase) {
  const database = db ?? getDb();
  if (migratedDatabases.has(database)) return;

  assertLegacyProjectsHaveOwners(database);
  assertLegacyCustomSubtypesAreValid(database);
  const migrationsFolder = path.resolve(process.cwd(), "drizzle");
  migrate(database, { migrationsFolder });
  migratedDatabases.add(database);
}
