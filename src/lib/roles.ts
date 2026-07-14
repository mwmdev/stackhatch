import type { UserRole } from "@/db/schema";

export const USER_ROLE_VALUES = ["user", "admin"] as const;

export const USER_ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
];

export function normalizeUserRole(role: string | null | undefined): UserRole {
  return role === "admin" ? "admin" : "user";
}

export function getRoleLabel(role: string | null | undefined) {
  return normalizeUserRole(role) === "admin" ? "Admin" : "User";
}
