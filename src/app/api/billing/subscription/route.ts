import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { subscriptions } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const db = getDb();
    runMigrations(db);

    const subscription = db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .get();

    if (!subscription || subscription.plan === "free") {
      return NextResponse.json({
        plan: "free",
        billingInterval: null,
        status: null,
        currentPeriodEnd: null,
      });
    }

    return NextResponse.json({
      plan: subscription.plan,
      billingInterval: subscription.billingInterval || "monthly",
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
    });
  } catch (error) {
    console.error("Subscription fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscription" },
      { status: 500 },
    );
  }
}
