import NextAuth, { DefaultSession } from "next-auth";
import type { UserRole } from "@/db/schema";

declare module "next-auth" {
  interface Session {
    user: {
      githubId?: string;
      userId?: string;
      role?: UserRole;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    githubId?: string;
    userId?: string;
    role?: UserRole;
  }
}
