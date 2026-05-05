import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { runMigrations } from "@/db/migrate";
import { getPlanCatalog, redactPlanCatalog } from "@/lib/plans";

export async function GET() {
  try {
    const db = getDb();
    runMigrations(db);
    return NextResponse.json({ plans: redactPlanCatalog(getPlanCatalog(db)) });
  } catch {
    return NextResponse.json({ error: "Failed to fetch plans" }, { status: 500 });
  }
}
