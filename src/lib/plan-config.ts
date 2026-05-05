import { z } from "zod";

export type PublicPlanKey = "free" | "starter" | "pro";
export type CheckoutPlanKey = "starter" | "pro" | "team5" | "team15";
export type BillingInterval = "monthly" | "annual";
export type LimitValue = number | "unlimited";
export type UsageLimitValue = LimitValue | "byok";
export type DiagramExportFormat = "png" | "svg" | "json" | "yaml";

export const PUBLIC_PLAN_KEYS = ["free", "starter", "pro"] as const;
export const DIAGRAM_EXPORT_FORMATS = ["png", "svg", "json", "yaml"] as const;

const limitedNumberSchema = z.number().int().min(0).max(1_000_000);
const limitSchema = z.union([limitedNumberSchema, z.literal("unlimited")]);
const usageLimitSchema = z.union([limitSchema, z.literal("byok")]);
const stripePriceIdSchema = z.string().trim().max(255);

export const planFeaturesSchema = z.object({
  projects: limitSchema,
  messagesPerMonth: usageLimitSchema,
  scansPerMonth: limitSchema,
  models: z.array(z.string().trim().min(1).max(80)).max(20),
  exports: z.array(z.enum(DIAGRAM_EXPORT_FORMATS)).min(1),
  nodeDescriptions: z.boolean(),
  nodeLocking: z.boolean(),
  connectionTypes: z.boolean(),
  customSubtypes: z.boolean(),
  alternatives: z.boolean(),
  prdExport: z.boolean(),
  collaboration: z.boolean(),
  serverManagedAi: z.boolean(),
  byok: z.boolean(),
});

export const planBillingSchema = z.object({
  monthlyPrice: z.number().min(0).max(100_000),
  annualPrice: z.number().min(0).max(100_000).optional(),
  monthlyStripePriceId: stripePriceIdSchema.optional(),
  annualStripePriceId: stripePriceIdSchema.optional(),
});

export const planCatalogEntrySchema = z.object({
  key: z.enum(PUBLIC_PLAN_KEYS),
  name: z.string().trim().min(1).max(80),
  shortName: z.string().trim().min(1).max(40),
  description: z.string().trim().min(1).max(280),
  cta: z.string().trim().min(1).max(80),
  bullets: z.array(z.string().trim().min(1).max(160)).min(1).max(12),
  featured: z.boolean(),
  billing: planBillingSchema,
  features: planFeaturesSchema,
});

export const planCatalogSchema = z.object({
  free: planCatalogEntrySchema.extend({ key: z.literal("free") }),
  starter: planCatalogEntrySchema.extend({ key: z.literal("starter") }),
  pro: planCatalogEntrySchema.extend({ key: z.literal("pro") }),
});

export type PlanFeatures = z.infer<typeof planFeaturesSchema>;
export type PlanCatalogEntry = z.infer<typeof planCatalogEntrySchema>;
export type PlanCatalog = z.infer<typeof planCatalogSchema>;

export type PublicPlanCatalogEntry = Omit<PlanCatalogEntry, "billing"> & {
  billing: Omit<PlanCatalogEntry["billing"], "monthlyStripePriceId" | "annualStripePriceId">;
};
export type PublicPlanCatalog = Record<PublicPlanKey, PublicPlanCatalogEntry>;

export const DEFAULT_PLAN_CATALOG: PlanCatalog = {
  free: {
    key: "free",
    name: "Free plan",
    shortName: "Free",
    description: "Bring your own Anthropic key and map real projects without a paywall.",
    cta: "Start free",
    bullets: [
      "Bring your own Anthropic key",
      "2 active projects",
      "2 repository scans per month",
      "Sonnet architecture chat",
      "JSON export for handoff",
    ],
    featured: false,
    billing: {
      monthlyPrice: 0,
    },
    features: {
      projects: 2,
      messagesPerMonth: "byok",
      scansPerMonth: 2,
      models: ["sonnet"],
      exports: ["json"],
      nodeDescriptions: true,
      nodeLocking: true,
      connectionTypes: false,
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
    description: "BYOK for solo builders who need more project room and shareable exports.",
    cta: "Upgrade to Builder",
    bullets: [
      "Bring your own Anthropic key",
      "5 active projects",
      "25 repository scans per month",
      "PNG, SVG, and JSON exports",
      "Node alternatives and stack swaps",
    ],
    featured: true,
    billing: {
      monthlyPrice: 6,
      annualPrice: 5,
      monthlyStripePriceId: "",
      annualStripePriceId: "",
    },
    features: {
      projects: 5,
      messagesPerMonth: "byok",
      scansPerMonth: 25,
      models: ["sonnet"],
      exports: ["png", "svg", "json"],
      nodeDescriptions: true,
      nodeLocking: true,
      connectionTypes: false,
      customSubtypes: false,
      alternatives: true,
      prdExport: false,
      collaboration: false,
      serverManagedAi: false,
      byok: true,
    },
  },
  pro: {
    key: "pro",
    name: "Studio",
    shortName: "Studio",
    description: "BYOK workspace controls for startup teams and developer tools.",
    cta: "Go Studio",
    bullets: [
      "Bring your own Anthropic key",
      "Unlimited active projects",
      "150 repository scans per month",
      "Opus 4.1, Opus 4, and Sonnet 4 model access",
      "PRD and YAML exports",
      "Team workspaces, comments, and templates",
      "Custom node subtype system",
    ],
    featured: false,
    billing: {
      monthlyPrice: 14,
      annualPrice: 11,
      monthlyStripePriceId: "",
      annualStripePriceId: "",
    },
    features: {
      projects: "unlimited",
      messagesPerMonth: "byok",
      scansPerMonth: 150,
      models: ["sonnet", "opus", "opus-4.1"],
      exports: ["png", "svg", "json", "yaml"],
      nodeDescriptions: true,
      nodeLocking: true,
      connectionTypes: true,
      customSubtypes: true,
      alternatives: true,
      prdExport: true,
      collaboration: true,
      serverManagedAi: false,
      byok: true,
    },
  },
};

export const PLAN_CONFIG = DEFAULT_PLAN_CATALOG;

function deepMergePlan(defaultPlan: PlanCatalogEntry, override: Partial<PlanCatalogEntry>) {
  return {
    ...defaultPlan,
    ...override,
    billing: {
      ...defaultPlan.billing,
      ...override.billing,
    },
    features: {
      ...defaultPlan.features,
      ...override.features,
    },
    bullets: override.bullets ?? defaultPlan.bullets,
    key: defaultPlan.key,
  };
}

export function normalizePlanCatalog(value: unknown): PlanCatalog {
  const partial =
    typeof value === "object" && value !== null ? (value as Partial<PlanCatalog>) : {};
  const merged = {
    free: deepMergePlan(DEFAULT_PLAN_CATALOG.free, partial.free ?? {}),
    starter: deepMergePlan(DEFAULT_PLAN_CATALOG.starter, partial.starter ?? {}),
    pro: deepMergePlan(DEFAULT_PLAN_CATALOG.pro, partial.pro ?? {}),
  };
  return planCatalogSchema.parse(merged);
}

export function parsePlanCatalogJson(value: string | null | undefined): PlanCatalog {
  if (!value) return DEFAULT_PLAN_CATALOG;
  try {
    return normalizePlanCatalog(JSON.parse(value));
  } catch {
    return DEFAULT_PLAN_CATALOG;
  }
}

export function redactPlanCatalog(catalog: PlanCatalog): PublicPlanCatalog {
  return {
    free: redactPlan(catalog.free),
    starter: redactPlan(catalog.starter),
    pro: redactPlan(catalog.pro),
  };
}

function redactPlan(plan: PlanCatalogEntry): PublicPlanCatalogEntry {
  const { monthlyStripePriceId: _monthly, annualStripePriceId: _annual, ...billing } = plan.billing;
  return { ...plan, billing };
}

export function getPlanLabel(plan: string | null | undefined, catalog = DEFAULT_PLAN_CATALOG) {
  const publicPlan = getPublicPlan(plan);
  return catalog[publicPlan].name;
}

export function getPublicPlan(plan: string | null | undefined): PublicPlanKey {
  if (plan === "starter") return "starter";
  if (plan === "pro" || plan === "team" || plan === "team5" || plan === "team15") return "pro";
  return "free";
}

export function isUnlimited(value: unknown): value is "unlimited" {
  return value === "unlimited";
}
