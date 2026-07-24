import { createId } from "@/lib/id";
import { VAULT_STORE_NAMES, type VaultStoreName } from "./schema";
import { VaultUnavailableError } from "./storage-status";

export const VAULT_INVALIDATION_CHANNEL = "stackhatch:vault:invalidation";
export const GLOBAL_VAULT_LOCK = "stackhatch:vault:global";

export function projectVaultLock(projectId: string) {
  return `stackhatch:vault:project:${projectId}`;
}

export interface VaultInvalidation {
  sourceId: string;
  generation: string;
  projectId: string | null;
  projectRevision: number | null;
  stores: VaultStoreName[];
  reason: "mutation" | "deletion" | "generation";
}

export type VaultInvalidationWrite = Omit<VaultInvalidation, "sourceId">;

export interface BroadcastChannelLike {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
  close(): void;
}

export interface VaultInvalidationChannel {
  publish(invalidation: VaultInvalidationWrite): void;
  subscribe(listener: (invalidation: VaultInvalidation) => void): () => void;
  close(): void;
}

interface InvalidationChannelOptions {
  sourceId?: string;
  name?: string;
  channelFactory?: (name: string) => BroadcastChannelLike;
}

const vaultStoreNames = new Set<string>(VAULT_STORE_NAMES);

function isVaultInvalidation(value: unknown): value is VaultInvalidation {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<VaultInvalidation>;
  return (
    typeof candidate.sourceId === "string" &&
    typeof candidate.generation === "string" &&
    (candidate.projectId === null || typeof candidate.projectId === "string") &&
    (candidate.projectRevision === null || typeof candidate.projectRevision === "number") &&
    Array.isArray(candidate.stores) &&
    candidate.stores.every(
      (storeName) => typeof storeName === "string" && vaultStoreNames.has(storeName)
    ) &&
    (candidate.reason === "mutation" ||
      candidate.reason === "deletion" ||
      candidate.reason === "generation")
  );
}

export function createVaultInvalidationChannel(
  options: InvalidationChannelOptions = {}
): VaultInvalidationChannel {
  const sourceId = options.sourceId ?? createId();
  const channelFactory =
    options.channelFactory ??
    ((name: string) => {
      if (typeof BroadcastChannel === "undefined") {
        throw new VaultUnavailableError("BroadcastChannel is unavailable");
      }
      return new BroadcastChannel(name);
    });
  const channel = channelFactory(options.name ?? VAULT_INVALIDATION_CHANNEL);
  const listeners = new Set<(invalidation: VaultInvalidation) => void>();

  channel.onmessage = (event) => {
    if (!isVaultInvalidation(event.data) || event.data.sourceId === sourceId) {
      return;
    }
    for (const listener of listeners) listener(event.data);
  };

  return {
    publish(invalidation) {
      channel.postMessage({ ...invalidation, sourceId } satisfies VaultInvalidation);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      listeners.clear();
      channel.close();
    },
  };
}

export interface LockManagerLike {
  request<T>(
    name: string,
    options: { mode: "exclusive"; signal?: AbortSignal },
    callback: () => T | PromiseLike<T>
  ): Promise<T>;
}

export interface VaultLockCoordinator {
  withGlobalLock<T>(callback: () => T | PromiseLike<T>, signal?: AbortSignal): Promise<T>;
  withProjectLock<T>(
    projectId: string,
    callback: () => T | PromiseLike<T>,
    signal?: AbortSignal
  ): Promise<T>;
  withGlobalProjectLock<T>(
    projectId: string,
    callback: () => T | PromiseLike<T>,
    signal?: AbortSignal
  ): Promise<T>;
}

interface LockCoordinatorOptions {
  lockManager?: LockManagerLike;
}

export function createVaultLockCoordinator(
  options: LockCoordinatorOptions = {
    lockManager: globalThis.navigator?.locks,
  }
): VaultLockCoordinator {
  const lockManager = options.lockManager;
  if (!lockManager) {
    throw new VaultUnavailableError("Web Locks are unavailable");
  }

  const request = <T>(name: string, callback: () => T | PromiseLike<T>, signal?: AbortSignal) =>
    lockManager.request(name, { mode: "exclusive", ...(signal ? { signal } : {}) }, callback);

  return {
    withGlobalLock(callback, signal) {
      return request(GLOBAL_VAULT_LOCK, callback, signal);
    },
    withProjectLock(projectId, callback, signal) {
      return request(projectVaultLock(projectId), callback, signal);
    },
    withGlobalProjectLock(projectId, callback, signal) {
      return request(
        GLOBAL_VAULT_LOCK,
        () => request(projectVaultLock(projectId), callback, signal),
        signal
      );
    },
  };
}
