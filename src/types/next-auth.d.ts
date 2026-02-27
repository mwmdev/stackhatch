import NextAuth, { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      githubId?: string;
      userId?: string;
    } & DefaultSession["user"];
  }

  interface JWT {
    githubId?: string;
    userId?: string;
  }
}