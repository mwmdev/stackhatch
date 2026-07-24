import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openDB } from "idb";
import { createId } from "@/lib/id";
import { createProviderKeyManager, deleteProviderCredentialDatabase } from "@/lib/provider-key";
import { createVaultRepository, type VaultRepository } from "./repository";
import { deleteVaultDatabase, openStackHatchVault } from "./indexed-db";
import type { StackHatchVaultDatabase } from "./schema";
import { clearAllDeviceData } from "./clear";

const vaultNames = new Set<string>();
const credentialNames = new Set<string>();
const repositories = new Set<VaultRepository>();

function immediateLock() {
  return {
    withGlobalLock: <T>(callback: () => T | PromiseLike<T>) => Promise.resolve(callback()),
    withProjectLock: <T>(_id: string, callback: () => T | PromiseLike<T>) =>
      Promise.resolve(callback()),
    withGlobalProjectLock: <T>(_id: string, callback: () => T | PromiseLike<T>) =>
      Promise.resolve(callback()),
  };
}

async function fixture(label: string) {
  const vaultName = `stackhatch-clear-${label}-${createId()}`;
  const credentialName = `stackhatch-clear-credentials-${label}-${createId()}`;
  vaultNames.add(vaultName);
  credentialNames.add(credentialName);
  const repository = createVaultRepository({
    databaseFactory: () => openStackHatchVault({ name: vaultName }),
    invalidationChannel: null,
    generationFactory: () => createId(),
  });
  repositories.add(repository);
  const keyManager = createProviderKeyManager({ databaseName: credentialName });
  const generation = await repository.getGeneration();
  await repository.saveProjectBundle(
    {
      project: {
        id: "project-1",
        name: "Local map",
        description: null,
        repoUrl: null,
        canvasState: { nodes: [], edges: [] },
        createdAt: 1,
        updatedAt: 1,
      },
    },
    { expectedGeneration: generation, expectedProjectRevision: null }
  );
  await keyManager.initialize();
  await keyManager.rememberKey("sk-ant-remembered");
  return { vaultName, credentialName, repository, keyManager, generation };
}

afterEach(async () => {
  for (const repository of repositories) repository.close();
  await Promise.all([...vaultNames].map((name) => deleteVaultDatabase(name)));
  await Promise.all([...credentialNames].map((name) => deleteProviderCredentialDatabase(name)));
  repositories.clear();
  vaultNames.clear();
  credentialNames.clear();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("clear local device data", () => {
  it("forgets credentials, deletes every owned database, and reopens at first launch", async () => {
    const current = await fixture("success");
    window.localStorage.setItem("theme", "dark");
    window.sessionStorage.setItem("stackhatch:project-start-method", "blank");

    await clearAllDeviceData({
      repository: current.repository,
      keyManager: current.keyManager,
      vaultDatabaseName: current.vaultName,
      credentialDatabaseName: current.credentialName,
      lockCoordinator: immediateLock(),
      localStorage: window.localStorage,
      sessionStorage: window.sessionStorage,
    });

    const reopened = createVaultRepository({
      databaseFactory: () => openStackHatchVault({ name: current.vaultName }),
      invalidationChannel: null,
    });
    repositories.add(reopened);
    expect(await reopened.listProjects()).toEqual([]);
    const reopenedKey = createProviderKeyManager({ databaseName: current.credentialName });
    await expect(reopenedKey.initialize()).resolves.toMatchObject({ state: "absent" });
    reopenedKey.close();
    expect(window.localStorage.getItem("theme")).toBeNull();
    expect(window.sessionStorage.getItem("stackhatch:project-start-method")).toBeNull();
  });

  it("does not report success while another tab blocks deletion", async () => {
    const current = await fixture("blocked");
    const blocker = await openDB(current.vaultName);
    let completed = false;
    const onBlocked = vi.fn();

    const clearing = clearAllDeviceData({
      repository: current.repository,
      keyManager: current.keyManager,
      vaultDatabaseName: current.vaultName,
      credentialDatabaseName: current.credentialName,
      lockCoordinator: immediateLock(),
      onBlocked,
    }).then(() => {
      completed = true;
    });

    await vi.waitFor(() => expect(onBlocked).toHaveBeenCalledWith("vault"));
    expect(completed).toBe(false);
    blocker.close();
    await clearing;
    expect(completed).toBe(true);
  });

  it("rejects a stale tab write after clear advances the vault generation", async () => {
    const current = await fixture("stale");
    const stale = createVaultRepository({
      databaseFactory: () => openDB<StackHatchVaultDatabase>(current.vaultName),
      invalidationChannel: null,
    });
    repositories.add(stale);
    const staleProject = await stale.getProject("project-1");
    expect(staleProject).not.toBeNull();

    const clearing = clearAllDeviceData({
      repository: current.repository,
      keyManager: current.keyManager,
      vaultDatabaseName: current.vaultName,
      credentialDatabaseName: current.credentialName,
      lockCoordinator: immediateLock(),
    });

    await vi.waitFor(async () => expect(await stale.getGeneration()).not.toBe(current.generation));
    await expect(
      stale.saveProjectBundle(
        {
          project: {
            ...staleProject!,
            name: "Stale recreation",
            updatedAt: 2,
          },
        },
        {
          expectedGeneration: current.generation,
          expectedProjectRevision: staleProject!.revision,
        }
      )
    ).rejects.toMatchObject({ code: "stale-generation" });
    stale.close();
    await clearing;
  });
});
