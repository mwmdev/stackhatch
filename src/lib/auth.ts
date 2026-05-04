import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { runMigrations } from "@/db/migrate";
import { users, type UserRole } from "@/db/schema";
import { auth } from "@/lib/auth-config";

const DEV_USER_ID = "dev-user";
const VALID_ROLES: UserRole[] = ["admin", "free-user", "paid-user"];

export interface AuthenticatedUser {
  userId: string;
  role: UserRole;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

function isValidRole(role: string | undefined): role is UserRole {
  return !!role && VALID_ROLES.includes(role as UserRole);
}

function isDevAuthEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.STACKHATCH_DEV_AUTH === "1";
}

function getDevRole(): UserRole {
  const role = process.env.STACKHATCH_DEV_ROLE;
  return isValidRole(role) ? role : "admin";
}

function getDevUser(): AuthenticatedUser {
  const db = getDb();
  runMigrations(db);

  const role = getDevRole();
  const now = Date.now();
  const existing = db.select().from(users).where(eq(users.id, DEV_USER_ID)).get();

  if (existing) {
    db.update(users)
      .set({
        role,
        name: "Dev User",
        email: "dev@stackhatch.local",
        avatarUrl: null,
      })
      .where(eq(users.id, DEV_USER_ID))
      .run();
  } else {
    db.insert(users)
      .values({
        id: DEV_USER_ID,
        githubId: DEV_USER_ID,
        email: "dev@stackhatch.local",
        name: "Dev User",
        avatarUrl: null,
        role,
        createdAt: now,
      })
      .run();
  }

  return {
    userId: DEV_USER_ID,
    role,
    name: "Dev User",
    email: "dev@stackhatch.local",
    image: null,
  };
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  if (isDevAuthEnabled()) {
    return getDevUser();
  }

  const session = await auth();
  const sessionUser = session?.user;
  if (!sessionUser?.userId) {
    return null;
  }

  const db = getDb();
  runMigrations(db);
  const user = db.select().from(users).where(eq(users.id, sessionUser.userId)).get();

  if (!user) {
    return null;
  }

  return {
    userId: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    image: user.avatarUrl,
  };
}

export async function getAuthenticatedUserId(): Promise<string | null> {
  const user = await getAuthenticatedUser();
  return user?.userId ?? null;
}

export function requireRole(userRole: UserRole, allowed: UserRole[]): Response | null {
  if (allowed.includes(userRole)) return null;
  return new Response(JSON.stringify({ error: "Upgrade required", upgradeRequired: true }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}
