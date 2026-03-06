import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { teams, teamMembers, users } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq, and } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/auth";

// GET /api/teams/[id] - Get team details with members
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const teamId = params.id;
    const db = getDb();
    runMigrations(db);

    // Verify user is a member
    const membership = db
      .select()
      .from(teamMembers)
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId))
      )
      .get();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const team = db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .get();

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Get members with user details
    const members = db
      .select({
        userId: teamMembers.userId,
        role: teamMembers.role,
        joinedAt: teamMembers.joinedAt,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(eq(teamMembers.teamId, teamId))
      .all();

    return NextResponse.json({
      ...team,
      members,
      isOwner: team.ownerId === userId,
    });
  } catch (error) {
    console.error("GET /api/teams/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch team" },
      { status: 500 }
    );
  }
}
