import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

function getDatabasePath(): string {
  const dbUrl = process.env.DATABASE_URL ?? "file:./data/stackhatch.db";
  // Strip "file:" prefix if present
  return dbUrl.replace(/^file:/, "");
}

function createDatabase(dbPath?: string) {
  const resolvedPath = dbPath ?? getDatabasePath();

  // Ensure directory exists
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(resolvedPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  return drizzle(sqlite, { schema });
}

// Singleton for app usage
let _db: ReturnType<typeof createDatabase> | null = null;

export function getDb() {
  if (!_db) {
    _db = createDatabase();
  }
  return _db;
}

// For testing — creates a fresh in-memory or file-based DB
export function createTestDb(dbPath?: string) {
  return createDatabase(dbPath ?? ":memory:");
}

export type AppDatabase = ReturnType<typeof createDatabase>;
