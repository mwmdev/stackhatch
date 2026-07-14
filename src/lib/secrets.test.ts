import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/secrets";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("encrypted user secrets", () => {
  it("requires a dedicated encryption key in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STACKHATCH_ENCRYPTION_KEY", "");
    vi.stubEnv("AUTH_SECRET", "auth-is-not-an-encryption-key");
    vi.stubEnv("NEXTAUTH_SECRET", "legacy-auth-secret");

    expect(() => encryptSecret("sk-ant-private")).toThrow("Missing STACKHATCH_ENCRYPTION_KEY");
  });

  it("round-trips values with the production encryption key", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STACKHATCH_ENCRYPTION_KEY", "a-dedicated-production-key");

    const encrypted = encryptSecret("sk-ant-private");

    expect(encrypted).not.toContain("sk-ant-private");
    expect(decryptSecret(encrypted)).toBe("sk-ant-private");
  });

  it("keeps the development fallback for local setup", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("STACKHATCH_ENCRYPTION_KEY", "");
    vi.stubEnv("AUTH_SECRET", "local-auth-secret");

    expect(decryptSecret(encryptSecret("local-value"))).toBe("local-value");
  });
});
