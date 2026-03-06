import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/auth";

const createProjectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  repoUrl: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const parsed = createProjectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const db = getDb();
    runMigrations(db);

    const now = Date.now();
    const project = {
      id: uuid(),
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      repoUrl: parsed.data.repoUrl ?? null,
      canvasState: null,
      userId,
      createdAt: now,
      updatedAt: now,
    };

    db.insert(projects).values(project).run();

    return NextResponse.json(project, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const db = getDb();
    runMigrations(db);

    const userProjects = db
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.updatedAt))
      .all();

    return NextResponse.json(userProjects);
  } catch (error) {
    console.error("GET /api/projects error:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 },
    );
  }
}
