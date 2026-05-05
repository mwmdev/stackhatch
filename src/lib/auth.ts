import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { runMigrations } from "@/db/migrate";
import { users, type UserRole } from "@/db/schema";
import { auth } from "@/lib/auth-config";
import { normalizeUserRole, USER_ROLE_VALUES } from "@/lib/roles";

const DEV_USER_ID = "dev-user";
export const IMPERSONATION_COOKIE = "stackhatch_impersonate_user";

export interface AuthenticatedUser {
  userId: string;
  role: UserRole;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  impersonatedBy?: {
    userId: string;
    role: UserRole;
    name?: string | null;
    email?: string | null;
  };
}

function isValidRole(role: string | undefined): role is UserRole {
  return !!role && USER_ROLE_VALUES.includes(role as UserRole);
}

function isDevAuthEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.STACKHATCH_DEV_AUTH === "1";
}

function getDevRole(): UserRole {
  const role = process.env.STACKHATCH_DEV_ROLE;
  if (!role) return "admin";
  if (isValidRole(role)) return role;
  return normalizeUserRole(role);
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

function readUser(userId: string): AuthenticatedUser | null {
  const db = getDb();
  runMigrations(db);
  const user = db.select().from(users).where(eq(users.id, userId)).get();

  if (!user) {
    return null;
  }

  return {
    userId: user.id,
    role: normalizeUserRole(user.role),
    name: user.name,
    email: user.email,
    image: user.avatarUrl,
  };
}

export async function getActualAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  if (isDevAuthEnabled()) {
    return getDevUser();
  }

  const session = await auth();
  const sessionUser = session?.user;
  if (!sessionUser?.userId) {
    return null;
  }

  return readUser(sessionUser.userId);
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const actualUser = await getActualAuthenticatedUser();
  if (!actualUser) {
    return null;
  }

  if (actualUser.role !== "admin") {
    return actualUser;
  }

  const cookieStore = await cookies();
  const impersonatedUserId = cookieStore.get(IMPERSONATION_COOKIE)?.value;
  if (!impersonatedUserId || impersonatedUserId === actualUser.userId) {
    return actualUser;
  }

  const impersonatedUser = readUser(impersonatedUserId);
  if (!impersonatedUser) {
    return actualUser;
  }

  return {
    ...impersonatedUser,
    impersonatedBy: {
      userId: actualUser.userId,
      role: actualUser.role,
      name: actualUser.name,
      email: actualUser.email,
    },
  };
}

export async function getAuthenticatedUserId(): Promise<string | null> {
  const user = await getAuthenticatedUser();
  return user?.userId ?? null;
}

export function requireRole(userRole: UserRole, allowed: UserRole[]): Response | null {
  if (allowed.includes(normalizeUserRole(userRole))) return null;
  return new Response(JSON.stringify({ error: "Upgrade required", upgradeRequired: true }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}
