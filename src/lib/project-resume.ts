import { and, desc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db";
import { projects, userProjectState } from "@/db/schema";
import { getAccessibleProject } from "@/lib/project-access";

export function clearStaleProjectResume(
  db: AppDatabase,
  userId: string,
  observedProjectId: string
) {
  const result = db
    .update(userProjectState)
    .set({ lastOpenedProjectId: null })
    .where(
      and(
        eq(userProjectState.userId, userId),
        eq(userProjectState.lastOpenedProjectId, observedProjectId)
      )
    )
    .run();

  return result.changes > 0;
}

export function resolveProjectResume(db: AppDatabase, userId: string) {
  const state = db
    .select({ lastOpenedProjectId: userProjectState.lastOpenedProjectId })
    .from(userProjectState)
    .where(eq(userProjectState.userId, userId))
    .get();

  if (state?.lastOpenedProjectId) {
    const rememberedProject = getAccessibleProject(db, state.lastOpenedProjectId, userId);

    if (rememberedProject) return rememberedProject;

    clearStaleProjectResume(db, userId, state.lastOpenedProjectId);
  }

  return db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.updatedAt), desc(projects.createdAt), desc(projects.id))
    .get();
}

export function recordProjectOpen(db: AppDatabase, userId: string, projectId: string) {
  const result = db.$client
    .prepare(
      `INSERT INTO user_project_state (user_id, last_opened_project_id)
       SELECT user_id, id
       FROM projects
       WHERE user_id = ? AND id = ?
       ON CONFLICT(user_id) DO UPDATE SET
         last_opened_project_id = excluded.last_opened_project_id
       WHERE user_project_state.last_opened_project_id IS NOT excluded.last_opened_project_id`
    )
    .run(userId, projectId);

  return result.changes > 0;
}
