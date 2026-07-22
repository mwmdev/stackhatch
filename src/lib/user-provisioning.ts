import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db";
import { userSettings, users } from "@/db/schema";
import { createId } from "@/lib/id";

export interface ProvisionUserInput {
  id?: string;
  githubId: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  now?: number;
}

/**
 * Provision one application identity and its settings as a single database unit.
 * Repeat logins refresh profile fields while retaining all existing user settings.
 */
export function provisionUser(db: AppDatabase, input: ProvisionUserInput) {
  const now = input.now ?? Date.now();

  return db.transaction((tx) => {
    const existing = tx.select().from(users).where(eq(users.githubId, input.githubId)).get();

    if (existing) {
      tx.update(users)
        .set({
          email: input.email ?? existing.email,
          name: input.name ?? existing.name,
          avatarUrl: input.avatarUrl ?? existing.avatarUrl,
        })
        .where(eq(users.id, existing.id))
        .run();

      tx.insert(userSettings)
        .values({ userId: existing.id, createdAt: now, updatedAt: now })
        .onConflictDoNothing()
        .run();

      return tx.select().from(users).where(eq(users.id, existing.id)).get()!;
    }

    const id = input.id ?? createId();
    tx.insert(users)
      .values({
        id,
        githubId: input.githubId,
        email: input.email,
        name: input.name,
        avatarUrl: input.avatarUrl,
        createdAt: now,
      })
      .run();
    tx.insert(userSettings).values({ userId: id, createdAt: now, updatedAt: now }).run();

    return tx.select().from(users).where(eq(users.id, id)).get()!;
  });
}
