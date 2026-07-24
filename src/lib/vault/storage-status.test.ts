import { describe, expect, it } from "vitest";
import {
  VaultCommitError,
  VaultUnavailableError,
  inspectVaultStorage,
  normalizeVaultError,
} from "./storage-status";

describe("vault storage status", () => {
  it.each([
    ["QuotaExceededError", "quota"],
    ["SecurityError", "security"],
    ["InvalidStateError", "unavailable"],
    ["NotSupportedError", "unavailable"],
  ] as const)("normalizes %s failures as %s", (name, code) => {
    const error = normalizeVaultError(new DOMException("browser failure", name));

    expect(error).toMatchObject({ code, retryable: code !== "security" });
  });

  it("preserves typed vault errors and treats transaction aborts as commit failures", () => {
    const unavailable = new VaultUnavailableError("IndexedDB is unavailable");

    expect(normalizeVaultError(unavailable)).toBe(unavailable);
    expect(normalizeVaultError(new DOMException("aborted", "AbortError"))).toBeInstanceOf(
      VaultCommitError
    );
  });

  it("reports usage, quota, pressure, and persistence without mutating storage", async () => {
    const status = await inspectVaultStorage({
      estimate: async () => ({ usage: 25, quota: 100 }),
      persisted: async () => true,
    });

    expect(status).toEqual({
      state: "available",
      usage: 25,
      quota: 100,
      usageRatio: 0.25,
      persisted: true,
      error: null,
    });
  });

  it("returns an unavailable state when the StorageManager cannot be used", async () => {
    const status = await inspectVaultStorage(undefined);

    expect(status).toMatchObject({
      state: "unavailable",
      usage: null,
      quota: null,
      persisted: null,
      error: expect.objectContaining({ code: "unavailable" }),
    });
  });
});
