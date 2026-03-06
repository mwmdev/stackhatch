import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { teams, teamMembers } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { stripe, getPriceId } from "@/lib/stripe";

const createTeamSchema = z.object({
  name: z.string().min(1).max(100),
  plan: z.enum(["team5", "team15"]),
  interval: z.enum(["monthly", "annual"]).default("monthly"),
});

// POST /api/teams - Create a team (triggers Stripe checkout)
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (user.role === "free-user") {
      return NextResponse.json(
        { error: "Upgrade to a paid plan to create teams", upgradeRequired: true },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = createTeamSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { name, plan, interval } = parsed.data;
    const priceId = getPriceId(plan, interval);

    const db = getDb();
    runMigrations(db);

    // Get or create Stripe customer
    const { subscriptions, users } = await import("@/db/schema");
    const dbUser = db.select().from(users).where(eq(users.id, user.userId)).get();
    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const existingSub = db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, user.userId))
      .get();

    let customerId = existingSub?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: dbUser.email || undefined,
        name: dbUser.name || undefined,
        metadata: { userId: user.userId },
      });
      customerId = customer.id;
    }

    // Create Stripe checkout session for team plan
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXTAUTH_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXTAUTH_URL}/pricing`,
      metadata: {
        userId: user.userId,
        plan,
        interval,
        teamName: name,
      },
      subscription_data: {
        metadata: {
          userId: user.userId,
          plan,
          interval,
          teamName: name,
        },
      },
    });

    return NextResponse.json({
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    console.error("POST /api/teams error:", error);
    return NextResponse.json(
      { error: "Failed to create team" },
      { status: 500 }
    );
  }
}

// GET /api/teams - List user's teams
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const db = getDb();
    runMigrations(db);

    const userTeams = db
      .select({
        id: teams.id,
        name: teams.name,
        plan: teams.plan,
        ownerId: teams.ownerId,
        createdAt: teams.createdAt,
      })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(eq(teamMembers.userId, user.userId))
      .all();

    return NextResponse.json(userTeams);
  } catch (error) {
    console.error("GET /api/teams error:", error);
    return NextResponse.json(
      { error: "Failed to fetch teams" },
      { status: 500 }
    );
  }
}
