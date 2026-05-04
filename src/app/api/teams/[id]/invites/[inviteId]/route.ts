import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { teams, teamInvites } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq, and } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/auth";

// DELETE /api/teams/[id]/invites/[inviteId] - Revoke an invite
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  try {
    const { id: teamId, inviteId } = await params;
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const db = getDb();
    runMigrations(db);

    // Verify team exists and user is owner
    const team = db.select().from(teams).where(eq(teams.id, teamId)).get();

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    if (team.ownerId !== userId) {
      return NextResponse.json({ error: "Only team owner can revoke invites" }, { status: 403 });
    }

    const invite = db
      .select()
      .from(teamInvites)
      .where(and(eq(teamInvites.id, inviteId), eq(teamInvites.teamId, teamId)))
      .get();

    if (!invite) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    db.delete(teamInvites).where(eq(teamInvites.id, inviteId)).run();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/teams/[id]/invites/[inviteId] error:", error);
    return NextResponse.json({ error: "Failed to revoke invite" }, { status: 500 });
  }
}
