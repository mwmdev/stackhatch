import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { users, projects } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq } from "drizzle-orm";
import { getActualAuthenticatedUser, requireRole } from "@/lib/auth";
import { createId } from "@/lib/id";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.union([z.string().email(), z.literal("")]).optional(),
  githubId: z.string().trim().min(1).max(120).optional(),
  role: z.enum(["admin", "free-user", "paid-user"]),
});

const patchSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["admin", "free-user", "paid-user"]),
});

export async function GET() {
  const user = await getActualAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const roleErr = requireRole(user.role, ["admin"]);
  if (roleErr) return roleErr;

  const db = getDb();
  runMigrations(db);

  const allUsers = db
    .select({
      id: users.id,
      githubId: users.githubId,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .all();

  return NextResponse.json(allUsers.map((row) => ({ ...row, isCurrent: row.id === user.userId })));
}

export async function POST(request: NextRequest) {
  const currentUser = await getActualAuthenticatedUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const roleErr = requireRole(currentUser.role, ["admin"]);
  if (roleErr) return roleErr;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const db = getDb();
  runMigrations(db);
  const id = createId();
  const githubId = parsed.data.githubId || `manual:${id}`;
  const createdAt = Date.now();

  try {
    db.insert(users)
      .values({
        id,
        githubId,
        email: parsed.data.email || null,
        name: parsed.data.name,
        avatarUrl: null,
        role: parsed.data.role,
        createdAt,
      })
      .run();
  } catch {
    return NextResponse.json(
      { error: "A user with that GitHub ID already exists" },
      { status: 409 }
    );
  }

  return NextResponse.json(
    {
      id,
      githubId,
      email: parsed.data.email || null,
      name: parsed.data.name,
      avatarUrl: null,
      role: parsed.data.role,
      createdAt,
      isCurrent: false,
    },
    { status: 201 }
  );
}

export async function PATCH(request: NextRequest) {
  const currentUser = await getActualAuthenticatedUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const roleErr = requireRole(currentUser.role, ["admin"]);
  if (roleErr) return roleErr;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  if (parsed.data.userId === currentUser.userId) {
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 });
  }

  const db = getDb();
  runMigrations(db);

  db.update(users).set({ role: parsed.data.role }).where(eq(users.id, parsed.data.userId)).run();

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const currentUser = await getActualAuthenticatedUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const roleErr = requireRole(currentUser.role, ["admin"]);
  if (roleErr) return roleErr;

  const { searchParams } = new URL(request.url);
  const targetId = searchParams.get("userId");
  if (!targetId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  if (targetId === currentUser.userId) {
    return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
  }

  const db = getDb();
  runMigrations(db);

  // Projects cascade-delete via FK, but delete explicitly for clarity
  db.delete(projects).where(eq(projects.userId, targetId)).run();
  db.delete(users).where(eq(users.id, targetId)).run();

  return NextResponse.json({ success: true });
}
