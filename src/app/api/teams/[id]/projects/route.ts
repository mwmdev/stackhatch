import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { projects, teamMembers } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq, and, desc } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/auth";

// GET /api/teams/[id]/projects - List team projects
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const { id: teamId } = await params;
    const db = getDb();
    runMigrations(db);

    // Verify user is a team member
    const membership = db
      .select()
      .from(teamMembers)
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)),
      )
      .get();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const teamProjects = db
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        teamId: projects.teamId,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(eq(projects.teamId, teamId))
      .orderBy(desc(projects.updatedAt))
      .all();

    return NextResponse.json(teamProjects);
  } catch (error) {
    console.error("GET /api/teams/[id]/projects error:", error);
    return NextResponse.json(
      { error: "Failed to fetch team projects" },
      { status: 500 },
    );
  }
}
