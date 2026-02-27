import { auth } from "@/lib/auth-config";
import { NextRequest } from "next/server";

interface AuthenticatedUser {
  userId: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

/**
 * Get the authenticated user from the current session
 * Returns the user if authenticated, null otherwise
 */
export async function getAuthenticatedUser(request?: NextRequest): Promise<AuthenticatedUser | null> {
  try {
    const session = await auth();

    if (!session?.user) {
      return null;
    }

    const user = session.user as any;

    // Ensure we have a userId in the session
    if (!user.userId) {
      return null;
    }

    return {
      userId: user.userId,
      name: user.name,
      email: user.email,
      image: user.image,
    };
  } catch (error) {
    console.error("Error getting authenticated user:", error);
    return null;
  }
}

/**
 * Get the authenticated user's ID
 * Returns the user ID if authenticated, null otherwise
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  const user = await getAuthenticatedUser();
  return user?.userId ?? null;
}