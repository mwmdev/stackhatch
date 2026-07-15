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

export function getOwnedProject(db: AppDatabase, projectId: string, userId: string) {
  return db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .get();
}
