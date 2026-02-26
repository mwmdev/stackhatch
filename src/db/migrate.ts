import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb, type AppDatabase } from "./index";
import path from "path";

export function runMigrations(db?: AppDatabase) {
  const database = db ?? getDb();
  const migrationsFolder = path.resolve(process.cwd(), "drizzle");
  migrate(database, { migrationsFolder });
}
