import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { runMigrations } from "@/db/migrate";
import { getActualAuthenticatedUser, requireRole } from "@/lib/auth";
import { getPlanCatalog, normalizePlanCatalog, savePlanCatalog } from "@/lib/plans";

export async function GET() {
  const user = await getActualAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const roleErr = requireRole(user.role, ["admin"]);
  if (roleErr) return roleErr;

  const db = getDb();
  runMigrations(db);
  return NextResponse.json({ plans: getPlanCatalog(db) });
}

export async function PATCH(request: NextRequest) {
  const user = await getActualAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const roleErr = requireRole(user.role, ["admin"]);
  if (roleErr) return roleErr;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let catalog;
  try {
    catalog = normalizePlanCatalog((body as { plans?: unknown })?.plans ?? body);
  } catch {
    return NextResponse.json({ error: "Invalid plan catalog" }, { status: 400 });
  }

  const db = getDb();
  runMigrations(db);
  savePlanCatalog(db, catalog);
  return NextResponse.json({ plans: catalog });
}
