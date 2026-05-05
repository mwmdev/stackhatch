import type { UserRole } from "@/db/schema";
import { getPublicPlan, PLAN_CONFIG } from "@/lib/plan-config";

export const USER_ROLE_VALUES = ["admin", "free", "starter", "pro"] as const;
export const PLAN_ROLE_VALUES = ["free", "starter", "pro"] as const;

export const USER_ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "free", label: PLAN_CONFIG.free.name },
  { value: "starter", label: PLAN_CONFIG.starter.name },
  { value: "pro", label: PLAN_CONFIG.pro.name },
  { value: "admin", label: "Admin" },
];

export function normalizeUserRole(role: string | null | undefined): UserRole {
  if (role === "admin" || role === "free" || role === "starter" || role === "pro") {
    return role;
  }
  if (role === "paid-user" || role === "team") return "pro";
  return "free";
}

export function getRoleLabel(role: string | null | undefined) {
  const normalized = normalizeUserRole(role);
  if (normalized === "admin") return "Admin";
  return PLAN_CONFIG[normalized].name;
}

export function isPaidTierRole(role: string | null | undefined): role is "starter" | "pro" {
  const normalized = normalizeUserRole(role);
  return normalized === "starter" || normalized === "pro";
}

export function getRoleForPlan(plan: string | null | undefined): Exclude<UserRole, "admin"> {
  return getPublicPlan(plan);
}
