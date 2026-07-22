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
    const existingByGithubId = tx
      .select()
      .from(users)
      .where(eq(users.githubId, input.githubId))
      .get();
    // Development auth has used the same fixed internal ID across older GitHub-ID aliases.
    // Reuse that trusted explicit ID instead of attempting a colliding insert.
    const existing =
      existingByGithubId ??
      (input.id ? tx.select().from(users).where(eq(users.id, input.id)).get() : undefined);

    if (existing) {
      const merged = {
        ...existing,
        email: input.email ?? existing.email,
        name: input.name ?? existing.name,
        avatarUrl: input.avatarUrl ?? existing.avatarUrl,
      };
      if (
        merged.email !== existing.email ||
        merged.name !== existing.name ||
        merged.avatarUrl !== existing.avatarUrl
      ) {
        tx.update(users)
          .set({ email: merged.email, name: merged.name, avatarUrl: merged.avatarUrl })
          .where(eq(users.id, existing.id))
          .run();
      }

      tx.insert(userSettings)
        .values({ userId: existing.id, createdAt: now, updatedAt: now })
        .onConflictDoNothing()
        .run();

      return merged;
    }

    const id = input.id ?? createId();
    const created = {
      id,
      githubId: input.githubId,
      email: input.email,
      name: input.name,
      avatarUrl: input.avatarUrl,
      createdAt: now,
    };
    tx.insert(users).values(created).run();
    tx.insert(userSettings).values({ userId: id, createdAt: now, updatedAt: now }).run();

    return created;
  });
}
