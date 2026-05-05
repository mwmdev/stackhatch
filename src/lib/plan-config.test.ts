import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAN_CATALOG,
  normalizePlanCatalog,
  PLAN_CONFIG,
  redactPlanCatalog,
  type PublicPlanKey,
} from "@/lib/plan-config";

const PUBLIC_PLANS: PublicPlanKey[] = ["free", "starter", "pro"];

describe("PLAN_CONFIG", () => {
  it.each(PUBLIC_PLANS)("marks %s as BYOK for AI usage", (planKey) => {
    expect(PLAN_CONFIG[planKey].features.byok).toBe(true);
    expect(PLAN_CONFIG[planKey].features.serverManagedAi).toBe(false);
    expect(PLAN_CONFIG[planKey].features.messagesPerMonth).toBe("byok");
  });

  it("uses Builder 5 as the seeded project limit", () => {
    expect(DEFAULT_PLAN_CATALOG.starter.features.projects).toBe(5);
  });

  it("merges partial catalog overrides with defaults", () => {
    const catalog = normalizePlanCatalog({
      starter: {
        name: "Launch",
        features: {
          projects: 8,
          alternatives: false,
        },
      },
    });

    expect(catalog.starter.name).toBe("Launch");
    expect(catalog.starter.features.projects).toBe(8);
    expect(catalog.starter.features.alternatives).toBe(false);
    expect(catalog.starter.features.exports).toEqual(["png", "svg", "json"]);
    expect(catalog.free.features.projects).toBe(2);
  });

  it("redacts Stripe price IDs from public catalog responses", () => {
    const catalog = normalizePlanCatalog({
      starter: {
        billing: {
          monthlyStripePriceId: "price_monthly",
          annualStripePriceId: "price_annual",
        },
      },
    });

    const publicCatalog = redactPlanCatalog(catalog);

    expect(publicCatalog.starter.billing).not.toHaveProperty("monthlyStripePriceId");
    expect(publicCatalog.starter.billing).not.toHaveProperty("annualStripePriceId");
    expect(publicCatalog.starter.billing.monthlyPrice).toBe(6);
  });
});
