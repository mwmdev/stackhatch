export type PublicPlanKey = "free" | "starter" | "pro";
export type CheckoutPlanKey = "starter" | "pro" | "team5" | "team15";
export type BillingInterval = "monthly" | "annual";

export const PLAN_CONFIG = {
  free: {
    key: "free",
    name: "Free BYOK",
    shortName: "Free",
    monthlyPrice: 0,
    description: "Bring your own Anthropic key and map real projects without a paywall.",
    cta: "Start free",
    features: {
      projects: 2,
      messagesPerMonth: "byok",
      scansPerMonth: 2,
      models: ["sonnet"],
      exports: ["json"],
      customSubtypes: false,
      alternatives: false,
      prdExport: false,
      collaboration: false,
      serverManagedAi: false,
      byok: true,
    },
  },
  starter: {
    key: "starter",
    name: "Builder",
    shortName: "Builder",
    monthlyPrice: 6,
    annualPrice: 5,
    description: "Hosted Claude for solo builders who want momentum without managing keys.",
    cta: "Upgrade to Builder",
    features: {
      projects: 10,
      messagesPerMonth: 500,
      scansPerMonth: 25,
      models: ["sonnet"],
      exports: ["png", "svg", "json"],
      customSubtypes: false,
      alternatives: true,
      prdExport: false,
      collaboration: false,
      serverManagedAi: true,
      byok: false,
    },
  },
  pro: {
    key: "pro",
    name: "Studio",
    shortName: "Studio",
    monthlyPrice: 14,
    annualPrice: 11,
    description: "A serious architecture workspace for startup teams and developer tools.",
    cta: "Go Studio",
    features: {
      projects: "unlimited",
      messagesPerMonth: 2500,
      scansPerMonth: 150,
      models: ["sonnet", "opus", "haiku"],
      exports: ["png", "svg", "json", "md"],
      customSubtypes: true,
      alternatives: true,
      prdExport: true,
      collaboration: true,
      serverManagedAi: true,
      byok: false,
    },
  },
} as const;

export function getPlanLabel(plan: string | null | undefined) {
  if (plan === "starter") return PLAN_CONFIG.starter.name;
  if (plan === "pro" || plan === "team") return PLAN_CONFIG.pro.name;
  return PLAN_CONFIG.free.name;
}

export function getPublicPlan(plan: string | null | undefined): PublicPlanKey {
  if (plan === "starter") return "starter";
  if (plan === "pro" || plan === "team") return "pro";
  return "free";
}

export function isUnlimited(value: unknown): value is "unlimited" {
  return value === "unlimited";
}
