import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db";
import { projects } from "@/db/schema";

export function getAccessibleProject(db: AppDatabase, projectId: string, userId: string) {
  return db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .get();
}

export function hasAccessibleProject(db: AppDatabase, projectId: string, userId: string) {
  return Boolean(
    db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .get()
  );
}

export function prepareAccessibleProjectCheck(
  db: AppDatabase,
  projectId: string,
  userId: string
): () => boolean {
  const statement = db.$client.prepare(
    "SELECT 1 FROM projects WHERE id = ? AND user_id = ? LIMIT 1"
  );
  return () => Boolean(statement.get(projectId, userId));
}

export function getOwnedProject(db: AppDatabase, projectId: string, userId: string) {
  return db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .get();
}
