import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, renameSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/db";
import { runMigrations } from "@/db/migrate";
import { messages, projects, templates, userProjectState, userSettings, users } from "@/db/schema";
import {
  buildDeletionConfirmation,
  deleteOperatorAccount,
  openOperatorDatabase,
  parseManageAccountArgs,
  previewAccounts,
} from "@/lib/operator-account";

let directory: string;
let filename: string;

function seedDatabase(databasePath: string, duplicateEmail = false) {
  const db = createTestDb(databasePath);
  runMigrations(db);
  db.insert(users)
    .values([
      {
        id: "target-user",
        githubId: "123456789",
        email: "target@example.com",
        name: "Target Person",
        createdAt: 1,
      },
      {
        id: "control-user",
        githubId: "987654321",
        email: duplicateEmail ? "target@example.com" : "control@example.com",
        name: "Control Person",
        createdAt: 1,
      },
    ])
    .run();
  for (const [userId, suffix] of [
    ["target-user", "target"],
    ["control-user", "control"],
  ] as const) {
    db.insert(userSettings)
      .values({
        userId,
        anthropicApiKey: `encrypted-secret-${suffix}`,
        createdAt: 1,
        updatedAt: 1,
      })
      .run();
    db.insert(projects)
      .values({
        id: `project-${suffix}`,
        name: `Private project ${suffix}`,
        repoUrl: `https://example.com/private-${suffix}`,
        canvasState: `private canvas ${suffix}`,
        userId,
        createdAt: 1,
        updatedAt: 1,
      })
      .run();
    db.insert(messages)
      .values({
        id: `message-${suffix}`,
        projectId: `project-${suffix}`,
        role: "user",
        content: `private message ${suffix}`,
        createdAt: 1,
      })
      .run();
    db.insert(templates)
      .values({
        id: `template-${suffix}`,
        userId,
        name: `Private template ${suffix}`,
        canvasState: `private template canvas ${suffix}`,
        createdAt: 1,
      })
      .run();
    db.insert(userProjectState)
      .values({ userId, lastOpenedProjectId: `project-${suffix}` })
      .run();
  }
  db.$client.close();
}

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "stackhatch-operator-"));
  filename = path.join(directory, "stackhatch.db");
  seedDatabase(filename);
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe("account operator boundary", () => {
  it.each([
    [{ id: "target-user" }, "target-user"],
    [{ githubId: "123456789" }, "target-user"],
    [{ email: "target@example.com" }, "target-user"],
  ] as const)(
    "previews an exact selector with redacted identity and safe counts",
    (selector, id) => {
      const operator = openOperatorDatabase(filename);
      try {
        const preview = previewAccounts(operator, selector);
        expect(preview.candidates).toEqual([
          {
            internalId: id,
            githubId: "*****6789",
            email: "t*****@example.com",
            deletionConfirmation: buildDeletionConfirmation(
              operator.databaseFingerprint,
              "target-user"
            ),
            counts: {
              users: 1,
              projects: 1,
              messages: 1,
              templates: 1,
              settings: 1,
              projectState: 1,
            },
          },
        ]);
        const output = JSON.stringify(preview);
        expect(output).not.toContain("Target Person");
        expect(output).not.toContain("encrypted-secret");
        expect(output).not.toContain("Private project");
        expect(output).not.toContain("private message");
        expect(output).not.toContain("private canvas");
      } finally {
        operator.close();
      }
    }
  );

  it("returns every exact-email match without choosing for the operator", () => {
    rmSync(filename);
    seedDatabase(filename, true);
    const operator = openOperatorDatabase(filename);
    try {
      expect(previewAccounts(operator, { email: "target@example.com" }).candidates).toHaveLength(2);
    } finally {
      operator.close();
    }
  });

  it.each([
    ["a", "***"],
    ["ab", "***b"],
    ["abc", "***c"],
    ["abcd", "***d"],
  ])("does not expose a short opaque GitHub ID (%s)", (githubId, redacted) => {
    const sqlite = new Database(filename);
    sqlite.prepare("UPDATE users SET github_id = ? WHERE id = 'target-user'").run(githubId);
    sqlite.close();

    const operator = openOperatorDatabase(filename);
    try {
      expect(previewAccounts(operator, { id: "target-user" }).candidates[0]?.githubId).toBe(
        redacted
      );
    } finally {
      operator.close();
    }
  });

  it("deletes one internal ID only after an exact database-bound confirmation", () => {
    const operator = openOperatorDatabase(filename);
    try {
      const confirmation = buildDeletionConfirmation(operator.databaseFingerprint, "target-user");
      expect(deleteOperatorAccount(operator, "target-user", confirmation)).toEqual({
        databaseFingerprint: operator.databaseFingerprint,
        internalId: "target-user",
        deleted: true,
        counts: {
          users: 1,
          projects: 1,
          messages: 1,
          templates: 1,
          settings: 1,
          projectState: 1,
        },
      });
      expect(previewAccounts(operator, { id: "target-user" }).candidates).toEqual([]);
      expect(previewAccounts(operator, { id: "control-user" }).candidates).toHaveLength(1);
    } finally {
      operator.close();
    }
  });

  it("rejects wrong confirmation and a missing user without mutation", () => {
    const operator = openOperatorDatabase(filename);
    try {
      expect(() =>
        deleteOperatorAccount(operator, "target-user", "DELETE wrong target-user")
      ).toThrow("confirmation");
      expect(() =>
        deleteOperatorAccount(
          operator,
          "missing-user",
          buildDeletionConfirmation(operator.databaseFingerprint, "missing-user")
        )
      ).toThrow("No user exists");
      expect(previewAccounts(operator, { id: "target-user" }).candidates).toHaveLength(1);
    } finally {
      operator.close();
    }
  });

  it("does not accept a confirmation from a second database containing the same user ID", () => {
    const secondPath = path.join(directory, "second.db");
    seedDatabase(secondPath);
    const first = openOperatorDatabase(filename);
    const second = openOperatorDatabase(secondPath);
    try {
      const firstConfirmation = buildDeletionConfirmation(first.databaseFingerprint, "target-user");
      expect(() => deleteOperatorAccount(second, "target-user", firstConfirmation)).toThrow(
        "confirmation"
      );
      expect(previewAccounts(second, { id: "target-user" }).candidates).toHaveLength(1);
    } finally {
      first.close();
      second.close();
    }
  });

  it("reports a busy writer as an actionable nonzero operation", () => {
    const operator = openOperatorDatabase(filename);
    const locker = new Database(filename);
    locker.pragma("journal_mode = WAL");
    locker.exec("BEGIN IMMEDIATE");
    try {
      expect(() =>
        deleteOperatorAccount(
          operator,
          "target-user",
          buildDeletionConfirmation(operator.databaseFingerprint, "target-user")
        )
      ).toThrow("busy or locked");
    } finally {
      locker.exec("ROLLBACK");
      locker.close();
      operator.close();
    }
  });

  it("fails closed if the canonical path is replaced after preview", () => {
    const operator = openOperatorDatabase(filename);
    const replacement = path.join(directory, "replacement.db");
    seedDatabase(replacement);
    previewAccounts(operator, { id: "target-user" });
    renameSync(filename, path.join(directory, "original.db"));
    renameSync(replacement, filename);

    try {
      expect(() =>
        deleteOperatorAccount(
          operator,
          "target-user",
          buildDeletionConfirmation(operator.databaseFingerprint, "target-user")
        )
      ).toThrow("changed since it was opened");
    } finally {
      operator.close();
    }
  });

  it("fails closed if database contents are replaced in place while preserving the inode", () => {
    const operator = openOperatorDatabase(filename);
    const replacement = path.join(directory, "in-place-replacement.db");
    seedDatabase(replacement);
    const replacementWriter = new Database(replacement);
    replacementWriter
      .prepare("UPDATE users SET name = ? WHERE id = ?")
      .run("Replacement", "control-user");
    replacementWriter.close();
    previewAccounts(operator, { id: "target-user" });
    const originalInode = statSync(filename).ino;
    copyFileSync(replacement, filename);
    expect(statSync(filename).ino).toBe(originalInode);

    try {
      expect(() =>
        deleteOperatorAccount(
          operator,
          "target-user",
          buildDeletionConfirmation(operator.databaseFingerprint, "target-user")
        )
      ).toThrow("contents or path changed");
    } finally {
      operator.close();
    }
  });

  it("fails closed when committed WAL state changes after confirmation", () => {
    const operator = openOperatorDatabase(filename);
    previewAccounts(operator, { id: "target-user" });
    const writer = new Database(filename);
    writer.pragma("journal_mode = WAL");
    writer.prepare("UPDATE users SET name = ? WHERE id = ?").run("Changed", "control-user");

    try {
      expect(() =>
        deleteOperatorAccount(
          operator,
          "target-user",
          buildDeletionConfirmation(operator.databaseFingerprint, "target-user")
        )
      ).toThrow("contents or path changed");
    } finally {
      writer.close();
      operator.close();
    }
  });

  it("rejects missing files, schema mismatches, and disabled deletion pragmas", () => {
    expect(() => openOperatorDatabase(path.join(directory, "missing.db"))).toThrow(
      "does not exist"
    );

    const invalid = path.join(directory, "invalid.db");
    new Database(invalid).close();
    expect(() => openOperatorDatabase(invalid)).toThrow("current StackHatch schema");

    const operator = openOperatorDatabase(filename);
    try {
      operator.db.$client.pragma("foreign_keys = OFF");
      expect(() =>
        deleteOperatorAccount(
          operator,
          "target-user",
          buildDeletionConfirmation(operator.databaseFingerprint, "target-user")
        )
      ).toThrow("foreign_keys must be enabled");
    } finally {
      operator.close();
    }
  });

  it("parses a single exact selector and rejects delete-by-email", () => {
    expect(
      parseManageAccountArgs(["preview", "--database", filename, "--github-id", "123456789"])
    ).toEqual({ command: "preview", database: filename, selector: { githubId: "123456789" } });
    expect(() =>
      parseManageAccountArgs(["delete", "--database", filename, "--email", "target@example.com"])
    ).toThrow("delete requires --id");
    expect(() => parseManageAccountArgs(["preview", "--database", filename, "--wat"])).toThrow(
      "Unknown option"
    );
  });

  it("runs the thin source wrapper against a disposable database", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/manage-account.ts",
        "preview",
        "--database",
        filename,
        "--id",
        "target-user",
      ],
      { cwd: process.cwd(), encoding: "utf8" }
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('"internalId": "target-user"');
    expect(result.stdout).not.toContain("encrypted-secret");
    expect(result.stdout).not.toContain("Private project");
  });
});
