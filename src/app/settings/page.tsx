"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { AI_MODELS, DEFAULT_AI_MODEL } from "@/lib/ai/models";

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

interface Settings {
  hasAnthropicKey?: boolean;
  model?: string;
  theme?: string;
}

export default function SettingsPage() {
  const { theme: currentTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [loading, setLoading] = useState(true);
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_AI_MODEL);
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load settings");
        return res.json() as Promise<Settings>;
      })
      .then((data) => {
        setHasAnthropicKey(Boolean(data.hasAnthropicKey));
        if (data.model) setModel(data.model);
        if (data.theme) setTheme(data.theme);
      })
      .catch(() => {
        setToast({ type: "error", message: "Settings could not be loaded" });
      })
      .finally(() => setLoading(false));
  }, [setTheme]);

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
      showToast("success", "Anthropic API key saved");
    } catch {
      showToast("error", "Failed to save API key");
    } finally {
      setSavingApiKey(false);
    }
  }, [apiKey, showToast]);

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
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-6 py-4">
          <Link
            href="/app"
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
            <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
              <div className="mb-4 flex items-center gap-2">
                <h2 className="text-lg font-semibold text-[var(--card-foreground)]">
                  Anthropic API Key
                </h2>
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${hasAnthropicKey ? "border-[var(--success-border)] bg-[var(--success-surface)] text-[var(--success)]" : "border-[var(--danger-border)] bg-[var(--danger-surface)] text-[var(--danger)]"}`}
                  data-testid={hasAnthropicKey ? "key-status-set" : "key-status-missing"}
                >
                  {hasAnthropicKey ? "Set" : "Missing"}
                </span>
              </div>
              <p className="text-sm leading-6 text-[var(--muted-foreground)]">
                StackHatch is free. AI requests are billed directly to your Anthropic account. Your
                key is encrypted at rest, used only on the server, and never returned to this
                browser.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
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
                  className="min-h-11 flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
                <button
                  type="button"
                  onClick={handleSaveApiKey}
                  disabled={savingApiKey || !apiKey.trim()}
                  className="min-h-11 rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)] disabled:opacity-50"
                >
                  {savingApiKey ? "Saving..." : hasAnthropicKey ? "Replace key" : "Save key"}
                </button>
                {hasAnthropicKey && (
                  <button
                    type="button"
                    onClick={handleClearApiKey}
                    disabled={savingApiKey}
                    className="min-h-11 rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--muted)] disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
              <h2 className="text-lg font-semibold text-[var(--card-foreground)]">Claude Model</h2>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                Choose the model used for your chat, repository analysis, alternatives, and PRD
                generation.
              </p>
              <label htmlFor="claude-model" className="mt-4 block text-sm font-medium">
                Model
              </label>
              <select
                id="claude-model"
                value={model}
                onChange={(e) => handleModelChange(e.target.value)}
                disabled={savingModel}
                className="mt-1 min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              >
                {AI_MODELS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                {savingModel
                  ? "Saving model preference..."
                  : "Your choice is private to your account."}
              </p>
            </section>

            <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
              <h2 className="text-lg font-semibold text-[var(--card-foreground)]">Theme</h2>
              <p className="mb-3 mt-2 text-sm text-[var(--muted-foreground)]">
                Choose your preferred appearance.
              </p>
              <div className="flex flex-wrap gap-3">
                {(["light", "dark", "system"] as const).map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    onClick={() => handleThemeChange(theme)}
                    className={`rounded-md border px-4 py-2 text-sm font-medium capitalize transition-colors ${currentTheme === theme ? "border-[var(--color-client)] bg-[var(--brand)] text-[var(--brand-foreground)]" : "border-[var(--border)] hover:bg-[var(--muted)]"}`}
                    aria-label={`Theme ${theme}`}
                    aria-pressed={currentTheme === theme}
                  >
                    {theme}
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>

      {toast && (
        <div
          className={`fixed bottom-6 right-6 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${toast.type === "success" ? "border border-[var(--success-border)] bg-[var(--success-surface)] text-[var(--success)]" : "border border-[var(--danger-border)] bg-[var(--danger-surface)] text-[var(--danger)]"}`}
          role="status"
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
