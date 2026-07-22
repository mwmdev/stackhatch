import { and, eq } from "drizzle-orm";
import NextAuth from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import { getDb } from "@/db";
import { runMigrations } from "@/db/migrate";
import { users } from "@/db/schema";
import { provisionUser } from "@/lib/user-provisioning";

function githubAvatarUrl(profile: object): string | null {
  if (!("avatar_url" in profile) || typeof profile.avatar_url !== "string") return null;
  return profile.avatar_url;
}

function clearCachedIdentity<
  T extends {
    userId?: unknown;
    githubId?: unknown;
    name?: unknown;
    email?: unknown;
    picture?: unknown;
  },
>(token: T): T {
  delete token.userId;
  delete token.githubId;
  delete token.name;
  delete token.email;
  delete token.picture;
  return token;
}

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
      if (account?.provider !== "github" || !profile?.id) return true;

      try {
        const db = getDb();
        runMigrations(db);
        provisionUser(db, {
          githubId: String(profile.id),
          email: profile.email ?? null,
          name: profile.name ?? null,
          avatarUrl: githubAvatarUrl(profile),
        });
        return true;
      } catch (error) {
        console.error("Error provisioning user:", error);
        return false;
      }
    },
    async jwt({ token, account, profile }) {
      const isFreshGitHubSignIn = account?.provider === "github" && profile?.id != null;
      const githubId = isFreshGitHubSignIn
        ? String(profile.id)
        : typeof token.githubId === "string"
          ? token.githubId
          : null;
      const userId = typeof token.userId === "string" ? token.userId : null;

      if (!githubId || (!isFreshGitHubSignIn && !userId)) {
        return clearCachedIdentity(token);
      }

      try {
        const db = getDb();
        runMigrations(db);
        const user = db
          .select()
          .from(users)
          .where(
            isFreshGitHubSignIn
              ? eq(users.githubId, githubId)
              : and(eq(users.id, userId!), eq(users.githubId, githubId))
          )
          .get();

        if (user && user.githubId === githubId && (isFreshGitHubSignIn || user.id === userId)) {
          token.userId = user.id;
          token.githubId = user.githubId;
          return token;
        }
      } catch (error) {
        console.error("Error validating account identity:", error);
      }

      return clearCachedIdentity(token);
    },
    async session({ session, token }) {
      if (session.user && typeof token.githubId === "string" && typeof token.userId === "string") {
        session.user.githubId = token.githubId;
        session.user.userId = token.userId;
      } else {
        delete (session as { user?: typeof session.user }).user;
      }
      return session;
    },
  },
});
