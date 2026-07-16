import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db";
import * as schema from "@/db/schema";
import { projects, userProjectState, users } from "@/db/schema";
import {
  clearStaleProjectResume,
  recordProjectOpen,
  resolveProjectResume,
} from "@/lib/project-resume";

let sqlite: Database.Database;
let testDb: AppDatabase;

function createResumeTestDb() {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY NOT NULL,
      github_id TEXT NOT NULL UNIQUE,
      email TEXT,
      name TEXT,
      avatar_url TEXT,
      role TEXT DEFAULT 'user' NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      repo_url TEXT,
      repo_commit_sha TEXT,
      repo_scanned_at INTEGER,
      repo_analysis_status TEXT,
      repo_analysis_warning TEXT,
      canvas_state TEXT,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT projects_user_id_id_unique UNIQUE (user_id, id)
    );
    CREATE TABLE user_project_state (
      user_id TEXT PRIMARY KEY NOT NULL,
      last_opened_project_id TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id, last_opened_project_id)
        REFERENCES projects(user_id, id) ON DELETE CASCADE
    );
  `);

  return drizzle(sqlite, { schema });
}

function insertProject({
  id,
  userId = "user-1",
  createdAt,
  updatedAt,
}: {
  id: string;
  userId?: string;
  createdAt: number;
  updatedAt: number;
}) {
  testDb.insert(projects).values({ id, name: id, userId, createdAt, updatedAt }).run();
}

beforeEach(() => {
  testDb = createResumeTestDb();
  testDb
    .insert(users)
    .values([
      { id: "user-1", githubId: "github-1", createdAt: 1 },
      { id: "user-2", githubId: "github-2", createdAt: 2 },
    ])
    .run();
});

describe("project resume state", () => {
  it("resolves the owned remembered project ahead of a more recently updated project", () => {
    insertProject({ id: "remembered", createdAt: 10, updatedAt: 20 });
    insertProject({ id: "newer-content", createdAt: 30, updatedAt: 40 });

    expect(recordProjectOpen(testDb, "user-1", "remembered")).toBe(true);

    expect(resolveProjectResume(testDb, "user-1")?.id).toBe("remembered");
    expect(
      testDb.select().from(projects).where(eq(projects.id, "remembered")).get()?.updatedAt
    ).toBe(20);
  });

  it("falls back deterministically and clears an observed stale pointer", () => {
    insertProject({ id: "older-update", createdAt: 500, updatedAt: 600 });
    insertProject({ id: "tie-a", createdAt: 800, updatedAt: 900 });
    insertProject({ id: "tie-z", createdAt: 800, updatedAt: 900 });
    insertProject({ id: "foreign-newest", userId: "user-2", createdAt: 1000, updatedAt: 1000 });

    sqlite.pragma("foreign_keys = OFF");
    sqlite
      .prepare("INSERT INTO user_project_state (user_id, last_opened_project_id) VALUES (?, ?)")
      .run("user-1", "deleted-project");
    sqlite.pragma("foreign_keys = ON");

    expect(resolveProjectResume(testDb, "user-1")?.id).toBe("tie-z");
    expect(
      testDb.select().from(userProjectState).where(eq(userProjectState.userId, "user-1")).get()
        ?.lastOpenedProjectId
    ).toBeNull();
  });

  it("returns no fallback when the account owns no projects", () => {
    insertProject({ id: "foreign", userId: "user-2", createdAt: 1, updatedAt: 1 });

    expect(resolveProjectResume(testDb, "user-1")).toBeUndefined();
  });

  it("records only an owned project and lets the last successful statement win", () => {
    insertProject({ id: "first", createdAt: 1, updatedAt: 10 });
    insertProject({ id: "second", createdAt: 2, updatedAt: 20 });
    insertProject({ id: "foreign", userId: "user-2", createdAt: 3, updatedAt: 30 });

    expect(recordProjectOpen(testDb, "user-1", "missing")).toBe(false);
    expect(recordProjectOpen(testDb, "user-1", "foreign")).toBe(false);
    expect(testDb.select().from(userProjectState).all()).toEqual([]);

    expect(recordProjectOpen(testDb, "user-1", "first")).toBe(true);
    expect(recordProjectOpen(testDb, "user-1", "first")).toBe(false);
    expect(recordProjectOpen(testDb, "user-1", "second")).toBe(true);

    expect(testDb.select().from(userProjectState).all()).toEqual([
      { userId: "user-1", lastOpenedProjectId: "second" },
    ]);
  });

  it("does not clear a newer pointer while cleaning up an older observation", () => {
    insertProject({ id: "older-observation", createdAt: 1, updatedAt: 1 });
    insertProject({ id: "newer-open", createdAt: 2, updatedAt: 2 });
    expect(recordProjectOpen(testDb, "user-1", "newer-open")).toBe(true);

    expect(clearStaleProjectResume(testDb, "user-1", "older-observation")).toBe(false);
    expect(
      testDb.select().from(userProjectState).where(eq(userProjectState.userId, "user-1")).get()
    ).toEqual({ userId: "user-1", lastOpenedProjectId: "newer-open" });

    expect(clearStaleProjectResume(testDb, "user-1", "newer-open")).toBe(true);
    expect(
      testDb.select().from(userProjectState).where(eq(userProjectState.userId, "user-1")).get()
    ).toEqual({ userId: "user-1", lastOpenedProjectId: null });
  });

  it("removes resume state when the pointed project is deleted", () => {
    insertProject({ id: "pointed", createdAt: 1, updatedAt: 1 });
    expect(recordProjectOpen(testDb, "user-1", "pointed")).toBe(true);

    testDb.delete(projects).where(eq(projects.id, "pointed")).run();

    expect(testDb.select().from(userProjectState).all()).toEqual([]);
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);
  });
});
