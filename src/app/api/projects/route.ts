import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getAuthenticatedUser, getAuthenticatedUserId } from "@/lib/auth";
import { createId } from "@/lib/id";

const createProjectSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
    repoUrl: z.string().optional(),
    canvasState: z.string().optional(), // JSON string for template-based projects
  })
  .strict();

function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeRepoUrl(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined") return null;
  return trimmed;
}

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

    const now = Date.now();
    const project = {
      id: createId(),
      name: parsed.data.name,
      description: normalizeOptionalText(parsed.data.description),
      repoUrl: normalizeRepoUrl(parsed.data.repoUrl),
      canvasState: parsed.data.canvasState ?? null,
      userId,
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
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}
