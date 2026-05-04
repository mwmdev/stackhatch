import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { subscriptions, users, teams, teamMembers } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { createId } from "@/lib/id";

const createSubscriptionSchema = z.object({
  sessionId: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createSubscriptionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { sessionId } = parsed.data;

    const db = getDb();
    runMigrations(db);

    // Retrieve the checkout session from Stripe
    const session = await getStripe().checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    if (!session || session.payment_status !== "paid") {
      return NextResponse.json({ error: "Payment not completed" }, { status: 400 });
    }

    const stripeSubscription = session.subscription as any;
    if (!stripeSubscription) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 400 });
    }

    const metadata = session.metadata || {};
    const plan = metadata.plan as "pro" | "team5" | "team15";
    const interval = metadata.interval as "monthly" | "annual";
    const teamName = metadata.teamName;

    const now = Date.now();

    // Update or create subscription record
    const existingSubscription = db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .get();

    const subscriptionData = {
      id: existingSubscription?.id || createId(),
      userId,
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: stripeSubscription.id,
      plan: plan.startsWith("team") ? ("team" as const) : (plan as "pro"),
      billingInterval: interval,
      status: stripeSubscription.status === "active" ? ("active" as const) : ("past_due" as const),
      currentPeriodEnd: stripeSubscription.current_period_end * 1000, // Convert to milliseconds
      createdAt: existingSubscription?.createdAt || now,
      updatedAt: now,
    };

    if (existingSubscription) {
      db.update(subscriptions)
        .set({
          stripeCustomerId: subscriptionData.stripeCustomerId,
          stripeSubscriptionId: subscriptionData.stripeSubscriptionId,
          plan: subscriptionData.plan,
          billingInterval: subscriptionData.billingInterval,
          status: subscriptionData.status,
          currentPeriodEnd: subscriptionData.currentPeriodEnd,
          updatedAt: subscriptionData.updatedAt,
        })
        .where(eq(subscriptions.id, existingSubscription.id))
        .run();
    } else {
      db.insert(subscriptions).values(subscriptionData).run();
    }

    // Update user role to paid-user
    db.update(users).set({ role: "paid-user" }).where(eq(users.id, userId)).run();

    // Create team if this is a team plan
    if (plan.startsWith("team") && teamName) {
      const teamId = createId();

      // Create team
      db.insert(teams)
        .values({
          id: teamId,
          name: teamName,
          plan: plan as "team5" | "team15",
          ownerId: userId,
          stripeSubscriptionId: stripeSubscription.id,
          createdAt: now,
        })
        .run();

      // Add user as team owner
      db.insert(teamMembers)
        .values({
          teamId,
          userId,
          role: "owner",
          joinedAt: now,
        })
        .run();
    }

    return NextResponse.json({
      success: true,
      subscription: {
        id: subscriptionData.id,
        plan: subscriptionData.plan,
        status: subscriptionData.status,
        currentPeriodEnd: subscriptionData.currentPeriodEnd,
      },
    });
  } catch (error) {
    console.error("Subscription creation error:", error);
    return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 });
  }
}
