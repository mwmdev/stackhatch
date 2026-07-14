import NextAuth from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import { getDb } from "@/db";
import { runMigrations } from "@/db/migrate";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createId } from "@/lib/id";
import { normalizeUserRole } from "@/lib/roles";

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "github" && profile?.id) {
        try {
          const db = getDb();
          runMigrations(db);
          const githubId = String(profile.id);

          // Check if user already exists
          const existingUser = await db
            .select()
            .from(users)
            .where(eq(users.githubId, githubId))
            .limit(1);

          const isAdmin = githubId === process.env.ADMIN_GITHUB_ID;

          if (existingUser.length === 0) {
            // Create new user on first login
            await db.insert(users).values({
              id: createId(),
              githubId,
              email: profile.email || null,
              name: profile.name || null,
              avatarUrl: (profile as any).avatar_url || null,
              role: isAdmin ? "admin" : "user",
              createdAt: Date.now(),
            });
          } else {
            // Update existing user's name and avatar on subsequent logins
            const updates: Record<string, unknown> = {
              name: profile.name || existingUser[0].name,
              avatarUrl: (profile as any).avatar_url || existingUser[0].avatarUrl,
            };
            // Promote to admin if matching ADMIN_GITHUB_ID
            if (isAdmin && existingUser[0].role !== "admin") {
              updates.role = "admin";
            }
            await db.update(users).set(updates).where(eq(users.githubId, githubId));
          }

          return true;
        } catch (error) {
          console.error("Error upserting user:", error);
          return false;
        }
      }

      return true;
    },
    async jwt({ token, account, profile }) {
      // Store GitHub information in the token
      if (account && profile) {
        const githubId = String(profile.id);
        token.githubId = githubId;

        // Fetch the user ID from the database
        try {
          const db = getDb();
          runMigrations(db);
          const where = token.userId
            ? eq(users.id, String(token.userId))
            : eq(users.githubId, githubId);
          const user = await db.select().from(users).where(where).limit(1);

          if (user.length > 0) {
            token.userId = user[0].id;
            token.githubId = user[0].githubId;
            token.role = normalizeUserRole(user[0].role);
          }
        } catch (error) {
          console.error("Error fetching user ID:", error);
        }
      }
      return token;
    },
    async session({ session, token }) {
      // Add GitHub ID and user ID to session
      if (session.user) {
        if (token.githubId) {
          (session.user as any).githubId = token.githubId;
        }
        if (token.userId) {
          (session.user as any).userId = token.userId;
        }
        if (token.role) {
          (session.user as any).role = token.role;
        }
      }
      return session;
    },
  },
});
