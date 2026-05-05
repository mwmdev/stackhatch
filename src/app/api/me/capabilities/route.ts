import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { runMigrations } from "@/db/migrate";
import { getAuthenticatedUser } from "@/lib/auth";
import { getEffectivePlanFeatures, redactPlanCatalog } from "@/lib/plans";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const db = getDb();
    runMigrations(db);
    const { plan, features, catalog } = getEffectivePlanFeatures(db, user.userId, user.role);
    const publicCatalog = redactPlanCatalog(catalog);

    return NextResponse.json({
      plan,
      planConfig: publicCatalog[plan],
      features,
      plans: publicCatalog,
      role: user.role,
      isAdmin: user.role === "admin",
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch capabilities" }, { status: 500 });
  }
}
