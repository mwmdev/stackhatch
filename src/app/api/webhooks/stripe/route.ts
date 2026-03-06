import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { subscriptions, users, usage } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq } from "drizzle-orm";
import { getStripe, getPlanByPriceId } from "@/lib/stripe";
import { v4 as uuid } from "uuid";
import type Stripe from "stripe";

// Stripe webhooks need the raw body for signature verification.
// Next.js App Router provides this via request.text().

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 },
    );
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 },
    );
  }

  const db = getDb();
  runMigrations(db);

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionChange(db, event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(db, event.data.object as Stripe.Subscription);
        break;

      case "invoice.payment_failed":
        await handlePaymentFailed(db, event.data.object as Stripe.Invoice);
        break;

      case "invoice.paid":
        await handleInvoicePaid(db, event.data.object as Stripe.Invoice);
        break;
    }
  } catch (err) {
    console.error(`Webhook handler error for ${event.type}:`, err);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}

function handleSubscriptionChange(db: ReturnType<typeof getDb>, sub: Stripe.Subscription) {
  const userId = sub.metadata?.userId;
  if (!userId) {
    console.warn("Subscription missing userId in metadata:", sub.id);
    return;
  }

  const priceId = sub.items.data[0]?.price?.id;
  let plan: "pro" | "team" = "pro";
  let interval: "monthly" | "annual" = "monthly";

  if (priceId) {
    try {
      const planInfo = getPlanByPriceId(priceId);
      plan = planInfo.plan.startsWith("team") ? "team" : "pro";
      interval = planInfo.interval;
    } catch {
      // Fall back to metadata
      const metaPlan = sub.metadata?.plan;
      if (metaPlan?.startsWith("team")) plan = "team";
      interval = (sub.metadata?.interval as "monthly" | "annual") || "monthly";
    }
  }

  const status = sub.status === "active" ? "active" as const
    : sub.status === "past_due" ? "past_due" as const
    : sub.cancel_at_period_end ? "canceled" as const
    : "active" as const;

  const now = Date.now();
  const currentPeriodEnd = (sub.items.data[0]?.current_period_end ?? Math.floor(Date.now() / 1000)) * 1000;

  const existing = db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .get();

  if (existing) {
    db.update(subscriptions)
      .set({
        stripeCustomerId: sub.customer as string,
        stripeSubscriptionId: sub.id,
        plan,
        billingInterval: interval,
        status,
        currentPeriodEnd,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, existing.id))
      .run();
  } else {
    db.insert(subscriptions)
      .values({
        id: uuid(),
        userId,
        stripeCustomerId: sub.customer as string,
        stripeSubscriptionId: sub.id,
        plan,
        billingInterval: interval,
        status,
        currentPeriodEnd,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  // Update user role
  const role = status === "active" ? "paid-user" : "free-user";
  db.update(users)
    .set({ role })
    .where(eq(users.id, userId))
    .run();
}

function handleSubscriptionDeleted(db: ReturnType<typeof getDb>, sub: Stripe.Subscription) {
  const userId = sub.metadata?.userId;
  if (!userId) {
    console.warn("Deleted subscription missing userId in metadata:", sub.id);
    return;
  }

  const now = Date.now();

  // Mark subscription as canceled
  const existing = db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .get();

  if (existing) {
    db.update(subscriptions)
      .set({
        status: "canceled",
        updatedAt: now,
      })
      .where(eq(subscriptions.id, existing.id))
      .run();
  }

  // Revert user to free
  db.update(users)
    .set({ role: "free-user" })
    .where(eq(users.id, userId))
    .run();
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const sub = invoice.parent?.subscription_details?.subscription;
  if (!sub) return null;
  return typeof sub === "string" ? sub : sub.id;
}

function handlePaymentFailed(db: ReturnType<typeof getDb>, invoice: Stripe.Invoice) {
  const subId = getInvoiceSubscriptionId(invoice);
  if (!subId) return;

  const now = Date.now();

  const existing = db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, subId))
    .get();

  if (existing) {
    db.update(subscriptions)
      .set({
        status: "past_due",
        updatedAt: now,
      })
      .where(eq(subscriptions.id, existing.id))
      .run();
  }
}

function handleInvoicePaid(db: ReturnType<typeof getDb>, invoice: Stripe.Invoice) {
  const subId = getInvoiceSubscriptionId(invoice);
  if (!subId) return;

  const now = Date.now();

  // Update subscription status to active
  const existing = db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, subId))
    .get();

  if (!existing) return;

  db.update(subscriptions)
    .set({
      status: "active",
      updatedAt: now,
    })
    .where(eq(subscriptions.id, existing.id))
    .run();

  // Update user role to paid
  db.update(users)
    .set({ role: "paid-user" })
    .where(eq(users.id, existing.userId))
    .run();

  // Reset usage counters for the new billing period
  const periodEnd = now + 30 * 24 * 60 * 60 * 1000; // ~30 days

  const existingUsage = db
    .select()
    .from(usage)
    .where(eq(usage.userId, existing.userId))
    .get();

  if (existingUsage) {
    db.update(usage)
      .set({
        messageCount: 0,
        scanCount: 0,
        periodStart: now,
        periodEnd,
      })
      .where(eq(usage.id, existingUsage.id))
      .run();
  }
}
