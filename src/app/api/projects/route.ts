import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { projects, teamMembers, teams } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { z } from "zod";
import { desc, eq, and, or, inArray, count } from "drizzle-orm";
import { getAuthenticatedUser, getAuthenticatedUserId } from "@/lib/auth";
import { PLAN_CONFIG } from "@/lib/stripe";
import { createId } from "@/lib/id";

const createProjectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  repoUrl: z.string().optional(),
  canvasState: z.string().optional(), // JSON string for template-based projects
  teamId: z.string().optional(), // nullable - assign project to a team
});

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const userId = user.userId;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = createProjectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const db = getDb();
    runMigrations(db);

    // Enforce project limit for free users
    if (user.role === "free-user") {
      const [{ total }] = db
        .select({ total: count() })
        .from(projects)
        .where(eq(projects.userId, userId))
        .all();
      const limit = PLAN_CONFIG.free.features.projects;
      if (total >= limit) {
        return NextResponse.json(
          {
            error: `Free plan is limited to ${limit} projects`,
            upgradeRequired: true,
            limit,
            used: total,
          },
          { status: 403 }
        );
      }
    }

    // If teamId is provided, verify user is a team member
    if (parsed.data.teamId) {
      const membership = db
        .select()
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, parsed.data.teamId), eq(teamMembers.userId, userId)))
        .get();

      if (!membership) {
        return NextResponse.json({ error: "You are not a member of this team" }, { status: 403 });
      }
    }

    const now = Date.now();
    const project = {
      id: createId(),
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      repoUrl: parsed.data.repoUrl ?? null,
      canvasState: parsed.data.canvasState ?? null,
      userId,
      teamId: parsed.data.teamId ?? null,
      createdAt: now,
      updatedAt: now,
    };

    db.insert(projects).values(project).run();

    return NextResponse.json(project, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const db = getDb();
    runMigrations(db);

    // Get team IDs the user belongs to
    const userTeams = db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId))
      .all();

    const teamIds = userTeams.map((t) => t.teamId);

    // Fetch personal projects + team projects in one query
    const conditions = [eq(projects.userId, userId)];
    if (teamIds.length > 0) {
      conditions.push(inArray(projects.teamId, teamIds));
    }

    const userProjects = db
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        teamId: projects.teamId,
        teamName: teams.name,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .leftJoin(teams, eq(projects.teamId, teams.id))
      .where(or(...conditions))
      .orderBy(desc(projects.updatedAt))
      .all();

    return NextResponse.json(userProjects);
  } catch (error) {
    console.error("GET /api/projects error:", error);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}
