import { describe, expect, it, vi } from "vitest";
import {
  VaultCommitError,
  VaultUnavailableError,
  inspectVaultStorage,
  normalizeVaultError,
  requestVaultStoragePersistence,
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

  it("requests persistent storage automatically when the browser is using best effort", async () => {
    let persisted = false;
    const storageManager = {
      estimate: async () => ({ usage: 25, quota: 100 }),
      persisted: async () => persisted,
      persist: vi.fn(async () => {
        persisted = true;
        return true;
      }),
    };

    const status = await requestVaultStoragePersistence(storageManager);

    expect(storageManager.persist).toHaveBeenCalledTimes(1);
    expect(status.persisted).toBe(true);
  });

  it("does not request persistence again when the browser already granted it", async () => {
    const storageManager = {
      estimate: async () => ({ usage: 25, quota: 100 }),
      persisted: async () => true,
      persist: vi.fn(async () => true),
    };

    const status = await requestVaultStoragePersistence(storageManager);

    expect(storageManager.persist).not.toHaveBeenCalled();
    expect(status.persisted).toBe(true);
  });

  it("keeps best-effort status when the browser declines persistence", async () => {
    const storageManager = {
      estimate: async () => ({ usage: 25, quota: 100 }),
      persisted: async () => false,
      persist: vi.fn(async () => false),
    };

    const status = await requestVaultStoragePersistence(storageManager);

    expect(status.persisted).toBe(false);
    expect(storageManager.persist).toHaveBeenCalledTimes(1);
  });

  it("keeps best-effort status when persistence is unsupported", async () => {
    const status = await requestVaultStoragePersistence({
      estimate: async () => ({ usage: 25, quota: 100 }),
      persisted: async () => false,
    });

    expect(status.persisted).toBe(false);
  });

  it("keeps best-effort status when the persistence request fails", async () => {
    const storageManager = {
      estimate: async () => ({ usage: 25, quota: 100 }),
      persisted: async () => false,
      persist: vi.fn(async () => {
        throw new DOMException("permission unavailable", "NotAllowedError");
      }),
    };

    const status = await requestVaultStoragePersistence(storageManager);

    expect(storageManager.persist).toHaveBeenCalledTimes(1);
    expect(status.persisted).toBe(false);
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
