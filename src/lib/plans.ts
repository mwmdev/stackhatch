import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db";
import { subscriptions, type UserRole } from "@/db/schema";
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

  if (!subscription) return "free";
  if (subscription.currentPeriodEnd && subscription.currentPeriodEnd < Date.now()) return "free";
  return getPublicPlan(subscription.plan);
}
