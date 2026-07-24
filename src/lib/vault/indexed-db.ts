import { deleteDB, openDB, type IDBPDatabase, type IDBPTransaction } from "idb";
import { createId } from "@/lib/id";
import {
  VAULT_DATABASE_NAME,
  VAULT_META_ID,
  VAULT_SCHEMA_VERSION,
  type StackHatchVaultDatabase,
  type VaultStoreName,
} from "./schema";
import { normalizeVaultError } from "./storage-status";

export type VaultDatabase = IDBPDatabase<StackHatchVaultDatabase>;
export type VaultVersionChangeTransaction = IDBPTransaction<
  StackHatchVaultDatabase,
  VaultStoreName[],
  "versionchange"
>;
export type VaultDatabaseFactory = () => Promise<VaultDatabase>;

export type VaultOpenState =
  | { status: "opening"; name: string; version: number }
  | { status: "ready"; name: string; version: number }
  | {
      status: "blocked";
      name: string;
      currentVersion: number;
      requestedVersion: number | null;
    }
  | {
      status: "closed";
      name: string;
      reason: "versionchange";
      currentVersion: number;
      requestedVersion: number | null;
    }
  | { status: "terminated"; name: string };

interface UpgradeOptions {
  now?: () => number;
  generationFactory?: () => string;
}

export async function upgradeVaultSchema(
  database: VaultDatabase,
  oldVersion: number,
  newVersion: number | null,
  transaction: VaultVersionChangeTransaction,
  options: UpgradeOptions = {}
) {
  const targetVersion = newVersion ?? VAULT_SCHEMA_VERSION;
  const now = options.now ?? Date.now;
  const generationFactory = options.generationFactory ?? createId;
  const timestamp = now();

  if (oldVersion < 1 && targetVersion >= 1) {
    const meta = database.createObjectStore("meta", { keyPath: "id" });
    const projects = database.createObjectStore("projects", { keyPath: "id" });
    const messages = database.createObjectStore("messages", { keyPath: "id" });
    const templates = database.createObjectStore("templates", { keyPath: "id" });
    database.createObjectStore("preferences", { keyPath: "id" });
    database.createObjectStore("resume", { keyPath: "id" });
    const repositoryEvidence = database.createObjectStore("repositoryEvidence", { keyPath: "id" });
    database.createObjectStore("repositoryProvenance", {
      keyPath: "projectId",
    });

    projects.createIndex("by-updated", ["updatedAt", "createdAt", "id"]);
    messages.createIndex("by-project", "projectId");
    messages.createIndex("by-project-created", ["projectId", "createdAt", "id"]);
    templates.createIndex("by-created", ["createdAt", "id"]);
    repositoryEvidence.createIndex("by-project", "projectId");
    repositoryEvidence.createIndex("by-project-path", ["projectId", "path"], { unique: true });

    await meta.add({
      id: VAULT_META_ID,
      generation: generationFactory(),
      schemaVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  if (oldVersion < 2 && targetVersion >= 2) {
    const providerRuns = database.createObjectStore("providerRuns", {
      keyPath: "id",
    });
    providerRuns.createIndex("by-project", "projectId");
    providerRuns.createIndex("by-updated", ["updatedAt", "id"]);
  }

  const metadata = await transaction.objectStore("meta").get(VAULT_META_ID);
  if (metadata && metadata.schemaVersion !== targetVersion) {
    await transaction.objectStore("meta").put({
      ...metadata,
      schemaVersion: targetVersion,
      updatedAt: timestamp,
    });
  }
}

export interface OpenVaultOptions extends UpgradeOptions {
  name?: string;
  version?: number;
  onStateChange?: (state: VaultOpenState) => void;
}

export async function openStackHatchVault(options: OpenVaultOptions = {}): Promise<VaultDatabase> {
  const name = options.name ?? VAULT_DATABASE_NAME;
  const version = options.version ?? VAULT_SCHEMA_VERSION;
  const onStateChange = options.onStateChange;
  let database: VaultDatabase | undefined;

  onStateChange?.({ status: "opening", name, version });

  try {
    database = await openDB<StackHatchVaultDatabase>(name, version, {
      upgrade: (upgrading, oldVersion, newVersion, transaction) =>
        upgradeVaultSchema(upgrading, oldVersion, newVersion, transaction, {
          now: options.now,
          generationFactory: options.generationFactory,
        }),
      blocked(currentVersion, requestedVersion) {
        onStateChange?.({
          status: "blocked",
          name,
          currentVersion,
          requestedVersion,
        });
      },
      blocking(currentVersion, requestedVersion) {
        onStateChange?.({
          status: "closed",
          name,
          reason: "versionchange",
          currentVersion,
          requestedVersion,
        });
        database?.close();
      },
      terminated() {
        onStateChange?.({ status: "terminated", name });
      },
    });
  } catch (error) {
    throw normalizeVaultError(error, "The browser vault could not be opened");
  }

  onStateChange?.({ status: "ready", name, version: database.version });
  return database;
}

export function createVaultDatabaseFactory(options: OpenVaultOptions = {}): VaultDatabaseFactory {
  return () => openStackHatchVault(options);
}

export async function deleteVaultDatabase(name = VAULT_DATABASE_NAME) {
  try {
    await deleteDB(name);
  } catch (error) {
    throw normalizeVaultError(error, "The browser vault could not be deleted");
  }
}
