import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { runMigrations } from "@/db/migrate";
import { deleteAccountById } from "@/lib/account-deletion";
import { getAuthenticatedUser, isDevelopmentAuthEnabled } from "@/lib/auth";
import { signOut } from "@/lib/auth-config";

const requestSchema = z.object({ confirmation: z.literal("DELETE MY ACCOUNT") }).strict();

function hasMatchingOriginAndHost(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;

  try {
    const parsedOrigin = new URL(origin);
    const requestProtocol = new URL(request.url).protocol;
    return (
      origin === parsedOrigin.origin &&
      parsedOrigin.host === host &&
      parsedOrigin.protocol === requestProtocol
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json" || !hasMatchingOriginAndHost(request)) {
    return NextResponse.json({ error: "Invalid account deletion request" }, { status: 400 });
  }

  if (isDevelopmentAuthEnabled()) {
    return NextResponse.json(
      { error: "Account deletion is unavailable with development authentication" },
      { status: 403 }
    );
  }

  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!requestSchema.safeParse(body).success) {
    return NextResponse.json({ error: "Invalid confirmation" }, { status: 400 });
  }

  try {
    const db = getDb();
    runMigrations(db);
    const result = deleteAccountById(db, user.userId);

    let signedOut = true;
    try {
      await signOut({ redirect: false });
    } catch {
      signedOut = false;
    }

    return NextResponse.json({ committed: true, deleted: result.deleted, signedOut });
  } catch {
    return NextResponse.json({ error: "Account deletion failed" }, { status: 500 });
  }
}
