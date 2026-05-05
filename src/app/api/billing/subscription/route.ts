import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { subscriptions } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { and, eq } from "drizzle-orm";
import { getAuthenticatedUser } from "@/lib/auth";
import { getActivePlan, getPublicPlan } from "@/lib/plans";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const userId = user.userId;

    const db = getDb();
    runMigrations(db);

    const plan = getActivePlan(db, userId, user.role);
    const subscription = db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
      .get();
    const subscriptionPlan = getPublicPlan(subscription?.plan);

    if (!subscription || subscriptionPlan === "free" || plan === "free") {
      return NextResponse.json({
        plan,
        billingInterval: null,
        status: null,
        currentPeriodEnd: null,
      });
    }

    return NextResponse.json({
      plan,
      billingInterval: subscription.billingInterval || "monthly",
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
    });
  } catch (error) {
    console.error("Subscription fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch subscription" }, { status: 500 });
  }
}
