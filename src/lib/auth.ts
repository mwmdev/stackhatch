import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { runMigrations } from "@/db/migrate";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth-config";
import { provisionUser } from "@/lib/user-provisioning";

const DEV_USER_ID = "dev-user";

export interface AuthenticatedUser {
  userId: string;
  githubId: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

function isDevAuthEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.STACKHATCH_DEV_AUTH === "1";
}

function getDevUser(): AuthenticatedUser {
  const db = getDb();
  runMigrations(db);
  const user = provisionUser(db, {
    id: DEV_USER_ID,
    githubId: DEV_USER_ID,
    email: "dev@stackhatch.local",
    name: "Dev User",
    avatarUrl: null,
  });

  return {
    userId: user.id,
    githubId: user.githubId,
    name: user.name,
    email: user.email,
    image: user.avatarUrl,
  };
}

function readUser(userId: string): AuthenticatedUser | null {
  const db = getDb();
  runMigrations(db);
  const user = db.select().from(users).where(eq(users.id, userId)).get();

  if (!user) return null;

  return {
    userId: user.id,
    githubId: user.githubId,
    name: user.name,
    email: user.email,
    image: user.avatarUrl,
  };
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  if (isDevAuthEnabled()) return getDevUser();

  const session = await auth();
  const sessionUser = session?.user;
  if (!sessionUser?.userId) return null;

  return readUser(sessionUser.userId);
}

export async function getAuthenticatedUserId(): Promise<string | null> {
  const user = await getAuthenticatedUser();
  return user?.userId ?? null;
}
