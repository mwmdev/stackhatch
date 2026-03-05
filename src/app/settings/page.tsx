"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { categoryOrder, nodeConfig } from "@/lib/node-config";
import type { CustomSubtypesMap, CustomSubtypeEntry } from "@/lib/custom-subtypes";
import type { NodeCategory } from "@/types/stack";
import { DEFAULT_CHAT_PROMPT, DEFAULT_ALTERNATIVES_PROMPT, DEFAULT_PRD_PROMPT } from "@/lib/ai/default-prompts";

const VALID_MODELS = [
  { id: "claude-sonnet-4-20250514", name: "Sonnet" },
  { id: "claude-opus-4-20250514", name: "Opus" },
  { id: "claude-haiku-235-20241022", name: "Haiku" },
] as const;

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

interface Settings {
  apiKey?: string;
  model?: string;
  theme?: string;
  customSubtypes?: string;
  prompt_chat?: string;
  prompt_alternatives?: string;
  prompt_prd?: string;
}

export default function SettingsPage() {
  const { theme: currentTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState("claude-sonnet-4-20250514");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [keyError, setKeyError] = useState("");
  const [customSubtypes, setCustomSubtypes] = useState<CustomSubtypesMap>({});
  const [viewAsRole, setViewAsRole] = useState("admin");
  const [newSubtype, setNewSubtype] = useState<Record<NodeCategory, { slug: string; displayName: string; icon: string }>>({} as Record<NodeCategory, { slug: string; displayName: string; icon: string }>);
  const [prompts, setPrompts] = useState({
    prompt_chat: "",
    prompt_alternatives: "",
    prompt_prd: "",
  });
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);
  const [savingPrompt, setSavingPrompt] = useState<string | null>(null);

  useEffect(() => {
    const match = document.cookie.match(/(?:^|; )dev-role=([^;]*)/);
    if (match) setViewAsRole(decodeURIComponent(match[1]));
  }, []);

  const handleViewAsRole = useCallback((newRole: string) => {
    document.cookie = newRole === "admin"
      ? "dev-role=;path=/;max-age=0"
      : `dev-role=${newRole};path=/;max-age=31536000`;
    setViewAsRole(newRole);
    window.location.reload();
  }, []);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data: Settings) => {
        if (data.apiKey) {
          setHasExistingKey(true);
          setApiKey(data.apiKey);
        }
        if (data.model) {
          setModel(data.model);
        }
        if (data.theme) {
          setTheme(data.theme);
        }
        if (data.customSubtypes) {
          try {
            setCustomSubtypes(JSON.parse(data.customSubtypes));
          } catch { /* ignore */ }
        }
        setPrompts({
          prompt_chat: data.prompt_chat ?? "",
          prompt_alternatives: data.prompt_alternatives ?? "",
          prompt_prd: data.prompt_prd ?? "",
        });
      })
      .catch(() => {
        // Use defaults
      })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const showToast = useCallback(
    (type: "success" | "error", message: string) => {
      setToast({ type, message });
      setTimeout(() => setToast(null), 3000);
    },
    [],
  );

  const validateApiKey = useCallback((key: string): string => {
    if (!key) return "";
    if (!key.startsWith("sk-ant-")) {
      return "API key must start with sk-ant-";
    }
    return "";
  }, []);

  const handleSaveApiKey = useCallback(async () => {
    const error = validateApiKey(apiKey);
    if (error) {
      setKeyError(error);
      return;
    }
    setKeyError("");
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      if (res.ok) {
        setHasExistingKey(!!apiKey);
        setShowKey(false);
        showToast("success", "API key saved");
      } else {
        showToast("error", "Failed to save API key");
      }
    } catch {
      showToast("error", "Failed to save API key");
    } finally {
      setSaving(false);
    }
  }, [apiKey, validateApiKey, showToast]);

  const handleSaveModel = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      if (res.ok) {
        showToast("success", "Model preference saved");
      } else {
        showToast("error", "Failed to save model");
      }
    } catch {
      showToast("error", "Failed to save model");
    } finally {
      setSaving(false);
    }
  }, [model, showToast]);

  const handleThemeChange = useCallback(
    async (newTheme: string) => {
      setTheme(newTheme);
      try {
        await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme: newTheme }),
        });
      } catch {
        // Theme already applied locally, DB save is best-effort
      }
    },
    [setTheme],
  );

  const saveCustomSubtypes = useCallback(async (map: CustomSubtypesMap) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customSubtypes: JSON.stringify(map) }),
      });
      if (res.ok) {
        showToast("success", "Custom subtypes saved");
      } else {
        showToast("error", "Failed to save custom subtypes");
      }
    } catch {
      showToast("error", "Failed to save custom subtypes");
    }
  }, [showToast]);

  const handleAddSubtype = useCallback(
    (category: NodeCategory) => {
      const form = newSubtype[category];
      if (!form?.slug || !form?.displayName) return;
      const entry: CustomSubtypeEntry = {
        slug: form.slug.toLowerCase().replace(/\s+/g, "-"),
        displayName: form.displayName,
        icon: form.icon || "Box",
      };
      const builtInSlugs = Object.keys(nodeConfig[category].subtypes);
      const existingSlugs = customSubtypes[category]?.map((e) => e.slug) ?? [];
      if (builtInSlugs.includes(entry.slug) || existingSlugs.includes(entry.slug)) {
        showToast("error", `Subtype "${entry.slug}" already exists`);
        return;
      }
      const updated: CustomSubtypesMap = {
        ...customSubtypes,
        [category]: [...(customSubtypes[category] ?? []), entry],
      };
      setCustomSubtypes(updated);
      setNewSubtype((prev) => ({ ...prev, [category]: { slug: "", displayName: "", icon: "" } }));
      saveCustomSubtypes(updated);
    },
    [customSubtypes, newSubtype, showToast, saveCustomSubtypes],
  );

  const handleRemoveSubtype = useCallback(
    (category: NodeCategory, slug: string) => {
      const updated: CustomSubtypesMap = {
        ...customSubtypes,
        [category]: (customSubtypes[category] ?? []).filter((e) => e.slug !== slug),
      };
      if (updated[category]?.length === 0) delete updated[category];
      setCustomSubtypes(updated);
      saveCustomSubtypes(updated);
    },
    [customSubtypes, saveCustomSubtypes],
  );

  const promptDefaults: Record<string, string> = {
    prompt_chat: DEFAULT_CHAT_PROMPT,
    prompt_alternatives: DEFAULT_ALTERNATIVES_PROMPT,
    prompt_prd: DEFAULT_PRD_PROMPT,
  };

  const handleSavePrompt = useCallback(async (key: string) => {
    setSavingPrompt(key);
    try {
      const value = prompts[key as keyof typeof prompts];
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value || promptDefaults[key] }),
      });
      if (res.ok) {
        showToast("success", "Prompt saved");
      } else {
        showToast("error", "Failed to save prompt");
      }
    } catch {
      showToast("error", "Failed to save prompt");
    } finally {
      setSavingPrompt(null);
    }
  }, [prompts, showToast]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResetPrompt = useCallback(async (key: string) => {
    setSavingPrompt(key);
    setPrompts((prev) => ({ ...prev, [key]: "" }));
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: "" }),
      });
      if (res.ok) {
        showToast("success", "Prompt reset to default");
      } else {
        showToast("error", "Failed to reset prompt");
      }
    } catch {
      showToast("error", "Failed to reset prompt");
    } finally {
      setSavingPrompt(null);
    }
  }, [showToast]); // eslint-disable-line react-hooks/exhaustive-deps

  const maskedKey =
    hasExistingKey && !showKey && apiKey
      ? `${apiKey.slice(0, 7)}${"•".repeat(Math.max(0, apiKey.length - 11))}${apiKey.slice(-4)}`
      : apiKey;

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {/* Header */}
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-6 py-4">
          <Link
            href="/"
            className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            &larr; Back to Dashboard
          </Link>
          <h1 className="text-xl font-bold">Settings</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8">
        {loading ? (
          <div className="py-16 text-center text-[var(--muted-foreground)]">
            Loading settings...
          </div>
        ) : (
          <div className="space-y-8">
            {/* API Key Section */}
            <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
              <div className="mb-4 flex items-center gap-2">
                <h2 className="text-lg font-semibold text-[var(--card-foreground)]">
                  API Key
                </h2>
                {hasExistingKey ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    data-testid="key-status-set"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Set
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    data-testid="key-status-missing"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    Missing
                  </span>
                )}
              </div>
              <p className="mb-3 text-sm text-[var(--muted-foreground)]">
                Your Anthropic API key for AI-powered architecture generation.
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showKey ? "text" : "password"}
                    value={hasExistingKey && !showKey ? maskedKey : apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setKeyError("");
                      if (hasExistingKey && !showKey) {
                        setShowKey(true);
                      }
                    }}
                    onFocus={() => {
                      if (hasExistingKey && !showKey) {
                        setShowKey(true);
                      }
                    }}
                    placeholder="sk-ant-..."
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-client)]"
                    aria-label="API Key"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    aria-label={showKey ? "Hide API key" : "Show API key"}
                  >
                    {showKey ? (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                <button
                  onClick={handleSaveApiKey}
                  disabled={saving || !apiKey}
                  className="rounded-md bg-[var(--color-client)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
              {keyError && (
                <p
                  className="mt-2 text-sm text-red-600 dark:text-red-400"
                  data-testid="key-error"
                >
                  {keyError}
                </p>
              )}
            </section>

            {/* Model Section */}
            <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
              <h2 className="mb-4 text-lg font-semibold text-[var(--card-foreground)]">
                Claude Model
              </h2>
              <p className="mb-3 text-sm text-[var(--muted-foreground)]">
                Select which Claude model to use for architecture generation.
              </p>
              <div className="flex gap-2">
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-client)]"
                  aria-label="Claude Model"
                >
                  {VALID_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.id})
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleSaveModel}
                  disabled={saving}
                  className="rounded-md bg-[var(--color-client)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </section>

            {/* Theme Section */}
            <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
              <h2 className="mb-4 text-lg font-semibold text-[var(--card-foreground)]">
                Theme
              </h2>
              <p className="mb-3 text-sm text-[var(--muted-foreground)]">
                Choose your preferred appearance.
              </p>
              <div className="flex gap-3">
                {(["light", "dark", "system"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => handleThemeChange(t)}
                    className={`rounded-md border px-4 py-2 text-sm font-medium capitalize transition-colors ${
                      currentTheme === t
                        ? "border-[var(--color-client)] bg-[var(--color-client)] text-white"
                        : "border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)]"
                    }`}
                    aria-label={`Theme ${t}`}
                    aria-pressed={currentTheme === t}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </section>

            {/* View As Role Section */}
            <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
              <h2 className="mb-4 text-lg font-semibold text-[var(--card-foreground)]">
                View As Role
              </h2>
              <p className="mb-3 text-sm text-[var(--muted-foreground)]">
                Impersonate a different role to see the interface as that user would.
              </p>
              <div className="flex gap-3">
                {(["admin", "paid-user", "free-user"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => handleViewAsRole(r)}
                    className={`rounded-md border px-4 py-2 text-sm font-medium capitalize transition-colors ${
                      viewAsRole === r
                        ? "border-[var(--color-client)] bg-[var(--color-client)] text-white"
                        : "border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)]"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </section>

            {/* Node Subtypes Section */}
            <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
              <h2 className="mb-4 text-lg font-semibold text-[var(--card-foreground)]">
                Node Subtypes
              </h2>
              <p className="mb-4 text-sm text-[var(--muted-foreground)]">
                Add custom subtypes to existing node categories. Built-in subtypes are always available.
              </p>
              <div className="space-y-5">
                {categoryOrder.map((category) => {
                  const config = nodeConfig[category];
                  const customEntries = customSubtypes[category] ?? [];
                  const form = newSubtype[category] ?? { slug: "", displayName: "", icon: "" };
                  return (
                    <div key={category} className="rounded border border-[var(--border)] p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <span
                          className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
                          style={{ backgroundColor: config.color }}
                        >
                          {config.displayName}
                        </span>
                      </div>
                      {/* Built-in subtypes */}
                      <div className="mb-2 flex flex-wrap gap-1">
                        {Object.entries(config.subtypes).map(([slug, sc]) => (
                          <span
                            key={slug}
                            className="inline-block rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]"
                          >
                            {sc.displayName}
                          </span>
                        ))}
                      </div>
                      {/* Custom subtypes */}
                      {customEntries.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1">
                          {customEntries.map((entry) => (
                            <span
                              key={entry.slug}
                              className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            >
                              {entry.displayName}
                              <button
                                onClick={() => handleRemoveSubtype(category, entry.slug)}
                                className="ml-0.5 hover:text-red-500"
                                aria-label={`Remove ${entry.displayName}`}
                              >
                                &times;
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Add form */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="slug"
                          value={form.slug}
                          onChange={(e) =>
                            setNewSubtype((prev) => ({
                              ...prev,
                              [category]: { ...form, slug: e.target.value },
                            }))
                          }
                          className="w-24 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-client)]"
                        />
                        <input
                          type="text"
                          placeholder="Display Name"
                          value={form.displayName}
                          onChange={(e) =>
                            setNewSubtype((prev) => ({
                              ...prev,
                              [category]: { ...form, displayName: e.target.value },
                            }))
                          }
                          className="flex-1 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-client)]"
                        />
                        <input
                          type="text"
                          placeholder="Icon"
                          value={form.icon}
                          onChange={(e) =>
                            setNewSubtype((prev) => ({
                              ...prev,
                              [category]: { ...form, icon: e.target.value },
                            }))
                          }
                          className="w-20 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-client)]"
                        />
                        <button
                          onClick={() => handleAddSubtype(category)}
                          disabled={!form.slug || !form.displayName}
                          className="rounded bg-[var(--color-client)] px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
            {/* AI Prompts Section — Admin Only */}
            {viewAsRole === "admin" && (
              <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
                <h2 className="mb-4 text-lg font-semibold text-[var(--card-foreground)]">
                  AI Prompts
                </h2>
                <p className="mb-4 text-sm text-[var(--muted-foreground)]">
                  Customize the system prompts used by AI features. Leave empty to use the default.
                </p>
                <div className="space-y-4">
                  {([
                    { key: "prompt_chat", label: "Chat Prompt", description: "System prompt for the architecture chat interview. The valid categories/subtypes section is appended automatically." },
                    { key: "prompt_alternatives", label: "Alternatives Prompt", description: "System prompt for suggesting alternative technologies for a node." },
                    { key: "prompt_prd", label: "PRD Export Prompt", description: "System prompt for generating Product Requirements Documents." },
                  ] as const).map(({ key, label, description }) => (
                    <div key={key} className="rounded border border-[var(--border)]">
                      <button
                        type="button"
                        onClick={() => setExpandedPrompt(expandedPrompt === key ? null : key)}
                        className="flex w-full items-center justify-between p-4 text-left"
                      >
                        <div>
                          <span className="font-medium text-[var(--card-foreground)]">{label}</span>
                          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{description}</p>
                        </div>
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className={`transition-transform ${expandedPrompt === key ? "rotate-180" : ""}`}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                      {expandedPrompt === key && (
                        <div className="border-t border-[var(--border)] p-4">
                          <textarea
                            value={prompts[key] || promptDefaults[key]}
                            onChange={(e) => setPrompts((prev) => ({ ...prev, [key]: e.target.value }))}
                            rows={12}
                            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-client)]"
                          />
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => handleSavePrompt(key)}
                              disabled={savingPrompt === key}
                              className="rounded-md bg-[var(--color-client)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                            >
                              {savingPrompt === key ? "Saving..." : "Save"}
                            </button>
                            <button
                              onClick={() => handleResetPrompt(key)}
                              disabled={savingPrompt === key}
                              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
                            >
                              Reset to Default
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg transition-opacity ${
            toast.type === "success" ? "bg-green-600" : "bg-red-600"
          }`}
          data-testid="toast"
          role="status"
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
