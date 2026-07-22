import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type AppDatabase } from "@/db";
import { runMigrations } from "@/db/migrate";
import { messages, projects, templates, userProjectState, userSettings, users } from "@/db/schema";
import { deleteAccountById } from "@/lib/account-deletion";

let db: AppDatabase;

function addUserGraph(userId: string, githubId: string, suffix: string) {
  db.insert(users)
    .values({ id: userId, githubId, email: `${suffix}@example.com`, createdAt: 1 })
    .run();
  db.insert(userSettings)
    .values({ userId, anthropicApiKey: `secret-${suffix}`, createdAt: 1, updatedAt: 1 })
    .run();
  db.insert(projects)
    .values({
      id: `project-${suffix}`,
      name: `Project ${suffix}`,
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
      content: `Content ${suffix}`,
      createdAt: 1,
    })
    .run();
  db.insert(templates)
    .values({
      id: `template-${suffix}`,
      userId,
      name: `Template ${suffix}`,
      canvasState: `Canvas ${suffix}`,
      createdAt: 1,
    })
    .run();
  db.insert(userProjectState)
    .values({ userId, lastOpenedProjectId: `project-${suffix}` })
    .run();
}

beforeEach(() => {
  db = createTestDb();
  runMigrations(db);
  addUserGraph("target-user", "target-github", "target");
  addUserGraph("control-user", "control-github", "control");
});

afterEach(() => db.$client.close());

describe("deleteAccountById", () => {
  it("deletes only the parent and lets declared cascades remove the full ownership graph", () => {
    const controlBefore = {
      user: db.select().from(users).where(eq(users.id, "control-user")).get(),
      project: db.select().from(projects).where(eq(projects.userId, "control-user")).get(),
      message: db.select().from(messages).where(eq(messages.id, "message-control")).get(),
      template: db.select().from(templates).where(eq(templates.userId, "control-user")).get(),
      settings: db.select().from(userSettings).where(eq(userSettings.userId, "control-user")).get(),
    };

    expect(deleteAccountById(db, "target-user")).toEqual({
      userId: "target-user",
      deleted: true,
      counts: { users: 1, projects: 1, messages: 1, templates: 1, settings: 1, projectState: 1 },
    });

    expect(db.select().from(users).where(eq(users.id, "target-user")).get()).toBeUndefined();
    expect(db.select().from(projects).where(eq(projects.userId, "target-user")).all()).toEqual([]);
    expect(
      db.select().from(messages).where(eq(messages.projectId, "project-target")).all()
    ).toEqual([]);
    expect(db.select().from(templates).where(eq(templates.userId, "target-user")).all()).toEqual(
      []
    );
    expect(
      db.select().from(userSettings).where(eq(userSettings.userId, "target-user")).all()
    ).toEqual([]);
    expect(
      db.select().from(userProjectState).where(eq(userProjectState.userId, "target-user")).all()
    ).toEqual([]);
    expect({
      user: db.select().from(users).where(eq(users.id, "control-user")).get(),
      project: db.select().from(projects).where(eq(projects.userId, "control-user")).get(),
      message: db.select().from(messages).where(eq(messages.id, "message-control")).get(),
      template: db.select().from(templates).where(eq(templates.userId, "control-user")).get(),
      settings: db.select().from(userSettings).where(eq(userSettings.userId, "control-user")).get(),
    }).toEqual(controlBefore);
    expect(db.$client.pragma("foreign_key_check")).toEqual([]);
  });

  it("is a safe no-op when the account is already absent", () => {
    deleteAccountById(db, "target-user");
    expect(deleteAccountById(db, "target-user")).toEqual({
      userId: "target-user",
      deleted: false,
      counts: { users: 0, projects: 0, messages: 0, templates: 0, settings: 0, projectState: 0 },
    });
  });

  it.each(["foreign_keys", "secure_delete"] as const)(
    "fails closed when %s is disabled",
    (pragma) => {
      db.$client.pragma(`${pragma} = OFF`);
      expect(() => deleteAccountById(db, "target-user")).toThrow(
        `${pragma} must be enabled for account deletion`
      );
      expect(db.select().from(users).where(eq(users.id, "target-user")).get()).toBeDefined();
    }
  );

  it("rolls the complete operation back when the parent delete fails", () => {
    db.$client.exec(`
      CREATE TRIGGER reject_account_delete
      BEFORE DELETE ON users
      WHEN OLD.id = 'target-user'
      BEGIN
        SELECT RAISE(ABORT, 'delete rejected');
      END;
    `);

    expect(() => deleteAccountById(db, "target-user")).toThrow("delete rejected");
    expect(db.select().from(users).where(eq(users.id, "target-user")).get()).toBeDefined();
    expect(db.select().from(projects).where(eq(projects.userId, "target-user")).all()).toHaveLength(
      1
    );
    expect(
      db.select().from(messages).where(eq(messages.projectId, "project-target")).all()
    ).toHaveLength(1);
  });
});
