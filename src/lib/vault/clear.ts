import { deleteProviderCredentialDatabase, type ProviderKeyManager } from "@/lib/provider-key";
import { createVaultLockCoordinator, type VaultLockCoordinator } from "./coordination";
import { deleteVaultDatabase } from "./indexed-db";
import type { VaultRepository } from "./repository";

export type DeviceDataStore = "credentials" | "vault";

export interface ClearAllDeviceDataOptions {
  repository: VaultRepository;
  keyManager: ProviderKeyManager;
  vaultDatabaseName?: string;
  credentialDatabaseName?: string;
  lockCoordinator?: VaultLockCoordinator;
  localStorage?: Storage;
  sessionStorage?: Storage;
  onBlocked?: (store: DeviceDataStore) => void;
}

function removeOwnedBrowserStorage(storage: Storage | undefined, includeTheme = false) {
  if (!storage) return;

  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
    (key): key is string => key !== null
  );

  for (const key of keys) {
    if (key.startsWith("stackhatch:") || (includeTheme && key === "theme")) {
      storage.removeItem(key);
    }
  }
}

export async function clearAllDeviceData(options: ClearAllDeviceDataOptions) {
  const lockCoordinator = options.lockCoordinator ?? createVaultLockCoordinator();

  await lockCoordinator.withGlobalLock(async () => {
    const generation = await options.repository.getGeneration();

    // Make every coordinator holding the previous generation stale before
    // connections are closed and deletion begins.
    await options.repository.advanceVaultGeneration(generation);
    await options.keyManager.forgetKey();
    options.repository.close();
    options.keyManager.close();

    await deleteProviderCredentialDatabase(options.credentialDatabaseName, {
      blocked: () => options.onBlocked?.("credentials"),
    });
    await deleteVaultDatabase(options.vaultDatabaseName, {
      blocked: () => options.onBlocked?.("vault"),
    });

    removeOwnedBrowserStorage(options.sessionStorage);
    removeOwnedBrowserStorage(options.localStorage, true);
  });
}
