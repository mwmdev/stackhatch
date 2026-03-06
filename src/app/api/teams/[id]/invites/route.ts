import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { teams, teamMembers, teamInvites, users } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { v4 as uuid } from "uuid";
import { randomBytes } from "crypto";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/auth";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const SEAT_LIMITS: Record<string, number> = {
  team5: 5,
  team15: 15,
};

const inviteSchema = z.object({
  email: z.string().email("Valid email is required"),
});

// POST /api/teams/[id]/invites - Send invitation
export async function POST(
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

    // Verify team exists and user is owner
    const team = db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .get();

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    if (team.ownerId !== userId) {
      return NextResponse.json(
        { error: "Only team owner can send invites" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { email } = parsed.data;

    // Check seat limits
    const memberCount = db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId))
      .all().length;

    const pendingCount = db
      .select()
      .from(teamInvites)
      .where(
        and(eq(teamInvites.teamId, teamId), eq(teamInvites.status, "pending"))
      )
      .all().length;

    const seatLimit = SEAT_LIMITS[team.plan] ?? 5;
    if (memberCount + pendingCount >= seatLimit) {
      return NextResponse.json(
        {
          error: `Team is at capacity (${seatLimit} seats). Upgrade to add more members.`,
          limit: seatLimit,
          current: memberCount,
          pending: pendingCount,
        },
        { status: 409 }
      );
    }

    // Check if email is already a member
    const existingUser = db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .get();

    if (existingUser) {
      const existingMember = db
        .select()
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, teamId),
            eq(teamMembers.userId, existingUser.id)
          )
        )
        .get();

      if (existingMember) {
        return NextResponse.json(
          { error: "User is already a team member" },
          { status: 409 }
        );
      }
    }

    // Check if there's already a pending invite for this email
    const existingInvite = db
      .select()
      .from(teamInvites)
      .where(
        and(
          eq(teamInvites.teamId, teamId),
          eq(teamInvites.email, email),
          eq(teamInvites.status, "pending")
        )
      )
      .get();

    if (existingInvite) {
      return NextResponse.json(
        { error: "An invite is already pending for this email" },
        { status: 409 }
      );
    }

    const now = Date.now();
    const token = randomBytes(32).toString("hex");

    const invite = {
      id: uuid(),
      teamId,
      email,
      invitedBy: userId,
      token,
      expiresAt: now + SEVEN_DAYS_MS,
      status: "pending" as const,
    };

    db.insert(teamInvites).values(invite).run();

    // In production, send email here with nodemailer/Resend
    // For now, return the invite with token for dev/testing
    return NextResponse.json(
      {
        id: invite.id,
        email: invite.email,
        token: invite.token,
        expiresAt: invite.expiresAt,
        status: invite.status,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/teams/[id]/invites error:", error);
    return NextResponse.json(
      { error: "Failed to create invite" },
      { status: 500 }
    );
  }
}

// GET /api/teams/[id]/invites - List pending invites
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

    // Verify team exists and user is owner
    const team = db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .get();

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    if (team.ownerId !== userId) {
      return NextResponse.json(
        { error: "Only team owner can view invites" },
        { status: 403 }
      );
    }

    const invites = db
      .select({
        id: teamInvites.id,
        email: teamInvites.email,
        status: teamInvites.status,
        expiresAt: teamInvites.expiresAt,
      })
      .from(teamInvites)
      .where(
        and(eq(teamInvites.teamId, teamId), eq(teamInvites.status, "pending"))
      )
      .all();

    return NextResponse.json(invites);
  } catch (error) {
    console.error("GET /api/teams/[id]/invites error:", error);
    return NextResponse.json(
      { error: "Failed to fetch invites" },
      { status: 500 }
    );
  }
}
