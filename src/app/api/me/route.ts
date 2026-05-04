import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  return NextResponse.json({
    userId: user.userId,
    role: user.role,
    name: user.name,
    email: user.email,
    impersonatedBy: user.impersonatedBy,
  });
}
