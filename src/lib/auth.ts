import { cookies } from "next/headers";
import type { UserRole } from "@/db/schema";

const DEV_USER_ID = "dev-user";
const VALID_ROLES: UserRole[] = ["admin", "free-user", "paid-user"];

interface AuthenticatedUser {
  userId: string;
  role: UserRole;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  let role: UserRole = "admin";
  const cookieVal = (await cookies()).get("dev-role")?.value;
  if (cookieVal && VALID_ROLES.includes(cookieVal as UserRole)) {
    role = cookieVal as UserRole;
  }
  return {
    userId: DEV_USER_ID,
    role,
    name: "Dev User",
    email: null,
    image: null,
  };
}

export async function getAuthenticatedUserId(): Promise<string | null> {
  return DEV_USER_ID;
}

export function requireRole(
  userRole: UserRole,
  allowed: UserRole[],
): Response | null {
  if (allowed.includes(userRole)) return null;
  return new Response(
    JSON.stringify({ error: "Upgrade required", upgradeRequired: true }),
    { status: 403, headers: { "Content-Type": "application/json" } },
  );
}
