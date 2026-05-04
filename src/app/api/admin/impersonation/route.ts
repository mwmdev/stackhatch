import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { runMigrations } from "@/db/migrate";
import { users } from "@/db/schema";
import { getActualAuthenticatedUser, IMPERSONATION_COOKIE, requireRole } from "@/lib/auth";
import { z } from "zod";

const impersonationSchema = z.object({
  userId: z.string().min(1),
});

function clearImpersonationCookie(response: NextResponse) {
  response.cookies.set(IMPERSONATION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
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

  const parsed = impersonationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  if (parsed.data.userId === currentUser.userId) {
    return NextResponse.json({ error: "Cannot impersonate yourself" }, { status: 400 });
  }

  const db = getDb();
  runMigrations(db);
  const target = db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, parsed.data.userId))
    .get();

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const response = NextResponse.json({ success: true, user: target });
  response.cookies.set(IMPERSONATION_COOKIE, target.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 4,
  });
  return response;
}

export async function DELETE() {
  const currentUser = await getActualAuthenticatedUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const roleErr = requireRole(currentUser.role, ["admin"]);
  if (roleErr) return roleErr;

  const response = NextResponse.json({ success: true });
  clearImpersonationCookie(response);
  return response;
}
