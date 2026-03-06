import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { diagramTemplates, teams, teamMembers } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { desc, eq, and } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/auth";

const createTemplateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  canvasState: z.string().min(1, "Canvas state is required"), // JSON string
});

// Helper function to check if user is a team member
async function isTeamMember(teamId: string, userId: string): Promise<boolean> {
  const db = getDb();
  const member = db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .get();
  return !!member;
}

// Helper function to check if user is team owner
async function isTeamOwner(teamId: string, userId: string): Promise<boolean> {
  const db = getDb();
  const team = db
    .select()
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.ownerId, userId)))
    .get();
  return !!team;
}

// POST /api/teams/[id]/templates - Save current project canvas as a template
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

    // Check if user is a team member
    if (!(await isTeamMember(teamId, userId))) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = createTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const db = getDb();
    runMigrations(db);

    const now = Date.now();
    const template = {
      id: uuid(),
      teamId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      canvasState: parsed.data.canvasState,
      createdBy: userId,
      createdAt: now,
    };

    db.insert(diagramTemplates).values(template).run();

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error("POST /api/teams/[id]/templates error:", error);
    return NextResponse.json(
      { error: "Failed to create template" },
      { status: 500 }
    );
  }
}

// GET /api/teams/[id]/templates - List team templates
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

    // Check if user is a team member
    if (!(await isTeamMember(teamId, userId))) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    const db = getDb();
    runMigrations(db);

    const templates = db
      .select({
        id: diagramTemplates.id,
        name: diagramTemplates.name,
        description: diagramTemplates.description,
        canvasState: diagramTemplates.canvasState,
        createdBy: diagramTemplates.createdBy,
        createdAt: diagramTemplates.createdAt,
      })
      .from(diagramTemplates)
      .where(eq(diagramTemplates.teamId, teamId))
      .orderBy(desc(diagramTemplates.createdAt))
      .all();

    return NextResponse.json(templates);
  } catch (error) {
    console.error("GET /api/teams/[id]/templates error:", error);
    return NextResponse.json(
      { error: "Failed to fetch templates" },
      { status: 500 }
    );
  }
}