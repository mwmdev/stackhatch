import "fake-indexeddb/auto";
import { openDB } from "idb";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteVaultDatabase,
  openStackHatchVault,
  upgradeVaultSchema,
  type VaultOpenState,
} from "./indexed-db";
import {
  VAULT_META_ID,
  VAULT_SCHEMA_VERSION,
  VAULT_STORE_NAMES,
  type StackHatchVaultDatabase,
} from "./schema";

const openedNames = new Set<string>();

function databaseName(label: string) {
  const name = `stackhatch-test-${label}-${crypto.randomUUID()}`;
  openedNames.add(name);
  return name;
}

afterEach(async () => {
  await Promise.all([...openedNames].map((name) => deleteVaultDatabase(name)));
  openedNames.clear();
});

describe("IndexedDB vault lifecycle", () => {
  it("opens a fresh schema with a persistent generated vault identity", async () => {
    const name = databaseName("fresh");
    const states: VaultOpenState[] = [];
    const database = await openStackHatchVault({
      name,
      generationFactory: () => "generation-fresh",
      now: () => 42,
      onStateChange: (state) => states.push(state),
    });

    expect([...database.objectStoreNames].sort()).toEqual([...VAULT_STORE_NAMES].sort());
    expect(await database.get("meta", VAULT_META_ID)).toEqual({
      id: VAULT_META_ID,
      generation: "generation-fresh",
      schemaVersion: VAULT_SCHEMA_VERSION,
      createdAt: 42,
      updatedAt: 42,
    });
    expect(states.map((state) => state.status)).toEqual(["opening", "ready"]);
    database.close();

    const unusedGenerationFactory = vi.fn(() => "must-not-replace");
    const reopened = await openStackHatchVault({
      name,
      generationFactory: unusedGenerationFactory,
    });
    expect(await reopened.get("meta", VAULT_META_ID)).toMatchObject({
      generation: "generation-fresh",
    });
    expect(unusedGenerationFactory).not.toHaveBeenCalled();
    reopened.close();
  });

  it("upgrades a version-one vault sequentially without losing existing projects", async () => {
    const name = databaseName("upgrade");
    const versionOne = await openStackHatchVault({
      name,
      version: 1,
      generationFactory: () => "generation-v1",
      now: () => 10,
    });
    await versionOne.put("projects", {
      id: "project-1",
      name: "Before upgrade",
      description: null,
      repoUrl: null,
      canvasState: null,
      revision: 1,
      createdAt: 10,
      updatedAt: 10,
    });
    versionOne.close();

    const upgraded = await openStackHatchVault({ name, now: () => 20 });

    expect(upgraded.version).toBe(VAULT_SCHEMA_VERSION);
    expect(upgraded.objectStoreNames.contains("providerRuns")).toBe(true);
    expect(await upgraded.get("projects", "project-1")).toMatchObject({
      name: "Before upgrade",
      revision: 1,
    });
    expect(await upgraded.get("meta", VAULT_META_ID)).toMatchObject({
      generation: "generation-v1",
      schemaVersion: VAULT_SCHEMA_VERSION,
      updatedAt: 20,
    });
    upgraded.close();
  });

  it("reports a blocked upgrade and completes after the blocking connection closes", async () => {
    const name = databaseName("blocked");
    const blocker = await openDB<StackHatchVaultDatabase>(name, 1, {
      upgrade: (database, oldVersion, newVersion, transaction) =>
        upgradeVaultSchema(database, oldVersion, newVersion, transaction, {
          generationFactory: () => "blocked-generation",
          now: () => 1,
        }),
    });
    const onStateChange = vi.fn<(state: VaultOpenState) => void>();
    const upgrading = openStackHatchVault({ name, onStateChange });

    await vi.waitFor(() =>
      expect(onStateChange).toHaveBeenCalledWith(
        expect.objectContaining({ status: "blocked", currentVersion: 1 })
      )
    );
    blocker.close();

    const upgraded = await upgrading;
    expect(upgraded.version).toBe(VAULT_SCHEMA_VERSION);
    upgraded.close();
  });

  it("closes its connection on version change so a later schema can proceed", async () => {
    const name = databaseName("versionchange");
    const states: VaultOpenState[] = [];
    const versionOne = await openStackHatchVault({
      name,
      version: 1,
      onStateChange: (state) => states.push(state),
    });

    const versionTwo = await openStackHatchVault({ name });

    expect(states).toContainEqual(
      expect.objectContaining({ status: "closed", reason: "versionchange" })
    );
    expect(versionTwo.version).toBe(VAULT_SCHEMA_VERSION);
    versionOne.close();
    versionTwo.close();
  });
});
