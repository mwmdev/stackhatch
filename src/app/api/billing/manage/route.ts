import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { subscriptions } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/auth";
import { stripe, getPriceId } from "@/lib/stripe";

const manageSchema = z.object({
  action: z.enum(["switch_interval"]),
  interval: z.enum(["monthly", "annual"]),
});

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
    const parsed = manageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const { interval } = parsed.data;

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

    if (subscription.billingInterval === interval) {
      return NextResponse.json(
        { error: `Already on ${interval} billing` },
        { status: 400 },
      );
    }

    // Get the Stripe subscription to find the current item
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId,
    );

    if (stripeSubscription.status !== "active") {
      return NextResponse.json(
        { error: "Subscription is not active" },
        { status: 400 },
      );
    }

    const currentItem = stripeSubscription.items.data[0];
    if (!currentItem) {
      return NextResponse.json(
        { error: "No subscription items found" },
        { status: 400 },
      );
    }

    // Determine the plan type from current subscription
    const plan = subscription.plan as "pro" | "team";
    // For team plans, we need to figure out which team tier (team5 or team15)
    // by matching the current price ID
    let planKey: "pro" | "team5" | "team15" = "pro";
    if (plan === "team") {
      const currentPriceId = currentItem.price.id;
      const team5MonthlyPrice = getPriceId("team5", "monthly");
      const team5AnnualPrice = getPriceId("team5", "annual");
      if (
        currentPriceId === team5MonthlyPrice ||
        currentPriceId === team5AnnualPrice
      ) {
        planKey = "team5";
      } else {
        planKey = "team15";
      }
    }

    const newPriceId = getPriceId(planKey, interval);

    if (interval === "annual") {
      // Monthly → Annual: prorate immediately
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        items: [
          {
            id: currentItem.id,
            price: newPriceId,
          },
        ],
        proration_behavior: "create_prorations",
      });
    } else {
      // Annual → Monthly: take effect at end of current period
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        items: [
          {
            id: currentItem.id,
            price: newPriceId,
          },
        ],
        proration_behavior: "none",
        billing_cycle_anchor: "unchanged",
      });
    }

    // Update local record
    db.update(subscriptions)
      .set({
        billingInterval: interval,
        updatedAt: Date.now(),
      })
      .where(eq(subscriptions.id, subscription.id))
      .run();

    return NextResponse.json({
      success: true,
      billingInterval: interval,
      message:
        interval === "annual"
          ? "Switched to annual billing. Proration applied."
          : "Switched to monthly billing. Takes effect at end of current period.",
    });
  } catch (error) {
    console.error("Billing manage error:", error);
    return NextResponse.json(
      { error: "Failed to update billing" },
      { status: 500 },
    );
  }
}
