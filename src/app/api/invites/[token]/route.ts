import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { teams, teamMembers, teamInvites, users } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq, and } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/auth";

const SEAT_LIMITS: Record<string, number> = {
  team5: 5,
  team15: 15,
};

// GET /api/invites/[token] - Get invite details (public, no auth required)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const db = getDb();
    runMigrations(db);

    const invite = db.select().from(teamInvites).where(eq(teamInvites.token, token)).get();

    if (!invite) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    if (invite.status !== "pending") {
      return NextResponse.json(
        { error: "Invite has already been used", status: invite.status },
        { status: 410 }
      );
    }

    if (Date.now() > invite.expiresAt) {
      return NextResponse.json({ error: "Invite has expired" }, { status: 410 });
    }

    // Get team info
    const team = db
      .select({ id: teams.id, name: teams.name, plan: teams.plan })
      .from(teams)
      .where(eq(teams.id, invite.teamId))
      .get();

    // Get inviter info
    const inviter = db
      .select({ name: users.name, avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.id, invite.invitedBy))
      .get();

    return NextResponse.json({
      email: invite.email,
      team: team ?? null,
      invitedBy: inviter ?? null,
      expiresAt: invite.expiresAt,
    });
  } catch (error) {
    console.error("GET /api/invites/[token] error:", error);
    return NextResponse.json({ error: "Failed to fetch invite" }, { status: 500 });
  }
}

// POST /api/invites/[token] - Accept invite
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required. Please sign in first." },
        { status: 401 }
      );
    }

    const db = getDb();
    runMigrations(db);

    const invite = db.select().from(teamInvites).where(eq(teamInvites.token, token)).get();

    if (!invite) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    if (invite.status !== "pending") {
      return NextResponse.json({ error: "Invite has already been used" }, { status: 410 });
    }

    if (Date.now() > invite.expiresAt) {
      return NextResponse.json({ error: "Invite has expired" }, { status: 410 });
    }

    // Check if user is already a member
    const existingMember = db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, invite.teamId), eq(teamMembers.userId, userId)))
      .get();

    if (existingMember) {
      // Mark invite as accepted since user is already in the team
      db.update(teamInvites).set({ status: "accepted" }).where(eq(teamInvites.id, invite.id)).run();

      return NextResponse.json({ success: true, alreadyMember: true });
    }

    // Verify seat limit
    const team = db.select().from(teams).where(eq(teams.id, invite.teamId)).get();

    if (!team) {
      return NextResponse.json({ error: "Team no longer exists" }, { status: 404 });
    }

    const memberCount = db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.teamId, invite.teamId))
      .all().length;

    const seatLimit = SEAT_LIMITS[team.plan] ?? 5;
    if (memberCount >= seatLimit) {
      return NextResponse.json({ error: "Team is at capacity" }, { status: 409 });
    }

    // Add user to team and mark invite as accepted
    db.insert(teamMembers)
      .values({
        teamId: invite.teamId,
        userId,
        role: "member",
        joinedAt: Date.now(),
      })
      .run();

    db.update(teamInvites).set({ status: "accepted" }).where(eq(teamInvites.id, invite.id)).run();

    return NextResponse.json({
      success: true,
      teamId: invite.teamId,
      teamName: team.name,
    });
  } catch (error) {
    console.error("POST /api/invites/[token] error:", error);
    return NextResponse.json({ error: "Failed to accept invite" }, { status: 500 });
  }
}
