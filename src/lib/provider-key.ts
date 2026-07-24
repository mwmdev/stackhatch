import { deleteDB, openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from "idb";
import { createId } from "@/lib/id";
import { normalizeVaultError } from "@/lib/vault/storage-status";

export const PROVIDER_CREDENTIAL_DATABASE_NAME = "stackhatch-credentials";
const PROVIDER_CREDENTIAL_SCHEMA_VERSION = 1;
const CREDENTIAL_META_ID = "credential-generation" as const;
const ANTHROPIC_CREDENTIAL_ID = "anthropic" as const;

interface CredentialMetaRecord {
  id: typeof CREDENTIAL_META_ID;
  generation: string;
  updatedAt: number;
}

interface RememberedCredentialRecord {
  id: typeof ANTHROPIC_CREDENTIAL_ID;
  key: string;
  generation: string;
  updatedAt: number;
}

interface ProviderCredentialDatabase extends DBSchema {
  meta: {
    key: typeof CREDENTIAL_META_ID;
    value: CredentialMetaRecord;
  };
  credentials: {
    key: typeof ANTHROPIC_CREDENTIAL_ID;
    value: RememberedCredentialRecord;
  };
}

export type ProviderKeyState = "absent" | "session" | "remembered";

export interface ProviderKeyStatus {
  state: ProviderKeyState;
  generation: string;
}

export class ProviderKeyUnavailableError extends Error {
  constructor(message = "An Anthropic API key is not available in this browser session") {
    super(message);
    this.name = "ProviderKeyUnavailableError";
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

export interface ProviderKeyManager {
  initialize(): Promise<ProviderKeyStatus>;
  getStatus(): Promise<ProviderKeyStatus>;
  useSessionKey(key: string): Promise<ProviderKeyStatus>;
  rememberKey(key: string, hooks?: CredentialMutationHooks): Promise<ProviderKeyStatus>;
  forgetKey(hooks?: CredentialMutationHooks): Promise<ProviderKeyStatus>;
  getKeyForDispatch(): Promise<string>;
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

function requireKey(value: string) {
  const key = value.trim();
  if (!key) throw new ProviderKeyUnavailableError("Enter an Anthropic API key");
  return key;
}

export function createProviderKeyManager(
  options: ProviderKeyManagerOptions = {}
): ProviderKeyManager {
  const databaseName = options.databaseName ?? PROVIDER_CREDENTIAL_DATABASE_NAME;
  const generationFactory = options.generationFactory ?? createId;
  const now = options.now ?? Date.now;
  let databasePromise: Promise<IDBPDatabase<ProviderCredentialDatabase>> | null = null;
  let activeKey: ActiveProviderKey | null = null;
  let closed = false;

  function database() {
    if (closed) {
      return Promise.reject(new ProviderKeyUnavailableError("Credential storage is closed"));
    }
    databasePromise ??= openDB<ProviderCredentialDatabase>(
      databaseName,
      PROVIDER_CREDENTIAL_SCHEMA_VERSION,
      {
        async upgrade(database, oldVersion, _newVersion, transaction) {
          if (oldVersion >= 1) return;
          const meta = database.createObjectStore("meta", { keyPath: "id" });
          database.createObjectStore("credentials", { keyPath: "id" });
          await meta.add({
            id: CREDENTIAL_META_ID,
            generation: generationFactory(),
            updatedAt: now(),
          });
          await transaction.done;
        },
        blocking() {
          void databasePromise?.then((openDatabase) => openDatabase.close());
        },
      }
    );
    return databasePromise;
  }

  async function readCredentialState() {
    const openDatabase = await database();
    const transaction = openDatabase.transaction(["meta", "credentials"], "readonly");
    const [meta, remembered] = await Promise.all([
      transaction.objectStore("meta").get(CREDENTIAL_META_ID),
      transaction.objectStore("credentials").get(ANTHROPIC_CREDENTIAL_ID),
    ]);
    await transaction.done;
    if (!meta) throw new ProviderKeyUnavailableError("Credential generation is unavailable");
    return { meta, remembered };
  }

  async function readGeneration() {
    const metadata = await (await database()).get("meta", CREDENTIAL_META_ID);
    if (!metadata) throw new ProviderKeyUnavailableError("Credential generation is unavailable");
    return metadata.generation;
  }

  function status(generation: string): ProviderKeyStatus {
    return {
      state: activeKey ? (activeKey.remembered ? "remembered" : "session") : "absent",
      generation,
    };
  }

  async function synchronizeActiveKey() {
    if (activeKey) {
      const generation = await readGeneration();
      if (activeKey.generation === generation) return generation;
      activeKey = null;
    }
    const { meta, remembered } = await readCredentialState();
    if (remembered?.generation === meta.generation) {
      activeKey = {
        key: remembered.key,
        generation: meta.generation,
        remembered: true,
      };
    }
    return meta.generation;
  }

  return {
    async initialize() {
      const generation = await synchronizeActiveKey();
      return status(generation);
    },
    async getStatus() {
      const generation = await synchronizeActiveKey();
      return status(generation);
    },
    async useSessionKey(value) {
      const key = requireKey(value);
      const openDatabase = await database();
      const transaction = openDatabase.transaction(["meta", "credentials"], "readwrite");
      try {
        const meta = await transaction.objectStore("meta").get(CREDENTIAL_META_ID);
        if (!meta) throw new ProviderKeyUnavailableError("Credential generation is unavailable");
        const remembered = await transaction
          .objectStore("credentials")
          .get(ANTHROPIC_CREDENTIAL_ID);
        const generation = remembered ? generationFactory() : meta.generation;
        if (remembered) {
          await transaction.objectStore("meta").put({
            ...meta,
            generation,
            updatedAt: now(),
          });
          await transaction.objectStore("credentials").delete(ANTHROPIC_CREDENTIAL_ID);
        }
        await transaction.done;
        activeKey = { key, generation, remembered: false };
        return status(generation);
      } catch (error) {
        await abortCredentialMutation(transaction);
        throw normalizeVaultError(error, "The session-only Anthropic key could not be activated");
      }
    },
    async rememberKey(value, hooks = {}) {
      const key = requireKey(value);
      const openDatabase = await database();
      const transaction = openDatabase.transaction(["meta", "credentials"], "readwrite");
      try {
        const meta = await transaction.objectStore("meta").get(CREDENTIAL_META_ID);
        if (!meta) throw new ProviderKeyUnavailableError("Credential generation is unavailable");
        await transaction.objectStore("credentials").put({
          id: ANTHROPIC_CREDENTIAL_ID,
          key,
          generation: meta.generation,
          updatedAt: now(),
        });
        await hooks.beforeCommit?.();
        await transaction.done;
        activeKey = { key, generation: meta.generation, remembered: true };
        return status(meta.generation);
      } catch (error) {
        await abortCredentialMutation(transaction);
        throw normalizeVaultError(error, "The Anthropic key was not remembered");
      }
    },
    async forgetKey(hooks = {}) {
      const openDatabase = await database();
      const transaction = openDatabase.transaction(["meta", "credentials"], "readwrite");
      try {
        const meta = await transaction.objectStore("meta").get(CREDENTIAL_META_ID);
        if (!meta) throw new ProviderKeyUnavailableError("Credential generation is unavailable");
        const generation = generationFactory();
        await transaction.objectStore("meta").put({
          ...meta,
          generation,
          updatedAt: now(),
        });
        await transaction.objectStore("credentials").delete(ANTHROPIC_CREDENTIAL_ID);
        await hooks.beforeCommit?.();
        await transaction.done;
        activeKey = null;
        return status(generation);
      } catch (error) {
        await abortCredentialMutation(transaction);
        throw normalizeVaultError(error, "The Anthropic key was not forgotten");
      }
    },
    async getKeyForDispatch() {
      await synchronizeActiveKey();
      if (!activeKey) throw new ProviderKeyUnavailableError();
      return activeKey.key;
    },
    close() {
      if (closed) return;
      closed = true;
      activeKey = null;
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
