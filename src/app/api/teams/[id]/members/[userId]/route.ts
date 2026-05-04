import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { teams, teamMembers } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq, and } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/auth";

// DELETE /api/teams/[id]/members/[userId] - Remove a team member
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const { id: teamId, userId: targetUserId } = await params;
    const authenticatedUserId = await getAuthenticatedUserId();
    if (!authenticatedUserId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const db = getDb();
    runMigrations(db);

    // Verify team exists
    const team = db.select().from(teams).where(eq(teams.id, teamId)).get();

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Team owner cannot be removed
    if (targetUserId === team.ownerId) {
      return NextResponse.json({ error: "Team owner cannot be removed" }, { status: 403 });
    }

    // Only team owner can remove members
    if (team.ownerId !== authenticatedUserId) {
      return NextResponse.json({ error: "Only team owner can remove members" }, { status: 403 });
    }

    // Verify target is actually a member
    const member = db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId)))
      .get();

    if (!member) {
      return NextResponse.json({ error: "User is not a team member" }, { status: 404 });
    }

    db.delete(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId)))
      .run();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/teams/[id]/members/[userId] error:", error);
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }
}
