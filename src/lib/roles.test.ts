import { describe, expect, it } from "vitest";
import { getRoleForPlan, getRoleLabel, normalizeUserRole, USER_ROLE_OPTIONS } from "@/lib/roles";

describe("roles", () => {
  it("exposes tier roles plus admin in the admin selector order", () => {
    expect(USER_ROLE_OPTIONS).toEqual([
      { value: "free", label: "Free plan" },
      { value: "starter", label: "Builder" },
      { value: "pro", label: "Studio" },
      { value: "admin", label: "Admin" },
    ]);
  });

  it("normalizes legacy role values", () => {
    expect(normalizeUserRole("free-user")).toBe("free");
    expect(normalizeUserRole("paid-user")).toBe("pro");
  });

  it("maps billing plans to tier roles", () => {
    expect(getRoleForPlan("starter")).toBe("starter");
    expect(getRoleForPlan("pro")).toBe("pro");
    expect(getRoleForPlan("team")).toBe("pro");
  });

  it("uses plan labels for tier roles", () => {
    expect(getRoleLabel("starter")).toBe("Builder");
    expect(getRoleLabel("pro")).toBe("Studio");
    expect(getRoleLabel("admin")).toBe("Admin");
  });
});
