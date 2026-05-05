import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db";
import { subscriptions, type UserRole } from "@/db/schema";
import { isPaidTierRole } from "@/lib/roles";
export {
  getPlanLabel,
  getPublicPlan,
  isUnlimited,
  PLAN_CONFIG,
  type BillingInterval,
  type CheckoutPlanKey,
  type PublicPlanKey,
} from "@/lib/plan-config";
import { getPublicPlan, type PublicPlanKey } from "@/lib/plan-config";

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
