import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { runMigrations } from "@/db/migrate";
import { getAuthenticatedUser } from "@/lib/auth";
import { getAccessibleProject } from "@/lib/project-access";
import { recordProjectOpen } from "@/lib/project-resume";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const db = getDb();
  runMigrations(db);

  if (user.impersonatedBy) {
    if (!getAccessibleProject(db, id, user.userId)) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  }

  if (!recordProjectOpen(db, user.userId, id)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
