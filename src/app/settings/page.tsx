"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import AppPageShell from "@/components/shells/AppPageShell";
import { THEME_OPTIONS, type ThemePreference } from "@/components/theme-options";
import { KeyStateChip } from "@/components/projects/ProviderKeyField";
import GitHubTokenField from "@/components/projects/GitHubTokenField";
import CustomSubtypesSettings from "@/components/settings/CustomSubtypesSettings";
import DeviceDataSettings from "@/components/settings/DeviceDataSettings";
import SettingsRow from "@/components/settings/SettingsRow";
import Toast, { type ToastMessage } from "@/components/ui/Toast";
import {
  AI_PROVIDER_IDS,
  AI_PROVIDERS,
  DEFAULT_AI_MODEL_REFERENCE,
  defaultModelSelection,
  formatModelReference,
  normalizeModelId,
  parseModelReference,
  providerKeyShapeError,
  type AiProviderId,
} from "@/lib/ai/providers";
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
import { clearAllDeviceData } from "@/lib/vault/clear";
import { createVaultRepository, type VaultRepository } from "@/lib/vault/repository";
import type { VaultDevicePreferencesRecord } from "@/lib/vault/schema";
import {
  requestVaultStoragePersistence,
  type VaultStorageStatus,
} from "@/lib/vault/storage-status";
import { useHydrated } from "@/lib/use-hydrated";

type SettingsLoadState = "loading" | "loaded" | "failed";

const OTHER_MODEL = "__other__";

const SETTINGS_SECTIONS = [
  ["ai-provider", "AI provider"],
  ["api-key", "API key"],
  ["github-token", "GitHub token"],
  ["appearance", "Appearance"],
  ["node-subtypes", "Node subtypes"],
  ["device-data", "Device data"],
] as const;

export interface DeviceSettingsServices {
  createRepository(): VaultRepository;
  getKeyManager(): ProviderKeyManager;
  inspectStorage(): Promise<VaultStorageStatus>;
  afterClear(): void | Promise<void>;
}

const browserServices: DeviceSettingsServices = {
  createRepository: createVaultRepository,
  getKeyManager: getBrowserProviderKeyManager,
  inspectStorage: requestVaultStoragePersistence,
  afterClear() {
    window.location.assign(new URL("/", window.location.href));
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
    model: record?.model ?? DEFAULT_AI_MODEL_REFERENCE,
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
  const mounted = useHydrated();
  const [loadState, setLoadState] = useState<SettingsLoadState>("loading");
  const [preferences, setPreferences] = useState(() => preferenceValues(null, "system"));
  const [storageStatus, setStorageStatus] = useState<VaultStorageStatus | null>(null);
  const [keyStatus, setKeyStatus] = useState<ProviderKeyStatus | null>(null);
  const [savingKey, setSavingKey] = useState(false);
  const [savingPreference, setSavingPreference] = useState(false);
  const [returnTo, setReturnTo] = useState("/app");
  const [setupRepo, setSetupRepo] = useState<string | null>(null);
  const [setupMethod, setSetupMethod] = useState<ProjectStartMethod | null>(null);
  const [isAiSetup, setIsAiSetup] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [keyError, setKeyError] = useState("");
  const [modelError, setModelError] = useState("");
  const [customModelChosen, setCustomModelChosen] = useState(false);
  const repositoryRef = useRef<VaultRepository | null>(null);
  const keyManagerRef = useRef<ProviderKeyManager | null>(null);
  const preferenceCursorRef = useRef<PreferenceCursor | null>(null);
  const initialThemeRef = useRef(currentTheme);
  const keyInputRef = useRef<HTMLInputElement>(null);
  const modelIdRef = useRef<HTMLInputElement>(null);
  const rememberRef = useRef<HTMLInputElement>(null);
  const loadRequest = useRef(0);
  const [currentSection, setCurrentSection] = useState<string>(SETTINGS_SECTIONS[0][0]);

  // The index marks the section reading at the top of the viewport.
  useEffect(() => {
    if (loadState !== "loaded" || typeof IntersectionObserver === "undefined") return;
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting);
        const first = SETTINGS_SECTIONS.find(([id]) => visible.get(id));
        if (first) setCurrentSection(first[0]);
      },
      { rootMargin: "0px 0px -60% 0px" }
    );
    for (const [id] of SETTINGS_SECTIONS) {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, [loadState]);

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
    setIsAiSetup(params.get("setup") === "ai");
    setSetupRepo(
      repositoryFromProjectStartPath(safeReturnTo) || (legacyReturnTo !== "/app" ? repo : null)
    );
  }, []);

  useEffect(() => {
    if (isAiSetup && loadState === "loaded") keyInputRef.current?.focus();
  }, [isAiSetup, loadState]);

  // Rows mount only after the async load, so the browser cannot honour a deep
  // link such as /settings#api-key itself.
  useEffect(() => {
    if (loadState !== "loaded") return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!SETTINGS_SECTIONS.some(([sectionId]) => sectionId === id)) return;
    document.getElementById(id)?.scrollIntoView();
    setCurrentSection(id);
  }, [loadState]);

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
      const [snapshot, nextStorageStatus] = await Promise.all([
        repository.getDevicePreferencesSnapshot(),
        services.inspectStorage(),
      ]);
      const nextKeyStatus = await keyManager.getStatus(
        parseModelReference(snapshot.preferences?.model).provider
      );
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
      setKeyStatus(nextKeyStatus);
      setStorageStatus(nextStorageStatus);
      setLoadState("loaded");
    } catch {
      if (request !== loadRequest.current) return;
      repository.close();
      if (repositoryRef.current === repository) repositoryRef.current = null;
      setLoadState("failed");
      setToast({
        tone: "error",
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

  const showToast = useCallback((tone: ToastMessage["tone"], message: string) => {
    setToast({ tone, message });
  }, []);

  // Success notices leave after 5 s unless the dismiss control has focus;
  // errors stay until dismissed.
  useEffect(() => {
    if (toast?.tone !== "success") return;
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (document.activeElement?.closest(".toast")) schedule();
        else setToast(null);
      }, 5000);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [toast]);

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
    const target = parseModelReference(preferences.model).provider;
    const name = AI_PROVIDERS[target].name;
    const key = input?.value.trim() ?? "";
    if (!manager || !key) {
      setKeyError(`Enter a ${name} API key first.`);
      return;
    }
    const shapeError = providerKeyShapeError(target, key);
    if (shapeError) {
      setKeyError(shapeError);
      return;
    }
    setKeyError("");
    setSavingKey(true);
    try {
      const next = rememberRef.current?.checked
        ? await manager.rememberKey(target, key)
        : await manager.useSessionKey(target, key);
      input!.value = "";
      setKeyStatus(next);
      showToast(
        "success",
        next.state === "remembered"
          ? `${name} key remembered on this device.`
          : `${name} key available for this browser session.`
      );
    } catch (error) {
      setKeyError(error instanceof Error ? error.message : `The ${name} key could not be saved.`);
    } finally {
      setSavingKey(false);
    }
  }

  async function forgetKey() {
    const manager = keyManagerRef.current;
    if (!manager) return;
    const forgotten = parseModelReference(preferences.model).provider;
    setSavingKey(true);
    try {
      const next = await manager.forgetKey(forgotten);
      if (keyInputRef.current) keyInputRef.current.value = "";
      setKeyStatus(next);
      showToast("success", `Active and remembered ${AI_PROVIDERS[forgotten].name} key forgotten.`);
    } catch (error) {
      showToast(
        "error",
        error instanceof Error
          ? error.message
          : `The ${AI_PROVIDERS[forgotten].name} key could not be forgotten.`
      );
    } finally {
      setSavingKey(false);
    }
  }

  async function changeModel(model: string): Promise<boolean> {
    setSavingPreference(true);
    try {
      await persistPreferences({
        model: formatModelReference({
          provider: parseModelReference(preferences.model).provider,
          model,
        }),
      });
      showToast("success", "Default model saved on this device.");
      return true;
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "The model could not be saved.");
      return false;
    } finally {
      setSavingPreference(false);
    }
  }

  async function saveCustomModel() {
    const model = normalizeModelId(modelIdRef.current?.value ?? "");
    if (!model) {
      setModelError("Enter a model ID without spaces, up to 160 characters.");
      return;
    }
    setModelError("");
    if (await changeModel(model)) setCustomModelChosen(false);
  }

  async function changeProvider(next: AiProviderId) {
    if (next === parseModelReference(preferences.model).provider) return;
    setSavingPreference(true);
    try {
      await persistPreferences({ model: formatModelReference(defaultModelSelection(next)) });
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "The provider could not be saved."
      );
      setSavingPreference(false);
      return;
    }
    setCustomModelChosen(false);
    setModelError("");
    setKeyError("");
    if (keyInputRef.current) keyInputRef.current.value = "";
    const manager = keyManagerRef.current;
    if (manager) {
      try {
        setKeyStatus(await manager.getStatus(next));
      } catch {
        // The switch is saved; an unreadable credential store reads as "no key".
        setKeyStatus({ provider: next, state: "absent", generation: "" });
      }
    }
    showToast("success", `${AI_PROVIDERS[next].name} selected on this device.`);
    setSavingPreference(false);
  }

  async function changeTheme(theme: ThemePreference) {
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

  const keyState =
    keyStatus?.provider === parseModelReference(preferences.model).provider
      ? keyStatus.state
      : "absent";
  const selection = parseModelReference(preferences.model);
  const provider = AI_PROVIDERS[selection.provider];
  const customModelKnown = provider.models.some((option) => option.id === selection.model);
  const showCustomModel = customModelChosen || !customModelKnown;

  return (
    <AppPageShell
      title="Settings"
      current="settings"
      flush
      crumb={
        isAiSetup ? (
          <Link href={returnTo} className="app-bar__crumb">
            Back to map setup
          </Link>
        ) : undefined
      }
      index={
        <nav aria-label="Settings sections" className="lg:sticky lg:top-8">
          <ul className="m-0 flex list-none flex-wrap gap-x-1 p-0 lg:flex-col lg:gap-0">
            {SETTINGS_SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  aria-current={currentSection === id ? "true" : undefined}
                  onClick={() => setCurrentSection(id)}
                  className="relative flex min-h-[var(--control-size)] items-center px-3 py-2 text-[14.5px] font-semibold whitespace-nowrap text-ink2 no-underline transition-colors duration-120 ease-standard before:absolute before:bg-primary before:content-none hover:text-ink aria-[current=true]:text-ink aria-[current=true]:before:content-[''] max-lg:before:inset-x-3 max-lg:before:bottom-0 max-lg:before:h-[3px] lg:-ml-3 lg:before:top-2 lg:before:bottom-2 lg:before:-left-5 lg:before:w-1"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      }
    >
      {loadState === "loading" ? (
        <p className="page-gutter m-0 border-b border-rule py-7 text-ink2" role="status">
          Opening settings from this device...
        </p>
      ) : loadState === "failed" ? (
        <div className="page-gutter border-b border-rule py-7" role="alert">
          <h2 className="type-section m-0">Browser settings are unavailable</h2>
          <p className="mt-2 mb-0 max-w-[640px] text-[14.5px] text-ink2">
            StackHatch will not pretend changes are saved while browser storage is unavailable.
          </p>
          <button
            type="button"
            onClick={() => void loadDeviceSettings()}
            className="btn btn--primary mt-4"
          >
            Retry browser storage
          </button>
        </div>
      ) : (
        <>
          {isAiSetup ? (
            <section
              aria-labelledby="ai-setup-title"
              className="page-gutter relative border-b border-rule bg-paper py-7"
            >
              <span className="absolute inset-x-0 top-0 h-0.5 bg-primary" aria-hidden="true" />
              <h2 id="ai-setup-title" className="type-section m-0">
                {setupRepo
                  ? "Connect an AI provider to map this repository."
                  : setupMethod === "requirements"
                    ? "Connect an AI provider to map your requirements."
                    : "Connect an AI provider to use StackHatch."}
              </h2>
              <p className="mt-2 mb-0 max-w-[640px] text-[14.5px] text-ink2">
                StackHatch is free and bring-your-own-key. Your browser sends AI requests directly
                to {provider.name}, which bills usage to your {provider.name} account.
              </p>
              <a
                href={provider.keysUrl}
                target="_blank"
                rel="noreferrer"
                className="link mt-3 inline-block text-sm font-bold"
              >
                Open {provider.name} API key settings
              </a>
            </section>
          ) : null}

          <SettingsRow id="ai-provider" title="AI provider">
            <div className="grid max-w-[360px] gap-4">
              <div>
                <label htmlFor="ai-provider-select" className="field-label">
                  Provider
                </label>
                <select
                  id="ai-provider-select"
                  value={selection.provider}
                  onChange={(event) => void changeProvider(event.target.value as AiProviderId)}
                  disabled={savingPreference || savingKey}
                  className="field-select"
                >
                  {AI_PROVIDER_IDS.map((id) => (
                    <option key={id} value={id}>
                      {AI_PROVIDERS[id].name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ai-model-select" className="field-label">
                  Model
                </label>
                <select
                  id="ai-model-select"
                  value={showCustomModel ? OTHER_MODEL : selection.model}
                  onChange={(event) => {
                    if (event.target.value === OTHER_MODEL) {
                      setCustomModelChosen(true);
                      setModelError("");
                    } else {
                      setCustomModelChosen(false);
                      setModelError("");
                      void changeModel(event.target.value);
                    }
                  }}
                  disabled={savingPreference}
                  className="field-select"
                >
                  {provider.models.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                  <option value={OTHER_MODEL}>Other model ID…</option>
                </select>
              </div>
              {showCustomModel ? (
                <div>
                  <label htmlFor="ai-model-id" className="field-label">
                    Model ID
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <input
                      key={`${selection.provider}:${selection.model}`}
                      id="ai-model-id"
                      type="text"
                      defaultValue={customModelKnown ? "" : selection.model}
                      ref={modelIdRef}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={() => setModelError("")}
                      aria-invalid={modelError ? true : undefined}
                      aria-describedby={modelError ? "ai-model-id-error" : undefined}
                      className="field-input field-input--mono min-w-0 flex-[1_1_12rem]"
                    />
                    <button
                      type="button"
                      onClick={() => void saveCustomModel()}
                      disabled={savingPreference}
                      className="btn"
                    >
                      Save model
                    </button>
                  </div>
                  {modelError ? (
                    <p id="ai-model-id-error" className="field-error" role="alert">
                      {modelError}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </SettingsRow>

          <SettingsRow id="api-key" title={`${provider.name} key`}>
            <div className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <KeyStateChip state={keyState} data-testid={`key-status-${keyState}`} />
              <span className="type-small text-ink2">
                {keyState === "remembered"
                  ? "Stored on this device until you forget it."
                  : keyState === "session"
                    ? "Forgotten when this browser session ends."
                    : "Session-only unless you choose to remember it."}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="sr-only" htmlFor="provider-api-key">
                {provider.name} API key
              </label>
              <input
                ref={keyInputRef}
                id="provider-api-key"
                type="password"
                placeholder={`${provider.keyPrefix}…`}
                autoComplete="off"
                spellCheck={false}
                onChange={() => setKeyError("")}
                aria-invalid={keyError ? true : undefined}
                aria-describedby={keyError ? "provider-api-key-error" : undefined}
                className="field-input field-input--mono min-w-0 flex-[1_1_12rem]"
              />
              <button
                type="button"
                onClick={() => void saveKey()}
                disabled={savingKey || savingPreference}
                className="btn"
              >
                {savingKey ? "Updating key..." : "Use key"}
              </button>
              {keyState !== "absent" ? (
                <button
                  type="button"
                  onClick={() => void forgetKey()}
                  disabled={savingKey || savingPreference}
                  className="btn btn--quiet"
                >
                  Forget key
                </button>
              ) : null}
            </div>
            {keyError ? (
              <p id="provider-api-key-error" className="field-error" role="alert">
                {keyError}
              </p>
            ) : null}
            <label className="field-check mt-3">
              <input ref={rememberRef} type="checkbox" />
              <span>
                <strong>Remember on this device.</strong>{" "}
                <span className="type-small text-ink2">
                  Only on a device you trust: extensions, same-origin scripts and anyone using this
                  device could read it. Never included in backups.
                </span>
              </span>
            </label>
            {isAiSetup && keyState !== "absent" ? (
              <Link href={returnTo} className="btn btn--primary mt-5">
                {setupRepo ? `Continue to ${setupRepo}` : "Continue to your project"}
              </Link>
            ) : null}
          </SettingsRow>

          <SettingsRow id="github-token" title="GitHub token">
            <GitHubTokenField
              keyManager={services.getKeyManager()}
              showState
              onChange={(next, change) =>
                showToast(
                  "success",
                  change === "forgotten"
                    ? "Active and remembered GitHub token forgotten."
                    : next.state === "remembered"
                      ? "GitHub token remembered on this device."
                      : "GitHub token available for this browser session."
                )
              }
            />
          </SettingsRow>

          <SettingsRow id="appearance" title="Appearance">
            <div
              role="group"
              aria-label="Theme"
              className="inline-flex max-w-full overflow-hidden rounded-control border-[1.5px] border-ink"
            >
              {THEME_OPTIONS.map(([theme, ThemeIcon]) => (
                <button
                  key={theme}
                  type="button"
                  onClick={() => void changeTheme(theme)}
                  disabled={savingPreference}
                  className="inline-flex min-h-[var(--control-size)] items-center gap-2 border-ink px-4 text-sm font-semibold capitalize transition-colors duration-120 ease-standard hover:bg-muted focus-visible:outline-offset-[-5px] disabled:cursor-wait aria-pressed:bg-ink aria-pressed:text-paper aria-pressed:focus-visible:outline-paper max-[389px]:px-3 [&+&]:border-l-[1.5px]"
                  aria-label={`Theme ${theme}`}
                  aria-pressed={currentTheme === theme}
                >
                  <ThemeIcon className="size-4" aria-hidden="true" />
                  {theme}
                </button>
              ))}
            </div>
          </SettingsRow>

          <CustomSubtypesSettings
            initialCatalog={preferences.customSubtypes}
            saveCatalog={saveCustomSubtypes}
          />
          <DeviceDataSettings
            storageStatus={storageStatus!}
            clearData={(onBlocked) => {
              const repository = repositoryRef.current;
              const keyManager = keyManagerRef.current;
              if (!repository || !keyManager) {
                throw new Error("Browser storage is unavailable");
              }
              return clearAllDeviceData({
                repository,
                keyManager,
                localStorage: window.localStorage,
                sessionStorage: window.sessionStorage,
                onBlocked,
              });
            }}
            onCleared={services.afterClear}
          />
        </>
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </AppPageShell>
  );
}

export default function SettingsPage() {
  return <DeviceSettingsPage />;
}
