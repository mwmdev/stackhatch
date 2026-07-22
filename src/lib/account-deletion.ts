import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db";
import { users } from "@/db/schema";

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
    const counts = db.$client
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM users WHERE id = ?) AS users,
           (SELECT COUNT(*) FROM projects WHERE user_id = ?) AS projects,
           (SELECT COUNT(*) FROM messages m
              INNER JOIN projects p ON p.id = m.project_id
              WHERE p.user_id = ?) AS messages,
           (SELECT COUNT(*) FROM templates WHERE user_id = ?) AS templates,
           (SELECT COUNT(*) FROM user_settings WHERE user_id = ?) AS settings,
           (SELECT COUNT(*) FROM user_project_state WHERE user_id = ?) AS projectState`
      )
      .get(userId, userId, userId, userId, userId, userId) as AccountDeletionCounts;

    const deletion = tx.delete(users).where(eq(users.id, userId)).run();
    return { userId, deleted: deletion.changes === 1, counts };
  });
}
