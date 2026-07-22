import { count, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db";
import { messages, projects, templates, userProjectState, userSettings, users } from "@/db/schema";

export interface AccountDeletionCounts {
  users: number;
  projects: number;
  messages: number;
  templates: number;
  settings: number;
  projectState: number;
}

export interface AccountDeletionResult {
  userId: string;
  deleted: boolean;
  counts: AccountDeletionCounts;
}

function requireDeletionPragmas(db: AppDatabase) {
  for (const pragma of ["foreign_keys", "secure_delete"] as const) {
    const enabled = db.$client.pragma(pragma, { simple: true });
    if (enabled !== 1) {
      throw new Error(`${pragma} must be enabled for account deletion`);
    }
  }
}

/**
 * Server-side account deletion boundary shared by browser and operator flows.
 * It intentionally deletes only users.id and relies on the declared ownership cascades.
 */
export function deleteAccountById(db: AppDatabase, userId: string): AccountDeletionResult {
  requireDeletionPragmas(db);

  return db.transaction((tx) => {
    const counts: AccountDeletionCounts = {
      users: tx.select({ value: count() }).from(users).where(eq(users.id, userId)).get()!.value,
      projects: tx
        .select({ value: count() })
        .from(projects)
        .where(eq(projects.userId, userId))
        .get()!.value,
      messages: tx
        .select({ value: count() })
        .from(messages)
        .innerJoin(projects, eq(messages.projectId, projects.id))
        .where(eq(projects.userId, userId))
        .get()!.value,
      templates: tx
        .select({ value: count() })
        .from(templates)
        .where(eq(templates.userId, userId))
        .get()!.value,
      settings: tx
        .select({ value: count() })
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .get()!.value,
      projectState: tx
        .select({ value: count() })
        .from(userProjectState)
        .where(eq(userProjectState.userId, userId))
        .get()!.value,
    };

    const deletion = tx.delete(users).where(eq(users.id, userId)).run();
    return { userId, deleted: deletion.changes === 1, counts };
  });
}
