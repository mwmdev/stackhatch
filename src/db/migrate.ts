import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb, type AppDatabase } from "./index";
import path from "path";

const migratedDatabases = new WeakSet<AppDatabase>();

export function runMigrations(db?: AppDatabase) {
  const database = db ?? getDb();
  if (migratedDatabases.has(database)) return;

  const migrationsFolder = path.resolve(process.cwd(), "drizzle");
  migrate(database, { migrationsFolder });
  migratedDatabases.add(database);
}
