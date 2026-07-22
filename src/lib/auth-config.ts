import { eq } from "drizzle-orm";
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
      if (!account || !profile?.id) return token;

      const githubId = String(profile.id);
      token.githubId = githubId;

      try {
        const db = getDb();
        runMigrations(db);
        const user = db.select().from(users).where(eq(users.githubId, githubId)).get();

        if (user) {
          token.userId = user.id;
          token.githubId = user.githubId;
        }
      } catch (error) {
        console.error("Error fetching user ID:", error);
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.githubId = typeof token.githubId === "string" ? token.githubId : undefined;
        session.user.userId = typeof token.userId === "string" ? token.userId : undefined;
      }
      return session;
    },
  },
});
