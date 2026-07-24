"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { ArrowLeft, FolderPlus, KeyRound, Monitor, Moon, Sun } from "lucide-react";
import AppPageShell from "@/components/shells/AppPageShell";
import ThemeToggle from "@/components/ThemeToggle";
import IconControl from "@/components/ui/IconControl";
import CustomSubtypesSettings from "@/components/settings/CustomSubtypesSettings";
import DeviceDataSettings from "@/components/settings/DeviceDataSettings";
import { AI_MODELS, DEFAULT_AI_MODEL } from "@/lib/ai/models";
import type { CustomSubtypesMap } from "@/lib/custom-subtypes";
import {
  getBrowserProviderKeyManager,
  type ProviderKeyManager,
  type ProviderKeyStatus,
} from "@/lib/provider-key";
import {
  buildProjectStartPath,
  canonicalProjectStartPath,
  isPublicRepositorySlug,
  projectStartMethodFromPath,
  repositoryFromProjectStartPath,
  safeInternalPath,
  type ProjectStartMethod,
} from "@/lib/project-start";
import { exportVaultBackup, prepareBackupImport } from "@/lib/vault/backup";
import { clearAllDeviceData } from "@/lib/vault/clear";
import { createVaultRepository, type VaultRepository } from "@/lib/vault/repository";
import type { VaultDevicePreferencesRecord } from "@/lib/vault/schema";
import { inspectVaultStorage, type VaultStorageStatus } from "@/lib/vault/storage-status";

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

type SettingsLoadState = "loading" | "loaded" | "failed";

export interface DeviceSettingsServices {
  createRepository(): VaultRepository;
  getKeyManager(): ProviderKeyManager;
  inspectStorage(): Promise<VaultStorageStatus>;
  requestPersistentStorage(): Promise<VaultStorageStatus>;
  afterRestore(): void | Promise<void>;
  afterClear(): void | Promise<void>;
}

const browserServices: DeviceSettingsServices = {
  createRepository: createVaultRepository,
  getKeyManager: getBrowserProviderKeyManager,
  inspectStorage: inspectVaultStorage,
  async requestPersistentStorage() {
    await globalThis.navigator?.storage?.persist?.();
    return inspectVaultStorage();
  },
  afterRestore() {
    window.location.reload();
  },
  afterClear() {
    window.location.assign("/");
  },
};

interface PreferenceCursor {
  generation: string;
  record: VaultDevicePreferencesRecord | null;
}

function preferenceValues(
  record: VaultDevicePreferencesRecord | null,
  fallbackTheme: string | undefined
) {
  return {
    model: record?.model ?? DEFAULT_AI_MODEL,
    theme:
      record?.theme ??
      (fallbackTheme === "light" || fallbackTheme === "dark" || fallbackTheme === "system"
        ? fallbackTheme
        : "system"),
    customSubtypes: record?.customSubtypes ?? {},
    editorDisplay: record?.editorDisplay ?? {},
  } as const;
}

export function DeviceSettingsPage({
  services = browserServices,
}: {
  services?: DeviceSettingsServices;
}) {
  const { theme: currentTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [loadState, setLoadState] = useState<SettingsLoadState>("loading");
  const [preferences, setPreferences] = useState(() => preferenceValues(null, "system"));
  const [storageStatus, setStorageStatus] = useState<VaultStorageStatus | null>(null);
  const [keyStatus, setKeyStatus] = useState<ProviderKeyStatus | null>(null);
  const [savingKey, setSavingKey] = useState(false);
  const [savingPreference, setSavingPreference] = useState(false);
  const [returnTo, setReturnTo] = useState("/app");
  const [setupRepo, setSetupRepo] = useState<string | null>(null);
  const [setupMethod, setSetupMethod] = useState<ProjectStartMethod | null>(null);
  const [isAnthropicSetup, setIsAnthropicSetup] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const repositoryRef = useRef<VaultRepository | null>(null);
  const keyManagerRef = useRef<ProviderKeyManager | null>(null);
  const preferenceCursorRef = useRef<PreferenceCursor | null>(null);
  const initialThemeRef = useRef(currentTheme);
  const initialThemeSetterRef = useRef(setTheme);
  const keyInputRef = useRef<HTMLInputElement>(null);
  const rememberRef = useRef<HTMLInputElement>(null);
  const loadRequest = useRef(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const repo = params.get("repo")?.trim() || "";
    const legacyReturnTo = isPublicRepositorySlug(repo)
      ? buildProjectStartPath("repository", { repository: repo })
      : "/app";
    const internalReturnTo = safeInternalPath(params.get("returnTo"), legacyReturnTo);
    const safeReturnTo = canonicalProjectStartPath(internalReturnTo) ?? internalReturnTo;
    setReturnTo(safeReturnTo);
    setSetupMethod(projectStartMethodFromPath(safeReturnTo));
    setIsAnthropicSetup(params.get("setup") === "anthropic");
    setSetupRepo(
      repositoryFromProjectStartPath(safeReturnTo) || (legacyReturnTo !== "/app" ? repo : null)
    );
  }, []);

  const loadDeviceSettings = useCallback(async () => {
    const request = ++loadRequest.current;
    setLoadState("loading");
    setToast(null);
    repositoryRef.current?.close();
    const repository = services.createRepository();
    const keyManager = services.getKeyManager();
    repositoryRef.current = repository;
    keyManagerRef.current = keyManager;
    try {
      const [snapshot, nextKeyStatus, nextStorageStatus] = await Promise.all([
        repository.getDevicePreferencesSnapshot(),
        keyManager.initialize(),
        services.inspectStorage(),
      ]);
      if (request !== loadRequest.current) {
        repository.close();
        return;
      }
      preferenceCursorRef.current = {
        generation: snapshot.generation,
        record: snapshot.preferences,
      };
      const nextPreferences = preferenceValues(snapshot.preferences, initialThemeRef.current);
      setPreferences(nextPreferences);
      initialThemeSetterRef.current(nextPreferences.theme);
      setKeyStatus(nextKeyStatus);
      setStorageStatus(nextStorageStatus);
      setLoadState("loaded");
    } catch {
      if (request !== loadRequest.current) return;
      repository.close();
      if (repositoryRef.current === repository) repositoryRef.current = null;
      setLoadState("failed");
      setToast({
        type: "error",
        message: "Device settings could not be read from browser storage.",
      });
    }
  }, [services]);

  useEffect(() => {
    if (!mounted) return;
    void loadDeviceSettings();
    return () => {
      loadRequest.current += 1;
      repositoryRef.current?.close();
      repositoryRef.current = null;
    };
  }, [loadDeviceSettings, mounted]);

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
  }, []);

  const persistPreferences = useCallback(
    async (update: Partial<ReturnType<typeof preferenceValues>>) => {
      const repository = repositoryRef.current;
      const cursor = preferenceCursorRef.current;
      if (!repository || !cursor) throw new Error("Browser settings are not ready");
      const values = { ...preferenceValues(cursor.record, currentTheme), ...update };
      const saved = await repository.putDevicePreferences(values, {
        expectedGeneration: cursor.generation,
        expectedRevision: cursor.record?.revision ?? null,
      });
      preferenceCursorRef.current = { ...cursor, record: saved };
      setPreferences(values);
      return saved;
    },
    [currentTheme]
  );

  async function saveKey() {
    const input = keyInputRef.current;
    const manager = keyManagerRef.current;
    const key = input?.value.trim() ?? "";
    if (!manager || !key) {
      showToast("error", "Enter an Anthropic API key first.");
      return;
    }
    setSavingKey(true);
    try {
      const next = rememberRef.current?.checked
        ? await manager.rememberKey(key)
        : await manager.useSessionKey(key);
      input!.value = "";
      setKeyStatus(next);
      showToast(
        "success",
        next.state === "remembered"
          ? "Anthropic key remembered on this device."
          : "Anthropic key available for this browser session."
      );
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "The Anthropic key could not be saved."
      );
    } finally {
      setSavingKey(false);
    }
  }

  async function forgetKey() {
    const manager = keyManagerRef.current;
    if (!manager) return;
    setSavingKey(true);
    try {
      const next = await manager.forgetKey();
      if (keyInputRef.current) keyInputRef.current.value = "";
      setKeyStatus(next);
      showToast("success", "Active and remembered Anthropic key forgotten.");
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "The Anthropic key could not be forgotten."
      );
    } finally {
      setSavingKey(false);
    }
  }

  async function changeModel(model: string) {
    setSavingPreference(true);
    try {
      await persistPreferences({ model });
      showToast("success", "Default model saved on this device.");
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "The model could not be saved.");
    } finally {
      setSavingPreference(false);
    }
  }

  async function changeTheme(theme: "light" | "dark" | "system") {
    setTheme(theme);
    setSavingPreference(true);
    try {
      await persistPreferences({ theme });
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "The theme could not be saved.");
    } finally {
      setSavingPreference(false);
    }
  }

  async function saveCustomSubtypes(customSubtypes: CustomSubtypesMap) {
    const saved = await persistPreferences({ customSubtypes });
    return saved.customSubtypes;
  }

  if (!mounted) return null;

  return (
    <>
      <AppPageShell
        title="Device Settings"
        description="Control the data and credentials stored by StackHatch in this browser profile."
        actions={
          <>
            <Link
              href="/project/new"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-sm bg-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand-foreground)]"
            >
              <FolderPlus className="h-4 w-4" aria-hidden="true" />
              New Map
            </Link>
            <ThemeToggle />
          </>
        }
        navigation={
          isAnthropicSetup ? (
            <IconControl href={returnTo} label="Back to map setup" tooltipPlacement="bottom">
              <ArrowLeft />
            </IconControl>
          ) : undefined
        }
      >
        <div className="w-full min-w-0" data-testid="settings-content">
          <div className="grid min-w-0 gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
            <nav
              aria-label="Settings sections"
              className="-mx-1 flex min-w-0 gap-1 overflow-x-auto border-y border-[var(--border)] px-1 py-2 lg:sticky lg:top-6 lg:mx-0 lg:flex-col lg:self-start lg:overflow-visible lg:border-y-0 lg:border-r lg:py-1 lg:pr-5"
            >
              {[
                ["#anthropic-key", "01", "Anthropic key"],
                ["#default-model", "02", "Default model"],
                ["#appearance", "03", "Appearance"],
                ["#node-subtypes", "04", "Node subtypes"],
                ["#device-data", "05", "Device data"],
              ].map(([href, index, label]) => (
                <a
                  key={href}
                  href={href}
                  className="group inline-flex min-h-11 shrink-0 items-center gap-3 rounded-sm border border-transparent px-3 text-sm font-semibold text-[var(--muted-foreground)] hover:border-[var(--border)] hover:bg-[var(--card)] hover:text-[var(--foreground)] lg:w-full"
                >
                  <span
                    className="font-utility text-[0.625rem] text-[var(--color-client)]"
                    aria-hidden="true"
                  >
                    {index}
                  </span>
                  {label}
                </a>
              ))}
            </nav>

            {loadState === "loading" ? (
              <div
                className="rounded-sm border border-[var(--border)] bg-[var(--card)] py-16 text-center text-[var(--muted-foreground)]"
                role="status"
              >
                Opening settings from this device...
              </div>
            ) : loadState === "failed" ? (
              <div
                className="rounded-sm border border-[var(--danger-border)] bg-[var(--danger-surface)] p-6"
                role="alert"
              >
                <h2 className="text-lg font-semibold">Browser settings are unavailable</h2>
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                  StackHatch will not pretend changes are saved while the browser vault is
                  unavailable.
                </p>
                <button
                  type="button"
                  onClick={() => void loadDeviceSettings()}
                  className="mt-4 min-h-11 rounded-sm bg-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand-foreground)]"
                >
                  Retry browser storage
                </button>
              </div>
            ) : (
              <div className="min-w-0 space-y-4">
                {isAnthropicSetup ? (
                  <section className="rounded-sm border border-[var(--border)] border-l-2 border-l-[var(--color-data)] bg-[var(--card)] p-5 sm:p-6">
                    <p className="font-utility text-xs font-bold uppercase tracking-[0.14em] text-[var(--warning)]">
                      One-time setup
                    </p>
                    <h2 className="font-display mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
                      {setupRepo
                        ? "Connect Anthropic to map this repository."
                        : setupMethod === "requirements"
                          ? "Connect Anthropic to map your requirements."
                          : "Connect Anthropic to use StackHatch."}
                    </h2>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted-foreground)]">
                      StackHatch is free and bring-your-own-key. Your browser sends AI requests
                      directly to Anthropic, which bills usage to your Anthropic account.
                    </p>
                    <a
                      href="https://console.anthropic.com/settings/keys"
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex text-sm font-semibold text-[var(--brand)] underline-offset-4 hover:underline"
                    >
                      Open Anthropic API key settings
                    </a>
                  </section>
                ) : null}

                <section
                  id="anthropic-key"
                  className="scroll-mt-24 rounded-sm border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-low)] sm:p-6"
                >
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-utility mb-1 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                        Connection · 01
                      </p>
                      <h2 className="text-xl font-semibold text-[var(--card-foreground)]">
                        Anthropic key
                      </h2>
                    </div>
                    <span
                      className="inline-flex items-center gap-1.5 rounded-sm border border-[var(--border)] bg-[var(--background)] px-2.5 py-1 font-utility text-[0.6875rem] font-bold uppercase tracking-[0.08em]"
                      data-testid={`key-status-${keyStatus?.state ?? "absent"}`}
                    >
                      <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                      {keyStatus?.state === "remembered"
                        ? "Remembered on device"
                        : keyStatus?.state === "session"
                          ? "This session only"
                          : "Missing"}
                    </span>
                  </div>
                  <p className="max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">
                    Session-only is the default: the key stays in this tab&apos;s memory and is
                    forgotten when the browser session ends. StackHatch never includes it in a
                    backup.
                  </p>
                  <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                    <label className="sr-only" htmlFor="anthropic-api-key">
                      Anthropic API key
                    </label>
                    <input
                      ref={keyInputRef}
                      id="anthropic-api-key"
                      type="password"
                      placeholder="sk-ant-..."
                      autoComplete="off"
                      spellCheck={false}
                      className="min-h-11 flex-1 rounded-sm border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-utility text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => void saveKey()}
                      disabled={savingKey}
                      className="min-h-11 rounded-sm bg-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand-foreground)] disabled:opacity-50"
                    >
                      {savingKey ? "Updating key..." : "Use key"}
                    </button>
                    {keyStatus?.state !== "absent" ? (
                      <button
                        type="button"
                        onClick={() => void forgetKey()}
                        disabled={savingKey}
                        className="min-h-11 rounded-sm border border-[var(--border)] px-4 py-2 text-sm font-semibold disabled:opacity-50"
                      >
                        Forget key
                      </button>
                    ) : null}
                  </div>
                  <label className="mt-4 flex max-w-2xl items-start gap-3 text-sm">
                    <input ref={rememberRef} type="checkbox" className="mt-1 h-4 w-4" />
                    <span>
                      <strong>Remember on this device.</strong>{" "}
                      <span className="text-[var(--muted-foreground)]">
                        Opt in only on a device you trust. Same-origin scripts, browser extensions,
                        and anyone with local device access may be able to read a reusable key.
                      </span>
                    </span>
                  </label>
                  {isAnthropicSetup && keyStatus?.state !== "absent" ? (
                    <Link
                      href={returnTo}
                      className="mt-5 inline-flex min-h-11 items-center justify-center rounded-sm bg-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand-foreground)]"
                    >
                      {setupRepo ? `Continue to ${setupRepo}` : "Continue to your project"}
                    </Link>
                  ) : null}
                </section>

                <section
                  id="default-model"
                  className="scroll-mt-24 rounded-sm border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-low)] sm:p-6"
                >
                  <p className="font-utility mb-1 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                    Analysis · 02
                  </p>
                  <h2 className="text-xl font-semibold text-[var(--card-foreground)]">
                    Default model
                  </h2>
                  <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                    Choose the model used for AI-assisted work. This preference stays on this
                    device.
                  </p>
                  <label htmlFor="claude-model" className="mt-5 block text-sm font-semibold">
                    Model
                  </label>
                  <select
                    id="claude-model"
                    value={preferences.model}
                    onChange={(event) => void changeModel(event.target.value)}
                    disabled={savingPreference}
                    className="mt-1 min-h-11 w-full rounded-sm border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  >
                    {AI_MODELS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </section>

                <section
                  id="appearance"
                  className="scroll-mt-24 rounded-sm border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-low)] sm:p-6"
                >
                  <p className="font-utility mb-1 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                    Interface · 03
                  </p>
                  <h2 className="text-xl font-semibold text-[var(--card-foreground)]">
                    Appearance
                  </h2>
                  <p className="mb-4 mt-2 text-sm text-[var(--muted-foreground)]">
                    Choose the theme stored in this browser profile.
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {(
                      [
                        ["light", Sun],
                        ["dark", Moon],
                        ["system", Monitor],
                      ] as const
                    ).map(([theme, ThemeIcon]) => (
                      <button
                        key={theme}
                        type="button"
                        onClick={() => void changeTheme(theme)}
                        disabled={savingPreference}
                        className={`flex min-h-24 flex-col items-start justify-between rounded-sm border p-4 text-sm font-semibold capitalize ${currentTheme === theme ? "border-[var(--color-client)] bg-[var(--muted)] ring-1 ring-[var(--color-client)]" : "border-[var(--border)] bg-[var(--background)] hover:bg-[var(--muted)]"}`}
                        aria-label={`Theme ${theme}`}
                        aria-pressed={currentTheme === theme}
                      >
                        <ThemeIcon className="h-5 w-5" aria-hidden="true" />
                        {theme}
                      </button>
                    ))}
                  </div>
                </section>

                <CustomSubtypesSettings
                  initialCatalog={preferences.customSubtypes}
                  saveCatalog={saveCustomSubtypes}
                />
                <DeviceDataSettings
                  storageStatus={storageStatus!}
                  requestPersistence={services.requestPersistentStorage}
                  exportBackup={async () => {
                    const repository = repositoryRef.current;
                    if (!repository) throw new Error("Browser vault is unavailable");
                    return exportVaultBackup(repository);
                  }}
                  prepareImport={async (text) => {
                    const repository = repositoryRef.current;
                    if (!repository) throw new Error("Browser vault is unavailable");
                    return prepareBackupImport(repository, text);
                  }}
                  clearData={(onBlocked) => {
                    const repository = repositoryRef.current;
                    const keyManager = keyManagerRef.current;
                    if (!repository || !keyManager) {
                      throw new Error("Browser vault is unavailable");
                    }
                    return clearAllDeviceData({
                      repository,
                      keyManager,
                      localStorage: window.localStorage,
                      sessionStorage: window.sessionStorage,
                      onBlocked,
                    });
                  }}
                  onRestored={services.afterRestore}
                  onCleared={services.afterClear}
                />
              </div>
            )}
          </div>
        </div>
      </AppPageShell>

      {toast ? (
        <div
          className={`fixed bottom-4 left-4 right-4 z-50 max-w-sm rounded-sm px-4 py-3 text-sm font-medium shadow-lg sm:bottom-6 sm:left-auto sm:right-6 ${toast.type === "success" ? "border border-[var(--success-border)] bg-[var(--success-surface)] text-[var(--success)]" : "border border-[var(--danger-border)] bg-[var(--danger-surface)] text-[var(--danger)]"}`}
          role={toast.type === "error" ? "alert" : "status"}
        >
          {toast.message}
        </div>
      ) : null}
    </>
  );
}

export default function SettingsPage() {
  return <DeviceSettingsPage />;
}
