import NextAuth from "next-auth";
import GitHubProvider from "next-auth/providers/github";

const handler = NextAuth({
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
    async signIn() {
      // For now, allow all GitHub sign-ins
      // User persistence will be handled in US-002
      return true;
    },
    async jwt({ token, account, profile }) {
      // Store GitHub information in the token
      if (account && profile) {
        token.githubId = String(profile.id);
      }
      return token;
    },
    async session({ session, token }) {
      // Add GitHub ID to session for now
      // userId will be added in US-002 when user table exists
      if (session.user && token.githubId) {
        (session.user as any).githubId = token.githubId;
      }
      return session;
    },
  },
}) as any;

export { handler as GET, handler as POST };