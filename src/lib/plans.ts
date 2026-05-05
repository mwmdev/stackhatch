import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db";
import { settings, subscriptions, type UserRole } from "@/db/schema";
import { isPaidTierRole } from "@/lib/roles";
export {
  DEFAULT_PLAN_CATALOG,
  DIAGRAM_EXPORT_FORMATS,
  getPlanLabel,
  getPublicPlan,
  isUnlimited,
  normalizePlanCatalog,
  parsePlanCatalogJson,
  PLAN_CONFIG,
  planCatalogSchema,
  redactPlanCatalog,
  type BillingInterval,
  type CheckoutPlanKey,
  type DiagramExportFormat,
  type LimitValue,
  type PlanCatalog,
  type PlanCatalogEntry,
  type PlanFeatures,
  type PublicPlanCatalog,
  type PublicPlanCatalogEntry,
  type PublicPlanKey,
  type UsageLimitValue,
} from "@/lib/plan-config";
import {
  parsePlanCatalogJson,
  getPublicPlan,
  type PlanCatalog,
  type PlanFeatures,
  type PublicPlanKey,
} from "@/lib/plan-config";

export const PLAN_CATALOG_SETTING_KEY = "planCatalog";

export function getPlanCatalog(db: AppDatabase): PlanCatalog {
  const row = db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, PLAN_CATALOG_SETTING_KEY))
    .get();
  return parsePlanCatalogJson(row?.value);
}

export function savePlanCatalog(db: AppDatabase, catalog: PlanCatalog) {
  const value = JSON.stringify(catalog);
  const existing = db
    .select({ key: settings.key })
    .from(settings)
    .where(eq(settings.key, PLAN_CATALOG_SETTING_KEY))
    .get();

  if (existing) {
    db.update(settings).set({ value }).where(eq(settings.key, PLAN_CATALOG_SETTING_KEY)).run();
  } else {
    db.insert(settings).values({ key: PLAN_CATALOG_SETTING_KEY, value }).run();
  }
}

export function getActivePlan(db: AppDatabase, userId: string, role: UserRole): PublicPlanKey {
  if (role === "admin") return "pro";

  const subscription = db
    .select({
      plan: subscriptions.plan,
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
    })
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
    .get();

  if (
    subscription &&
    (!subscription.currentPeriodEnd || subscription.currentPeriodEnd >= Date.now())
  ) {
    const plan = getPublicPlan(subscription.plan);
    if (plan !== "free") return plan;
  }

  if (isPaidTierRole(role)) return role;

  return "free";
}

export function getPlanFeatures(db: AppDatabase, plan: PublicPlanKey): PlanFeatures {
  return getPlanCatalog(db)[plan].features;
}

export function getEffectivePlanFeatures(db: AppDatabase, userId: string, role: UserRole) {
  const plan = getActivePlan(db, userId, role);
  const catalog = getPlanCatalog(db);
  return {
    plan,
    planConfig: catalog[plan],
    features: catalog[plan].features,
    catalog,
  };
}
