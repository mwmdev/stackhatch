import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { teams, teamMembers } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { createId } from "@/lib/id";

const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

// POST /api/teams - Create a team and its owner membership
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = createTeamSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const db = getDb();
    runMigrations(db);
    const now = Date.now();
    const team = {
      id: createId(),
      name: parsed.data.name,
      ownerId: user.userId,
      createdAt: now,
    };

    db.transaction((tx) => {
      tx.insert(teams).values(team).run();
      tx.insert(teamMembers)
        .values({
          teamId: team.id,
          userId: user.userId,
          role: "owner",
          joinedAt: now,
        })
        .run();
    });

    return NextResponse.json(team, { status: 201 });
  } catch (error) {
    console.error("POST /api/teams error:", error);
    return NextResponse.json({ error: "Failed to create team" }, { status: 500 });
  }
}

// GET /api/teams - List user's teams
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const db = getDb();
    runMigrations(db);

    const userTeams = db
      .select({
        id: teams.id,
        name: teams.name,
        ownerId: teams.ownerId,
        createdAt: teams.createdAt,
      })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(eq(teamMembers.userId, user.userId))
      .all();

    return NextResponse.json(userTeams);
  } catch (error) {
    console.error("GET /api/teams error:", error);
    return NextResponse.json({ error: "Failed to fetch teams" }, { status: 500 });
  }
}
