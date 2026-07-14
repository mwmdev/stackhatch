import { describe, expect, it } from "vitest";
import { getRoleLabel, normalizeUserRole, USER_ROLE_OPTIONS, USER_ROLE_VALUES } from "@/lib/roles";

describe("roles", () => {
  it("exposes only user and admin roles", () => {
    expect(USER_ROLE_VALUES).toEqual(["user", "admin"]);
    expect(USER_ROLE_OPTIONS).toEqual([
      { value: "user", label: "User" },
      { value: "admin", label: "Admin" },
    ]);
  });

  it("defaults every non-admin value to user", () => {
    expect(normalizeUserRole("user")).toBe("user");
    expect(normalizeUserRole(undefined)).toBe("user");
    expect(normalizeUserRole("unexpected")).toBe("user");
  });

  it("uses permission labels", () => {
    expect(getRoleLabel("user")).toBe("User");
    expect(getRoleLabel("admin")).toBe("Admin");
  });
});
