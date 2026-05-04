import Stripe from "stripe";

// Server-side Stripe client (lazy to avoid crash when key is missing)
let _stripe: Stripe | null = null;
export function getStripe() {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-02-25.clover",
    });
  }
  return _stripe;
}

// Price ID mapping for subscription plans
export const STRIPE_PRICES = {
  PRO_MONTHLY: process.env.STRIPE_PRICE_PRO_MONTHLY!,
  PRO_ANNUAL: process.env.STRIPE_PRICE_PRO_ANNUAL!,
  TEAM5_MONTHLY: process.env.STRIPE_PRICE_TEAM5_MONTHLY!,
  TEAM5_ANNUAL: process.env.STRIPE_PRICE_TEAM5_ANNUAL!,
  TEAM15_MONTHLY: process.env.STRIPE_PRICE_TEAM15_MONTHLY!,
  TEAM15_ANNUAL: process.env.STRIPE_PRICE_TEAM15_ANNUAL!,
} as const;

// Type definitions for plan types
export type PlanType = "free" | "pro" | "team";
export type BillingInterval = "monthly" | "annual";

// Plan configuration with pricing and features
export const PLAN_CONFIG = {
  free: {
    name: "Free",
    monthlyPrice: 0,
    features: {
      projects: 2,
      messagesPerMonth: 20,
      scansPerMonth: 2,
      models: ["sonnet"],
      exports: [],
      customSubtypes: false,
      versioning: false,
    },
  },
  pro: {
    name: "Pro",
    monthlyPrice: 19,
    annualPrice: 15, // $180/year
    priceIds: {
      monthly: STRIPE_PRICES.PRO_MONTHLY,
      annual: STRIPE_PRICES.PRO_ANNUAL,
    },
    features: {
      projects: "unlimited",
      messagesPerMonth: "unlimited",
      scansPerMonth: "unlimited",
      models: ["sonnet", "opus", "haiku"],
      exports: ["png", "svg", "json", "md"],
      customSubtypes: true,
      versioning: true,
    },
  },
  team: {
    name: "Team",
    plans: {
      team5: {
        name: "Team (5 users)",
        monthlyPrice: 39,
        annualPrice: 33, // $396/year
        maxUsers: 5,
        priceIds: {
          monthly: STRIPE_PRICES.TEAM5_MONTHLY,
          annual: STRIPE_PRICES.TEAM5_ANNUAL,
        },
      },
      team15: {
        name: "Team (15 users)",
        monthlyPrice: 79,
        annualPrice: 66, // $792/year
        maxUsers: 15,
        priceIds: {
          monthly: STRIPE_PRICES.TEAM15_MONTHLY,
          annual: STRIPE_PRICES.TEAM15_ANNUAL,
        },
      },
    },
    features: {
      projects: "unlimited",
      messagesPerMonth: "unlimited",
      scansPerMonth: "unlimited",
      models: ["sonnet", "opus", "haiku"],
      exports: ["png", "svg", "json", "md", "pdf"],
      customSubtypes: true,
      versioning: true,
      sharedWorkspaces: true,
      teamDiagramLibrary: true,
      commenting: true,
      sso: true,
    },
  },
} as const;

// Helper function to get price ID for a given plan and interval
export function getPriceId(plan: "pro" | "team5" | "team15", interval: BillingInterval): string {
  if (plan === "pro") {
    return interval === "monthly" ? STRIPE_PRICES.PRO_MONTHLY : STRIPE_PRICES.PRO_ANNUAL;
  }
  if (plan === "team5") {
    return interval === "monthly" ? STRIPE_PRICES.TEAM5_MONTHLY : STRIPE_PRICES.TEAM5_ANNUAL;
  }
  if (plan === "team15") {
    return interval === "monthly" ? STRIPE_PRICES.TEAM15_MONTHLY : STRIPE_PRICES.TEAM15_ANNUAL;
  }
  throw new Error(`Invalid plan: ${plan}`);
}

// Helper function to get plan details by price ID
export function getPlanByPriceId(priceId: string) {
  const plans = [
    {
      key: "pro-monthly",
      plan: "pro",
      interval: "monthly" as const,
      priceId: STRIPE_PRICES.PRO_MONTHLY,
    },
    {
      key: "pro-annual",
      plan: "pro",
      interval: "annual" as const,
      priceId: STRIPE_PRICES.PRO_ANNUAL,
    },
    {
      key: "team5-monthly",
      plan: "team5",
      interval: "monthly" as const,
      priceId: STRIPE_PRICES.TEAM5_MONTHLY,
    },
    {
      key: "team5-annual",
      plan: "team5",
      interval: "annual" as const,
      priceId: STRIPE_PRICES.TEAM5_ANNUAL,
    },
    {
      key: "team15-monthly",
      plan: "team15",
      interval: "monthly" as const,
      priceId: STRIPE_PRICES.TEAM15_MONTHLY,
    },
    {
      key: "team15-annual",
      plan: "team15",
      interval: "annual" as const,
      priceId: STRIPE_PRICES.TEAM15_ANNUAL,
    },
  ];

  const match = plans.find((p) => p.priceId === priceId);
  if (!match) {
    throw new Error(`Unknown price ID: ${priceId}`);
  }

  return match;
}
