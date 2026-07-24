export type VaultErrorCode =
  | "quota"
  | "security"
  | "unavailable"
  | "conflict"
  | "stale-generation"
  | "commit"
  | "validation";

export class VaultError extends Error {
  constructor(
    public readonly code: VaultErrorCode,
    message: string,
    public readonly retryable: boolean,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "VaultError";
  }
}

export class VaultUnavailableError extends VaultError {
  constructor(message = "Browser storage is unavailable", options?: ErrorOptions) {
    super("unavailable", message, true, options);
    this.name = "VaultUnavailableError";
  }
}

export class VaultCommitError extends VaultError {
  constructor(message = "The browser storage transaction did not commit", options?: ErrorOptions) {
    super("commit", message, true, options);
    this.name = "VaultCommitError";
  }
}

export class VaultConflictError extends VaultError {
  constructor(
    public readonly expectedRevision: number | null,
    public readonly actualRevision: number | null
  ) {
    super(
      "conflict",
      `The local record changed (expected revision ${expectedRevision ?? "missing"}, found ${actualRevision ?? "missing"})`,
      true
    );
    this.name = "VaultConflictError";
  }
}

export class VaultGenerationConflictError extends VaultError {
  constructor(
    public readonly expectedGeneration: string,
    public readonly actualGeneration: string
  ) {
    super(
      "stale-generation",
      "This tab belongs to an older vault generation and must reload",
      false
    );
    this.name = "VaultGenerationConflictError";
  }
}

export class VaultValidationError extends VaultError {
  constructor(message: string) {
    super("validation", message, false);
    this.name = "VaultValidationError";
  }
}

export function normalizeVaultError(
  error: unknown,
  fallbackMessage = "The browser storage operation failed"
): VaultError {
  if (error instanceof VaultError) return error;

  if (error instanceof DOMException) {
    if (error.name === "QuotaExceededError") {
      return new VaultError("quota", "Browser storage quota was exceeded", true, {
        cause: error,
      });
    }
    if (error.name === "SecurityError") {
      return new VaultError("security", "Browser security settings denied storage access", false, {
        cause: error,
      });
    }
    if (error.name === "InvalidStateError" || error.name === "NotSupportedError") {
      return new VaultUnavailableError("IndexedDB is unavailable in this browser context", {
        cause: error,
      });
    }
    if (
      error.name === "AbortError" ||
      error.name === "ConstraintError" ||
      error.name === "TransactionInactiveError"
    ) {
      return new VaultCommitError(fallbackMessage, { cause: error });
    }
  }

  return new VaultCommitError(fallbackMessage, {
    cause: error instanceof Error ? error : undefined,
  });
}

export interface StorageManagerLike {
  estimate(): Promise<{ usage?: number; quota?: number }>;
  persisted?(): Promise<boolean>;
}

export interface VaultStorageStatus {
  state: "available" | "unavailable";
  usage: number | null;
  quota: number | null;
  usageRatio: number | null;
  persisted: boolean | null;
  error: VaultError | null;
}

export async function inspectVaultStorage(
  storageManager: StorageManagerLike | undefined = globalThis.navigator?.storage
): Promise<VaultStorageStatus> {
  if (!storageManager) {
    return {
      state: "unavailable",
      usage: null,
      quota: null,
      usageRatio: null,
      persisted: null,
      error: new VaultUnavailableError("The StorageManager API is unavailable"),
    };
  }

  try {
    const estimate = await storageManager.estimate();
    const usage = typeof estimate.usage === "number" ? estimate.usage : null;
    const quota = typeof estimate.quota === "number" ? estimate.quota : null;
    const persisted = storageManager.persisted ? await storageManager.persisted() : null;

    return {
      state: "available",
      usage,
      quota,
      usageRatio: usage !== null && quota !== null && quota > 0 ? usage / quota : null,
      persisted,
      error: null,
    };
  } catch (error) {
    return {
      state: "unavailable",
      usage: null,
      quota: null,
      usageRatio: null,
      persisted: null,
      error: normalizeVaultError(error, "Browser storage status could not be read"),
    };
  }
}
