import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "@/db";
import * as schema from "@/db/schema";
import { userSettings, users } from "@/db/schema";
import { provisionUser } from "@/lib/user-provisioning";

let sqlite: Database.Database;
let db: AppDatabase;

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY NOT NULL,
      github_id TEXT NOT NULL UNIQUE,
      email TEXT,
      name TEXT,
      avatar_url TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE user_settings (
      user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      anthropic_api_key TEXT,
      model TEXT DEFAULT 'claude-sonnet-5' NOT NULL,
      theme TEXT DEFAULT 'system' NOT NULL,
      custom_subtypes TEXT DEFAULT '{}' NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  db = drizzle(sqlite, { schema });
});

describe("provisionUser", () => {
  it("creates the user and default settings together", () => {
    const user = provisionUser(db, {
      id: "user-1",
      githubId: "github-1",
      email: "user@example.com",
      name: "User One",
      avatarUrl: "https://example.com/avatar.png",
      now: 100,
    });

    expect(user).toMatchObject({ id: "user-1", githubId: "github-1" });
    expect(db.select().from(userSettings).get()).toMatchObject({
      userId: "user-1",
      model: "claude-sonnet-5",
      theme: "system",
      customSubtypes: "{}",
      createdAt: 100,
      updatedAt: 100,
    });
  });

  it("updates profile details without replacing existing settings", () => {
    provisionUser(db, {
      id: "user-1",
      githubId: "github-1",
      email: "old@example.com",
      name: "Old Name",
      avatarUrl: null,
      now: 100,
    });
    db.update(userSettings)
      .set({ model: "claude-opus-4-8", theme: "dark", customSubtypes: '{"client":[]}' })
      .run();

    const user = provisionUser(db, {
      id: "ignored-new-id",
      githubId: "github-1",
      email: "new@example.com",
      name: "New Name",
      avatarUrl: "https://example.com/new.png",
      now: 200,
    });

    expect(user).toMatchObject({
      id: "user-1",
      email: "new@example.com",
      name: "New Name",
      avatarUrl: "https://example.com/new.png",
    });
    expect(db.select().from(userSettings).get()).toMatchObject({
      userId: "user-1",
      model: "claude-opus-4-8",
      theme: "dark",
      customSubtypes: '{"client":[]}',
      createdAt: 100,
      updatedAt: 100,
    });
  });

  it("rolls back a new user when settings creation fails", () => {
    sqlite.exec(`
      CREATE TRIGGER reject_settings
      BEFORE INSERT ON user_settings
      BEGIN
        SELECT RAISE(ABORT, 'settings rejected');
      END;
    `);

    expect(() =>
      provisionUser(db, {
        id: "user-1",
        githubId: "github-1",
        email: null,
        name: null,
        avatarUrl: null,
        now: 100,
      })
    ).toThrow("settings rejected");
    expect(db.select().from(users).all()).toEqual([]);
  });
});
