import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { diagramTemplates, teams, teamMembers } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq, and } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/auth";

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

// DELETE /api/teams/[id]/templates/[templateId] - Delete template (creator or team owner only)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; templateId: string }> }
) {
  try {
    const { id: teamId, templateId } = await params;
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Check if user is a team member
    if (!(await isTeamMember(teamId, userId))) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const db = getDb();
    runMigrations(db);

    // Get the template to check ownership
    const template = db
      .select()
      .from(diagramTemplates)
      .where(and(eq(diagramTemplates.id, templateId), eq(diagramTemplates.teamId, teamId)))
      .get();

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // Check if user is either the template creator or team owner
    const isCreator = template.createdBy === userId;
    const isOwner = await isTeamOwner(teamId, userId);

    if (!isCreator && !isOwner) {
      return NextResponse.json(
        { error: "Access denied. Only template creator or team owner can delete." },
        { status: 403 }
      );
    }

    // Delete the template
    db.delete(diagramTemplates)
      .where(and(eq(diagramTemplates.id, templateId), eq(diagramTemplates.teamId, teamId)))
      .run();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/teams/[id]/templates/[templateId] error:", error);
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
  }
}
