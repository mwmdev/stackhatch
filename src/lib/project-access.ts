import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db";
import { projects, teamMembers } from "@/db/schema";

export function getAccessibleProject(db: AppDatabase, projectId: string, userId: string) {
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();

  if (!project) return null;
  if (project.userId === userId) return project;

  if (!project.teamId) return null;
  const membership = db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, project.teamId), eq(teamMembers.userId, userId)))
    .get();

  return membership ? project : null;
}

export function getOwnedProject(db: AppDatabase, projectId: string, userId: string) {
  return db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .get();
}
