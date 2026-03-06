import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { subscriptions } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/auth";
import { stripe } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { reactivate } = body || {};

    const db = getDb();
    runMigrations(db);

    const subscription = db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .get();

    if (!subscription || !subscription.stripeSubscriptionId) {
      return NextResponse.json(
        { error: "No active subscription found" },
        { status: 404 },
      );
    }

    if (reactivate) {
      // Reactivate a canceled subscription (remove cancel_at_period_end)
      if (subscription.status !== "canceled") {
        return NextResponse.json(
          { error: "Subscription is not canceled" },
          { status: 400 },
        );
      }

      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });

      db.update(subscriptions)
        .set({ status: "active", updatedAt: Date.now() })
        .where(eq(subscriptions.id, subscription.id))
        .run();

      return NextResponse.json({
        success: true,
        message: "Subscription reactivated successfully.",
      });
    }

    // Cancel at end of billing period
    if (subscription.status === "canceled") {
      return NextResponse.json(
        { error: "Subscription is already canceled" },
        { status: 400 },
      );
    }

    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    db.update(subscriptions)
      .set({ status: "canceled", updatedAt: Date.now() })
      .where(eq(subscriptions.id, subscription.id))
      .run();

    return NextResponse.json({
      success: true,
      message: "Subscription will be canceled at the end of the current billing period.",
    });
  } catch (error) {
    console.error("Billing cancel error:", error);
    return NextResponse.json(
      { error: "Failed to process cancellation" },
      { status: 500 },
    );
  }
}
