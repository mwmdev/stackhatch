import { describe, expect, it } from "vitest";
import { PLAN_CONFIG, type PublicPlanKey } from "@/lib/plan-config";

const PUBLIC_PLANS: PublicPlanKey[] = ["free", "starter", "pro"];

describe("PLAN_CONFIG", () => {
  it.each(PUBLIC_PLANS)("marks %s as BYOK for AI usage", (planKey) => {
    expect(PLAN_CONFIG[planKey].features.byok).toBe(true);
    expect(PLAN_CONFIG[planKey].features.serverManagedAi).toBe(false);
    expect(PLAN_CONFIG[planKey].features.messagesPerMonth).toBe("byok");
  });
});
