import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import type { AppDatabase } from "@/db";
import { runMigrations } from "@/db/migrate";
import { getAuthenticatedUser } from "@/lib/auth";
import { hasAccessibleProject } from "@/lib/project-access";

// Keep SQL resume state separate from the browser-vault facade while this
// account-backed endpoint remains available.
function recordLegacyProjectOpen(db: AppDatabase, userId: string, projectId: string) {
  return (
    db.$client
      .prepare(
        `INSERT INTO user_project_state (user_id, last_opened_project_id)
         SELECT user_id, id
         FROM projects
         WHERE user_id = ? AND id = ?
         ON CONFLICT(user_id) DO UPDATE SET
           last_opened_project_id = excluded.last_opened_project_id
         WHERE user_project_state.last_opened_project_id IS NOT excluded.last_opened_project_id`
      )
      .run(userId, projectId).changes > 0
  );
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const db = getDb();
  runMigrations(db);

  if (!recordLegacyProjectOpen(db, user.userId, id) && !hasAccessibleProject(db, id, user.userId)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
