import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { subscriptions } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/auth";
import { getStripe, getPriceId } from "@/lib/stripe";

const manageSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("switch_interval"),
    interval: z.enum(["monthly", "annual"]),
  }),
  z.object({
    action: z.literal("change_plan"),
    plan: z.enum(["starter", "pro"]),
  }),
]);

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = manageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const db = getDb();
    runMigrations(db);

    const subscription = db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .get();

    if (!subscription || !subscription.stripeSubscriptionId) {
      return NextResponse.json({ error: "No active subscription found" }, { status: 404 });
    }

    // Get the Stripe subscription to find the current item
    const stripeSubscription = await getStripe().subscriptions.retrieve(
      subscription.stripeSubscriptionId
    );

    if (stripeSubscription.status !== "active") {
      return NextResponse.json({ error: "Subscription is not active" }, { status: 400 });
    }

    const currentItem = stripeSubscription.items.data[0];
    if (!currentItem) {
      return NextResponse.json({ error: "No subscription items found" }, { status: 400 });
    }

    const { action } = parsed.data;

    if (action === "switch_interval") {
      const { interval } = parsed.data;

      if (subscription.billingInterval === interval) {
        return NextResponse.json({ error: `Already on ${interval} billing` }, { status: 400 });
      }

      // Determine current plan key from price ID
      const currentPlan = subscription.plan as "starter" | "pro" | "team";
      let planKey: "starter" | "pro" | "team5" | "team15" =
        currentPlan === "starter" ? "starter" : "pro";
      if (currentPlan === "team") {
        const currentPriceId = currentItem.price.id;
        const team5MonthlyPrice = getPriceId("team5", "monthly", db);
        const team5AnnualPrice = getPriceId("team5", "annual", db);
        if (currentPriceId === team5MonthlyPrice || currentPriceId === team5AnnualPrice) {
          planKey = "team5";
        } else {
          planKey = "team15";
        }
      }

      const newPriceId = getPriceId(planKey, interval, db);

      if (interval === "annual") {
        await getStripe().subscriptions.update(subscription.stripeSubscriptionId, {
          items: [{ id: currentItem.id, price: newPriceId }],
          proration_behavior: "create_prorations",
        });
      } else {
        await getStripe().subscriptions.update(subscription.stripeSubscriptionId, {
          items: [{ id: currentItem.id, price: newPriceId }],
          proration_behavior: "none",
          billing_cycle_anchor: "unchanged",
        });
      }

      db.update(subscriptions)
        .set({ billingInterval: interval, updatedAt: Date.now() })
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
    }

    if (action === "change_plan") {
      const { plan: newPlanKey } = parsed.data;
      const interval = (subscription.billingInterval || "monthly") as "monthly" | "annual";
      const newPriceId = getPriceId(newPlanKey, interval, db);
      const newPlanName = newPlanKey;

      await getStripe().subscriptions.update(subscription.stripeSubscriptionId, {
        items: [{ id: currentItem.id, price: newPriceId }],
        proration_behavior: "create_prorations",
      });

      db.update(subscriptions)
        .set({ plan: newPlanName, updatedAt: Date.now() })
        .where(eq(subscriptions.id, subscription.id))
        .run();

      return NextResponse.json({
        success: true,
        plan: newPlanName,
        message: `Plan changed to ${newPlanKey}. Proration applied.`,
      });
    }
  } catch (error) {
    console.error("Billing manage error:", error);
    return NextResponse.json({ error: "Failed to update billing" }, { status: 500 });
  }
}
