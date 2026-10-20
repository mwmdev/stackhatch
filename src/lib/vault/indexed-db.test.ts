import "fake-indexeddb/auto";
import { openDB, type IDBPDatabase } from "idb";
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
  type VaultCanvasState,
} from "./schema";

const openedNames = new Set<string>();

interface LegacyTemplateDatabase extends StackHatchVaultDatabase {
  templates: {
    key: string;
    value: {
      id: string;
      name: string;
      description: string | null;
      canvasState: VaultCanvasState;
      revision: number;
      createdAt: number;
      updatedAt: number;
    };
    indexes: {
      "by-created": [number, string];
    };
  };
}

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

  it("keeps legacy edges automatic and excludes old writers after the connection-side upgrade", async () => {
    const name = databaseName("connection-sides");
    const previous = await openStackHatchVault({ name, version: 3 });
    const project = {
      id: "project-1",
      name: "Existing map",
      description: null,
      repoUrl: null,
      canvasState: {
        nodes: ["a", "b"].map((id) => ({
          id,
          category: "services" as const,
          subtype: "custom",
          name: id,
          technology: "",
          description: "",
          reasoning: "",
          locked: false,
        })),
        edges: [
          { id: "edge", source: "a", target: "b", connectionType: "http" as const, label: "" },
        ],
      },
      revision: 2,
      createdAt: 10,
      updatedAt: 20,
    };
    await previous.put("projects", project);
    previous.close();

    const upgraded = await openStackHatchVault({ name });
    expect(await upgraded.get("projects", project.id)).toEqual(project);
    expect(await upgraded.get("meta", VAULT_META_ID)).toMatchObject({
      schemaVersion: VAULT_SCHEMA_VERSION,
    });
    upgraded.close();
    await expect(openDB(name, 3)).rejects.toMatchObject({ name: "VersionError" });
  });

  it("deletes retired templates when upgrading a version-two vault without losing other data", async () => {
    const name = databaseName("remove-templates");
    const versionTwo = await openStackHatchVault({
      name,
      version: 2,
      generationFactory: () => "generation-v2",
      now: () => 10,
    });
    await versionTwo.put("projects", {
      id: "project-1",
      name: "Surviving map",
      description: null,
      repoUrl: null,
      canvasState: null,
      revision: 1,
      createdAt: 10,
      updatedAt: 10,
    });
    await (versionTwo as unknown as IDBPDatabase<LegacyTemplateDatabase>).put("templates", {
      id: "template-1",
      name: "Retired template",
      description: null,
      canvasState: { nodes: [], edges: [] },
      revision: 1,
      createdAt: 10,
      updatedAt: 10,
    });
    versionTwo.close();

    const upgraded = await openStackHatchVault({ name, now: () => 20 });

    expect([...upgraded.objectStoreNames]).not.toContain("templates");
    expect(await upgraded.get("projects", "project-1")).toMatchObject({
      name: "Surviving map",
      revision: 1,
    });
    expect(await upgraded.get("meta", VAULT_META_ID)).toMatchObject({
      id: VAULT_META_ID,
      generation: "generation-v2",
      createdAt: 10,
      updatedAt: 20,
    });
    upgraded.close();
  });

  it("reports a blocked upgrade and completes after the blocking connection closes", async () => {
    const name = databaseName("blocked");
    const blocker = await openDB<LegacyTemplateDatabase>(name, 1, {
      upgrade: (database, oldVersion, newVersion, transaction) =>
        upgradeVaultSchema(
          database as unknown as Parameters<typeof upgradeVaultSchema>[0],
          oldVersion,
          newVersion,
          transaction as unknown as Parameters<typeof upgradeVaultSchema>[3],
          {
            generationFactory: () => "blocked-generation",
            now: () => 1,
          }
        ),
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
