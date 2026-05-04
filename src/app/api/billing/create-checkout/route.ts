import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { subscriptions, users } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/auth";
import { getStripe, getPriceId } from "@/lib/stripe";

const createCheckoutSchema = z.object({
  plan: z.enum(["starter", "pro", "team5", "team15"]),
  interval: z.enum(["monthly", "annual"]),
  teamName: z.string().optional(), // Only for team plans
});

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createCheckoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { plan, interval, teamName } = parsed.data;

    const db = getDb();
    runMigrations(db);

    // Get or create Stripe customer
    const user = db.select().from(users).where(eq(users.id, userId)).get();
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const existingSubscription = db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .get();

    let customerId = existingSubscription?.stripeCustomerId;

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      const customer = await getStripe().customers.create({
        email: user.email || undefined,
        name: user.name || undefined,
        metadata: {
          userId,
          ...(teamName && { teamName }),
        },
      });
      customerId = customer.id;
    }

    // Get price ID for the selected plan and interval
    const priceId = getPriceId(plan, interval);

    // Create checkout session
    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXTAUTH_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXTAUTH_URL}/pricing`,
      metadata: {
        userId,
        plan,
        interval,
        ...(teamName && { teamName }),
      },
      subscription_data: {
        metadata: {
          userId,
          plan,
          interval,
          ...(teamName && { teamName }),
        },
      },
    });

    return NextResponse.json({
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    console.error("Checkout creation error:", error);
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}
