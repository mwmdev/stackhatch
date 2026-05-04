import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb, type AppDatabase } from "./index";
import path from "path";
import { eq } from "drizzle-orm";
import { settings } from "./schema";

const migratedDatabases = new WeakSet<AppDatabase>();

export function runMigrations(db?: AppDatabase) {
  const database = db ?? getDb();
  if (migratedDatabases.has(database)) return;

  const migrationsFolder = path.resolve(process.cwd(), "drizzle");
  migrate(database, { migrationsFolder });
  database.delete(settings).where(eq(settings.key, "apiKey")).run();
  migratedDatabases.add(database);
}
