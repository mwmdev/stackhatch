import Stripe from "stripe";
import { PLAN_CONFIG, type BillingInterval, type CheckoutPlanKey } from "@/lib/plan-config";
import type { AppDatabase } from "@/db";
import { getPlanCatalog } from "@/lib/plans";

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
  STARTER_MONTHLY:
    process.env.STRIPE_PRICE_STARTER_MONTHLY ?? process.env.STRIPE_PRICE_PRO_MONTHLY!,
  STARTER_ANNUAL: process.env.STRIPE_PRICE_STARTER_ANNUAL ?? process.env.STRIPE_PRICE_PRO_ANNUAL!,
  PRO_MONTHLY: process.env.STRIPE_PRICE_STUDIO_MONTHLY ?? process.env.STRIPE_PRICE_TEAM5_MONTHLY!,
  PRO_ANNUAL: process.env.STRIPE_PRICE_STUDIO_ANNUAL ?? process.env.STRIPE_PRICE_TEAM5_ANNUAL!,
  TEAM5_MONTHLY: process.env.STRIPE_PRICE_TEAM5_MONTHLY!,
  TEAM5_ANNUAL: process.env.STRIPE_PRICE_TEAM5_ANNUAL!,
  TEAM15_MONTHLY: process.env.STRIPE_PRICE_TEAM15_MONTHLY!,
  TEAM15_ANNUAL: process.env.STRIPE_PRICE_TEAM15_ANNUAL!,
} as const;

export { PLAN_CONFIG };

// Helper function to get price ID for a given plan and interval
export function getPriceId(
  plan: CheckoutPlanKey,
  interval: BillingInterval,
  db?: AppDatabase
): string {
  if (plan === "starter") {
    const saved = db ? getPlanCatalog(db).starter.billing : undefined;
    return (
      (interval === "monthly" ? saved?.monthlyStripePriceId : saved?.annualStripePriceId) ||
      (interval === "monthly" ? STRIPE_PRICES.STARTER_MONTHLY : STRIPE_PRICES.STARTER_ANNUAL)
    );
  }
  if (plan === "pro") {
    const saved = db ? getPlanCatalog(db).pro.billing : undefined;
    return (
      (interval === "monthly" ? saved?.monthlyStripePriceId : saved?.annualStripePriceId) ||
      (interval === "monthly" ? STRIPE_PRICES.PRO_MONTHLY : STRIPE_PRICES.PRO_ANNUAL)
    );
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
export function getPlanByPriceId(priceId: string, db?: AppDatabase) {
  const catalog = db ? getPlanCatalog(db) : PLAN_CONFIG;
  const plans = [
    {
      key: "starter-monthly",
      plan: "starter",
      interval: "monthly" as const,
      priceId: catalog.starter.billing.monthlyStripePriceId || STRIPE_PRICES.STARTER_MONTHLY,
    },
    {
      key: "starter-annual",
      plan: "starter",
      interval: "annual" as const,
      priceId: catalog.starter.billing.annualStripePriceId || STRIPE_PRICES.STARTER_ANNUAL,
    },
    {
      key: "pro-monthly",
      plan: "pro",
      interval: "monthly" as const,
      priceId: catalog.pro.billing.monthlyStripePriceId || STRIPE_PRICES.PRO_MONTHLY,
    },
    {
      key: "pro-annual",
      plan: "pro",
      interval: "annual" as const,
      priceId: catalog.pro.billing.annualStripePriceId || STRIPE_PRICES.PRO_ANNUAL,
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
