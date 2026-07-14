import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { teams, teamMembers, users } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq, and } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/auth";
import { z } from "zod";

const renameTeamSchema = z.object({
  name: z.string().min(1).max(100),
});

// GET /api/teams/[id] - Get team details with members
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: teamId } = await params;
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const db = getDb();
    runMigrations(db);

    // Verify user is a member
    const membership = db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
      .get();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const team = db.select().from(teams).where(eq(teams.id, teamId)).get();

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
      id: team.id,
      name: team.name,
      ownerId: team.ownerId,
      createdAt: team.createdAt,
      members,
      isOwner: team.ownerId === userId,
    });
  } catch (error) {
    console.error("GET /api/teams/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch team" }, { status: 500 });
  }
}

// PATCH /api/teams/[id] - Rename team (owner only)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: teamId } = await params;
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = renameTeamSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const db = getDb();
    runMigrations(db);

    const team = db.select().from(teams).where(eq(teams.id, teamId)).get();

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    if (team.ownerId !== userId) {
      return NextResponse.json(
        { error: "Only the team owner can rename the team" },
        { status: 403 }
      );
    }

    db.update(teams).set({ name: parsed.data.name }).where(eq(teams.id, teamId)).run();

    return NextResponse.json({ success: true, name: parsed.data.name });
  } catch (error) {
    console.error("PATCH /api/teams/[id] error:", error);
    return NextResponse.json({ error: "Failed to rename team" }, { status: 500 });
  }
}
