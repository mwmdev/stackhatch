import { deleteDB, openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from "idb";
import { AI_PROVIDER_IDS, AI_PROVIDERS, type AiProviderId } from "@/lib/ai/providers";
import { GITHUB_CREDENTIAL_ID, type GitHubCredentialId } from "@/lib/github-token";
import { createId } from "@/lib/id";
import { normalizeVaultError } from "@/lib/vault/storage-status";

export const PROVIDER_CREDENTIAL_DATABASE_NAME = "stackhatch-credentials";
/**
 * v2 gave every provider its own credential generation. Credentials added
 * since then get theirs when the store opens, not through a version bump, so
 * an older build can still open the store.
 */
const PROVIDER_CREDENTIAL_SCHEMA_VERSION = 2;

/** Every credential the store holds: one key per AI provider, and the GitHub token. */
export type CredentialId = AiProviderId | GitHubCredentialId;
const CREDENTIAL_IDS: readonly CredentialId[] = [...AI_PROVIDER_IDS, GITHUB_CREDENTIAL_ID];

type CredentialMetaId = "credential-generation" | `credential-generation:${CredentialId}`;

interface CredentialMetaRecord {
  id: CredentialMetaId;
  generation: string;
  updatedAt: number;
}

interface RememberedCredentialRecord {
  id: CredentialId;
  key: string;
  generation: string;
  updatedAt: number;
}

interface ProviderCredentialDatabase extends DBSchema {
  meta: {
    key: CredentialMetaId;
    value: CredentialMetaRecord;
  };
  credentials: {
    key: CredentialId;
    value: RememberedCredentialRecord;
  };
}

/** Anthropic was the only provider in v1, so it keeps that generation record. */
function credentialMetaId(provider: CredentialId): CredentialMetaId {
  return provider === "anthropic" ? "credential-generation" : `credential-generation:${provider}`;
}

/** How messages name a credential: "OpenAI key", "GitHub token". */
function credentialName(provider: CredentialId): string {
  return provider === GITHUB_CREDENTIAL_ID ? "GitHub token" : `${AI_PROVIDERS[provider].name} key`;
}

function apiCredentialName(provider: CredentialId): string {
  return provider === GITHUB_CREDENTIAL_ID
    ? "GitHub token"
    : `${AI_PROVIDERS[provider].name} API key`;
}

/** The AI provider a missing-key error names; the GitHub token is not one. */
function errorProvider(provider: CredentialId): AiProviderId | null {
  return provider === GITHUB_CREDENTIAL_ID ? null : provider;
}

export type ProviderKeyState = "absent" | "session" | "remembered";

export interface CredentialStatus<T extends CredentialId = CredentialId> {
  provider: T;
  state: ProviderKeyState;
  generation: string;
}

export type ProviderKeyStatus = CredentialStatus<AiProviderId>;
export type GitHubTokenStatus = CredentialStatus<GitHubCredentialId>;

export class ProviderKeyUnavailableError extends Error {
  /** The provider whose key is missing, when one is known. */
  readonly provider: AiProviderId | null;

  constructor(
    message = "An AI provider key is not available in this browser session",
    provider: AiProviderId | null = null
  ) {
    super(message);
    this.name = "ProviderKeyUnavailableError";
    this.provider = provider;
  }
}

interface CredentialMutationHooks {
  beforeCommit?: () => void | Promise<void>;
}

interface ProviderKeyManagerOptions {
  databaseName?: string;
  generationFactory?: () => string;
  now?: () => number;
}

/**
 * Credentials are held per provider, and the GitHub token is held the same
 * way. Each has its own generation, so changing or forgetting one never
 * invalidates another or the requests made with it.
 */
export interface ProviderKeyManager {
  getStatus<T extends CredentialId>(provider: T): Promise<CredentialStatus<T>>;
  useSessionKey<T extends CredentialId>(provider: T, key: string): Promise<CredentialStatus<T>>;
  rememberKey<T extends CredentialId>(
    provider: T,
    key: string,
    hooks?: CredentialMutationHooks
  ): Promise<CredentialStatus<T>>;
  forgetKey<T extends CredentialId>(
    provider: T,
    hooks?: CredentialMutationHooks
  ): Promise<CredentialStatus<T>>;
  /** Forgets every active and remembered credential in one transaction. */
  forgetAllKeys(): Promise<void>;
  getKeyForDispatch(provider: CredentialId): Promise<string>;
  close(): void;
}

interface ActiveProviderKey {
  key: string;
  generation: string;
  remembered: boolean;
}

type CredentialWriteTransaction = IDBPTransaction<
  ProviderCredentialDatabase,
  ["meta", "credentials"],
  "readwrite"
>;

async function abortCredentialMutation(transaction: CredentialWriteTransaction) {
  try {
    transaction.abort();
  } catch {
    // IndexedDB may already have aborted the transaction.
  }
  try {
    await transaction.done;
  } catch {
    // The caller preserves the original mutation error.
  }
}

export function createProviderKeyManager(
  options: ProviderKeyManagerOptions = {}
): ProviderKeyManager {
  const databaseName = options.databaseName ?? PROVIDER_CREDENTIAL_DATABASE_NAME;
  const generationFactory = options.generationFactory ?? createId;
  const now = options.now ?? Date.now;
  let databasePromise: Promise<IDBPDatabase<ProviderCredentialDatabase>> | null = null;
  const activeKeys = new Map<CredentialId, ActiveProviderKey>();
  /** Counts committed key changes made by this manager. */
  let localChanges = 0;
  let closed = false;

  function database() {
    if (closed) {
      return Promise.reject(new ProviderKeyUnavailableError("Credential storage is closed"));
    }
    databasePromise ??= openDB<ProviderCredentialDatabase>(
      databaseName,
      PROVIDER_CREDENTIAL_SCHEMA_VERSION,
      {
        upgrade(database, oldVersion) {
          if (oldVersion < 1) {
            database.createObjectStore("meta", { keyPath: "id" });
            database.createObjectStore("credentials", { keyPath: "id" });
          }
        },
        blocking() {
          void databasePromise?.then((openDatabase) => openDatabase.close());
        },
      }
    ).then(async (openDatabase) => {
      await seedGenerations(openDatabase);
      return openDatabase;
    });
    return databasePromise;
  }

  /**
   * Gives every credential without one its first generation. Existing
   * generations, and the keys remembered under them, are kept.
   */
  async function seedGenerations(openDatabase: IDBPDatabase<ProviderCredentialDatabase>) {
    const transaction = openDatabase.transaction("meta", "readwrite");
    const meta = transaction.objectStore("meta");
    for (const provider of CREDENTIAL_IDS) {
      const id = credentialMetaId(provider);
      if (await meta.get(id)) continue;
      await meta.add({ id, generation: generationFactory(), updatedAt: now() });
    }
    await transaction.done;
  }

  function status<T extends CredentialId>(provider: T, generation: string): CredentialStatus<T> {
    const activeKey = activeKeys.get(provider);
    return {
      provider,
      state: activeKey ? (activeKey.remembered ? "remembered" : "session") : "absent",
      generation,
    };
  }

  async function synchronizeActiveKey(provider: CredentialId): Promise<string> {
    const changesBeforeRead = localChanges;
    const openDatabase = await database();
    const transaction = openDatabase.transaction(["meta", "credentials"], "readonly");
    const [meta, remembered] = await Promise.all([
      transaction.objectStore("meta").get(credentialMetaId(provider)),
      transaction.objectStore("credentials").get(provider),
    ]);
    await transaction.done;
    if (!meta) throw new ProviderKeyUnavailableError("Credential generation is unavailable");
    // A key this manager committed while the read was in flight is newer than
    // what was read; judging it by that read would drop an acknowledged key.
    if (localChanges !== changesBeforeRead) return synchronizeActiveKey(provider);

    if (activeKeys.get(provider)?.generation === meta.generation) return meta.generation;
    if (remembered?.generation === meta.generation) {
      activeKeys.set(provider, {
        key: remembered.key,
        generation: meta.generation,
        remembered: true,
      });
    } else {
      activeKeys.delete(provider);
    }
    return meta.generation;
  }

  async function readMeta(transaction: CredentialWriteTransaction, provider: CredentialId) {
    const meta = await transaction.objectStore("meta").get(credentialMetaId(provider));
    if (!meta) throw new ProviderKeyUnavailableError("Credential generation is unavailable");
    return meta;
  }

  function requireKey(provider: CredentialId, value: string) {
    const key = value.trim();
    if (!key) {
      throw new ProviderKeyUnavailableError(
        `Enter your ${apiCredentialName(provider)}`,
        errorProvider(provider)
      );
    }
    return key;
  }

  return {
    async getStatus(provider) {
      const generation = await synchronizeActiveKey(provider);
      return status(provider, generation);
    },
    async useSessionKey(provider, value) {
      const key = requireKey(provider, value);
      const openDatabase = await database();
      const transaction = openDatabase.transaction(["meta", "credentials"], "readwrite");
      try {
        const meta = await readMeta(transaction, provider);
        const remembered = await transaction.objectStore("credentials").get(provider);
        // Replacing a remembered key with a session key must revoke the
        // remembered copy in every tab, so the generation moves on.
        const generation = remembered ? generationFactory() : meta.generation;
        if (remembered) {
          await transaction.objectStore("meta").put({ ...meta, generation, updatedAt: now() });
          await transaction.objectStore("credentials").delete(provider);
        }
        await transaction.done;
        activeKeys.set(provider, { key, generation, remembered: false });
        localChanges += 1;
        return status(provider, generation);
      } catch (error) {
        await abortCredentialMutation(transaction);
        throw normalizeVaultError(
          error,
          `The session-only ${credentialName(provider)} could not be activated`
        );
      }
    },
    async rememberKey(provider, value, hooks = {}) {
      const key = requireKey(provider, value);
      const openDatabase = await database();
      const transaction = openDatabase.transaction(["meta", "credentials"], "readwrite");
      try {
        const meta = await readMeta(transaction, provider);
        await transaction.objectStore("credentials").put({
          id: provider,
          key,
          generation: meta.generation,
          updatedAt: now(),
        });
        await hooks.beforeCommit?.();
        await transaction.done;
        activeKeys.set(provider, { key, generation: meta.generation, remembered: true });
        localChanges += 1;
        return status(provider, meta.generation);
      } catch (error) {
        await abortCredentialMutation(transaction);
        throw normalizeVaultError(error, `The ${credentialName(provider)} was not remembered`);
      }
    },
    async forgetKey(provider, hooks = {}) {
      const openDatabase = await database();
      const transaction = openDatabase.transaction(["meta", "credentials"], "readwrite");
      try {
        const meta = await readMeta(transaction, provider);
        const generation = generationFactory();
        await transaction.objectStore("meta").put({ ...meta, generation, updatedAt: now() });
        await transaction.objectStore("credentials").delete(provider);
        await hooks.beforeCommit?.();
        await transaction.done;
        activeKeys.delete(provider);
        localChanges += 1;
        return status(provider, generation);
      } catch (error) {
        await abortCredentialMutation(transaction);
        throw normalizeVaultError(error, `The ${credentialName(provider)} was not forgotten`);
      }
    },
    async forgetAllKeys() {
      const openDatabase = await database();
      const transaction = openDatabase.transaction(["meta", "credentials"], "readwrite");
      try {
        for (const provider of CREDENTIAL_IDS) {
          const meta = await readMeta(transaction, provider);
          await transaction
            .objectStore("meta")
            .put({ ...meta, generation: generationFactory(), updatedAt: now() });
        }
        await transaction.objectStore("credentials").clear();
        await transaction.done;
        activeKeys.clear();
        localChanges += 1;
      } catch (error) {
        await abortCredentialMutation(transaction);
        throw normalizeVaultError(error, "Provider keys were not forgotten");
      }
    },
    async getKeyForDispatch(provider) {
      await synchronizeActiveKey(provider);
      const activeKey = activeKeys.get(provider);
      if (!activeKey) {
        throw new ProviderKeyUnavailableError(
          `Your ${apiCredentialName(provider)} is not available in this browser session`,
          errorProvider(provider)
        );
      }
      return activeKey.key;
    },
    close() {
      if (closed) return;
      closed = true;
      activeKeys.clear();
      void databasePromise?.then((openDatabase) => openDatabase.close()).catch(() => undefined);
    },
  };
}

let browserProviderKeyManager: ProviderKeyManager | null = null;

export function getBrowserProviderKeyManager() {
  browserProviderKeyManager ??= createProviderKeyManager();
  return browserProviderKeyManager;
}

export async function deleteProviderCredentialDatabase(
  name = PROVIDER_CREDENTIAL_DATABASE_NAME,
  options: { blocked?: () => void } = {}
) {
  try {
    await deleteDB(name, { blocked: options.blocked });
  } catch (error) {
    throw normalizeVaultError(error, "Credential storage could not be deleted");
  }
}
