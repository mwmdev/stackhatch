"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { ArrowLeft, KeyRound, Monitor, Moon, Sun } from "lucide-react";
import AppPageActions from "@/components/shells/AppPageActions";
import AppPageShell from "@/components/shells/AppPageShell";
import IconControl from "@/components/ui/IconControl";
import CustomSubtypesSettings from "@/components/settings/CustomSubtypesSettings";
import { AI_MODELS, DEFAULT_AI_MODEL } from "@/lib/ai/models";
import type { CustomSubtypesMap } from "@/lib/custom-subtypes";
import { trackEvent } from "@/lib/analytics";
import {
  buildProjectStartPath,
  canonicalProjectStartPath,
  isPublicRepositorySlug,
  projectStartMethodFromPath,
  repositoryFromProjectStartPath,
  safeInternalPath,
  type ProjectStartMethod,
} from "@/lib/project-start";

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

interface Settings {
  hasAnthropicKey?: boolean;
  model?: string;
  theme?: string;
  customSubtypes?: CustomSubtypesMap;
}

export default function SettingsPage() {
  const { theme: currentTheme, setTheme } = useTheme();
  const initialThemeSetter = useRef(setTheme);
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [loading, setLoading] = useState(true);
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_AI_MODEL);
  const [customSubtypes, setCustomSubtypes] = useState<CustomSubtypesMap>({});
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [returnTo, setReturnTo] = useState("/app");
  const [setupRepo, setSetupRepo] = useState<string | null>(null);
  const [setupMethod, setSetupMethod] = useState<ProjectStartMethod | null>(null);
  const [isAnthropicSetup, setIsAnthropicSetup] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const setupStartTracked = useRef(false);

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

  useEffect(() => {
    fetch("/api/settings")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load settings");
        return res.json() as Promise<Settings>;
      })
      .then((data) => {
        setHasAnthropicKey(Boolean(data.hasAnthropicKey));
        if (data.model) setModel(data.model);
        if (data.theme) initialThemeSetter.current(data.theme);
        setCustomSubtypes(data.customSubtypes ?? {});
      })
      .catch(() => {
        setToast({ type: "error", message: "Settings could not be loaded" });
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading || !isAnthropicSetup || hasAnthropicKey || setupStartTracked.current) return;
    setupStartTracked.current = true;
    trackEvent("anthropic_setup_started", { location: "settings" });
  }, [hasAnthropicKey, isAnthropicSetup, loading]);

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleSaveApiKey = useCallback(async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      showToast("error", "Enter an Anthropic API key first");
      return;
    }
    const completingSetup = !hasAnthropicKey;
    setSavingApiKey(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast("error", data.error || "Failed to save API key");
        return;
      }
      setApiKey("");
      setHasAnthropicKey(Boolean(data.hasAnthropicKey));
      if (completingSetup && data.hasAnthropicKey) {
        trackEvent("anthropic_setup_completed", { location: "settings" });
      }
      showToast("success", "Anthropic API key saved");
    } catch {
      showToast("error", "Failed to save API key");
    } finally {
      setSavingApiKey(false);
    }
  }, [apiKey, hasAnthropicKey, showToast]);

  const handleClearApiKey = useCallback(async () => {
    setSavingApiKey(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearApiKey: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast("error", data.error || "Failed to remove API key");
        return;
      }
      setHasAnthropicKey(false);
      showToast("success", "Anthropic API key removed");
    } catch {
      showToast("error", "Failed to remove API key");
    } finally {
      setSavingApiKey(false);
    }
  }, [showToast]);

  const handleModelChange = useCallback(
    async (newModel: string) => {
      const previous = model;
      setModel(newModel);
      setSavingModel(true);
      try {
        const res = await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: newModel }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setModel(previous);
          showToast("error", data.error || "Failed to save model");
          return;
        }
        setModel(data.model || newModel);
        showToast("success", "Claude model saved");
      } catch {
        setModel(previous);
        showToast("error", "Failed to save model");
      } finally {
        setSavingModel(false);
      }
    },
    [model, showToast]
  );

  const handleThemeChange = useCallback(
    async (newTheme: string) => {
      setTheme(newTheme);
      try {
        const res = await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme: newTheme }),
        });
        if (!res.ok) showToast("error", "Theme could not be saved to your account");
      } catch {
        showToast("error", "Theme could not be saved to your account");
      }
    },
    [setTheme, showToast]
  );

  if (!mounted) return null;

  return (
    <>
      <AppPageShell
        homeHref="/app"
        homeLabel="Resume map"
        title="Settings"
        description="Manage your AI connection, model, appearance, and map vocabulary."
        actions={<AppPageActions currentPage="settings" />}
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
                ["#anthropic-key", "01", "API key"],
                ["#default-model", "02", "Default model"],
                ["#appearance", "03", "Appearance"],
                ["#node-subtypes", "04", "Node subtypes"],
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

            {loading ? (
              <div
                className="rounded-sm border border-[var(--border)] bg-[var(--card)] py-16 text-center text-[var(--muted-foreground)]"
                role="status"
              >
                Loading settings...
              </div>
            ) : (
              <div className="min-w-0 space-y-4">
                {isAnthropicSetup && (
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
                      StackHatch is free and bring-your-own-key. Your key stays encrypted on the
                      server and AI usage is billed directly to your Anthropic account.
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
                )}

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
                        Anthropic API Key
                      </h2>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 font-utility text-[0.6875rem] font-bold uppercase tracking-[0.08em] ${hasAnthropicKey ? "border-[var(--success-border)] bg-[var(--success-surface)] text-[var(--success)]" : "border-[var(--danger-border)] bg-[var(--danger-surface)] text-[var(--danger)]"}`}
                      data-testid={hasAnthropicKey ? "key-status-set" : "key-status-missing"}
                    >
                      <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                      {hasAnthropicKey ? "Set" : "Missing"}
                    </span>
                  </div>
                  <p className="max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">
                    StackHatch is free. AI requests are billed directly to your Anthropic account.
                    Your key is encrypted at rest, used only on the server, and never returned to
                    this browser.
                  </p>
                  <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                    <label className="sr-only" htmlFor="anthropic-api-key">
                      API Key
                    </label>
                    <input
                      id="anthropic-api-key"
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={hasAnthropicKey ? "Enter a replacement key" : "sk-ant-..."}
                      autoComplete="off"
                      spellCheck={false}
                      className="min-h-11 flex-1 rounded-sm border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-utility text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    />
                    <button
                      type="button"
                      onClick={handleSaveApiKey}
                      disabled={savingApiKey || !apiKey.trim()}
                      className="min-h-11 rounded-sm bg-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)] disabled:opacity-50"
                    >
                      {savingApiKey ? "Saving..." : hasAnthropicKey ? "Replace key" : "Save key"}
                    </button>
                    {hasAnthropicKey && (
                      <button
                        type="button"
                        onClick={handleClearApiKey}
                        disabled={savingApiKey}
                        className="min-h-11 rounded-sm border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--muted)] disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {isAnthropicSetup && hasAnthropicKey && (
                    <Link
                      href={returnTo}
                      className="mt-5 inline-flex min-h-11 items-center justify-center rounded-sm bg-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)]"
                    >
                      {setupRepo ? `Continue to ${setupRepo}` : "Continue to your project"}
                    </Link>
                  )}
                </section>

                <section
                  id="default-model"
                  className={`scroll-mt-24 rounded-sm border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-low)] sm:p-6 ${isAnthropicSetup ? "opacity-80" : ""}`}
                >
                  <p className="font-utility mb-1 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                    Analysis · 02
                  </p>
                  <h2 className="text-xl font-semibold text-[var(--card-foreground)]">
                    Default model
                  </h2>
                  <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                    Choose the model used for your chat, repository analysis, alternatives, and PRD
                    generation.
                  </p>
                  <label htmlFor="claude-model" className="mt-5 block text-sm font-semibold">
                    Model
                  </label>
                  <select
                    id="claude-model"
                    value={model}
                    onChange={(e) => handleModelChange(e.target.value)}
                    disabled={savingModel}
                    className="mt-1 min-h-11 w-full rounded-sm border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  >
                    {AI_MODELS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 font-utility text-xs text-[var(--muted-foreground)]">
                    {savingModel
                      ? "Saving model preference..."
                      : "Your choice is private to your account."}
                  </p>
                </section>

                <section
                  id="appearance"
                  className={`scroll-mt-24 rounded-sm border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-low)] sm:p-6 ${isAnthropicSetup ? "opacity-80" : ""}`}
                >
                  <p className="font-utility mb-1 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                    Interface · 03
                  </p>
                  <h2 className="text-xl font-semibold text-[var(--card-foreground)]">
                    Appearance
                  </h2>
                  <p className="mb-4 mt-2 text-sm text-[var(--muted-foreground)]">
                    Choose your preferred theme. The setting follows you across the app.
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
                        onClick={() => handleThemeChange(theme)}
                        className={`flex min-h-24 flex-col items-start justify-between rounded-sm border p-4 text-sm font-semibold capitalize transition-colors ${currentTheme === theme ? "border-[var(--color-client)] bg-[var(--muted)] text-[var(--foreground)] ring-1 ring-[var(--color-client)]" : "border-[var(--border)] bg-[var(--background)] hover:bg-[var(--muted)]"}`}
                        aria-label={`Theme ${theme}`}
                        aria-pressed={currentTheme === theme}
                      >
                        <ThemeIcon
                          className={`h-5 w-5 ${currentTheme === theme ? "text-[var(--color-client)]" : "text-[var(--muted-foreground)]"}`}
                          aria-hidden="true"
                        />
                        {theme}
                      </button>
                    ))}
                  </div>
                </section>

                <CustomSubtypesSettings initialCatalog={customSubtypes} />
              </div>
            )}
          </div>
        </div>
      </AppPageShell>

      {toast && (
        <div
          className={`fixed bottom-4 left-4 right-4 z-50 max-w-sm rounded-sm px-4 py-3 text-sm font-medium shadow-lg sm:bottom-6 sm:left-auto sm:right-6 ${toast.type === "success" ? "border border-[var(--success-border)] bg-[var(--success-surface)] text-[var(--success)]" : "border border-[var(--danger-border)] bg-[var(--danger-surface)] text-[var(--danger)]"}`}
          role="status"
        >
          {toast.message}
        </div>
      )}
    </>
  );
}
