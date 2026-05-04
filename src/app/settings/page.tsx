"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { categoryOrder, nodeConfig } from "@/lib/node-config";
import type { CustomSubtypesMap, CustomSubtypeEntry } from "@/lib/custom-subtypes";
import type { NodeCategory } from "@/types/stack";
import {
  DEFAULT_CHAT_PROMPT,
  DEFAULT_ALTERNATIVES_PROMPT,
  DEFAULT_PRD_PROMPT,
} from "@/lib/ai/default-prompts";

const VALID_MODELS = [
  { id: "claude-sonnet-4-20250514", name: "Sonnet" },
  { id: "claude-opus-4-20250514", name: "Opus" },
  { id: "claude-haiku-235-20241022", name: "Haiku" },
] as const;

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;
const PROMPT_DEFAULTS: Record<string, string> = {
  prompt_chat: DEFAULT_CHAT_PROMPT,
  prompt_alternatives: DEFAULT_ALTERNATIVES_PROMPT,
  prompt_prd: DEFAULT_PRD_PROMPT,
};

interface Settings {
  hasAnthropicKey?: boolean;
  role?: string;
  isAdmin?: boolean;
  model?: string;
  theme?: string;
  customSubtypes?: string;
  prompt_chat?: string;
  prompt_alternatives?: string;
  prompt_prd?: string;
}

export default function SettingsPage() {
  const { theme: currentTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const [loading, setLoading] = useState(true);
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [currentRole, setCurrentRole] = useState("free-user");
  const [isAdmin, setIsAdmin] = useState(false);
  const [model, setModel] = useState("claude-sonnet-4-20250514");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [customSubtypes, setCustomSubtypes] = useState<CustomSubtypesMap>({});
  const [newSubtype, setNewSubtype] = useState<
    Record<NodeCategory, { slug: string; displayName: string; icon: string }>
  >({} as Record<NodeCategory, { slug: string; displayName: string; icon: string }>);
  const [prompts, setPrompts] = useState({
    prompt_chat: "",
    prompt_alternatives: "",
    prompt_prd: "",
  });
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);
  const [savingPrompt, setSavingPrompt] = useState<string | null>(null);
  const [billing, setBilling] = useState<{
    plan: string;
    billingInterval: string | null;
    status: string | null;
    currentPeriodEnd: number | null;
  } | null>(null);
  const [switchingInterval, setSwitchingInterval] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showChangePlan, setShowChangePlan] = useState(false);
  const [changingPlan, setChangingPlan] = useState(false);
  const [updatingPayment, setUpdatingPayment] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then((res) => res.json()),
      fetch("/api/billing/subscription").then((res) => (res.ok ? res.json() : null)),
    ])
      .then(
        ([data, billingData]: [
          Settings,
          {
            plan: string;
            billingInterval: string | null;
            status: string | null;
            currentPeriodEnd: number | null;
          } | null,
        ]) => {
          setHasAnthropicKey(Boolean(data.hasAnthropicKey));
          setCurrentRole(data.role ?? "free-user");
          setIsAdmin(Boolean(data.isAdmin));
          if (data.model) {
            setModel(data.model);
          }
          if (data.theme) {
            setTheme(data.theme);
          }
          if (data.customSubtypes) {
            try {
              setCustomSubtypes(JSON.parse(data.customSubtypes));
            } catch {
              /* ignore */
            }
          }
          setPrompts({
            prompt_chat: data.prompt_chat ?? "",
            prompt_alternatives: data.prompt_alternatives ?? "",
            prompt_prd: data.prompt_prd ?? "",
          });
          if (billingData) {
            setBilling(billingData);
          }
        }
      )
      .catch(() => {
        // Use defaults
      })
      .finally(() => setLoading(false));
  }, [setTheme]);

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }, []);

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
    [setTheme]
  );

  const saveCustomSubtypes = useCallback(
    async (map: CustomSubtypesMap) => {
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
    },
    [showToast]
  );

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
    [customSubtypes, newSubtype, showToast, saveCustomSubtypes]
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
    [customSubtypes, saveCustomSubtypes]
  );

  const handleSwitchInterval = useCallback(async () => {
    if (!billing || !billing.billingInterval) return;
    const newInterval = billing.billingInterval === "monthly" ? "annual" : "monthly";
    setSwitchingInterval(true);
    try {
      const res = await fetch("/api/billing/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "switch_interval", interval: newInterval }),
      });
      const data = await res.json();
      if (res.ok) {
        setBilling((prev) => (prev ? { ...prev, billingInterval: newInterval } : prev));
        showToast("success", data.message);
      } else {
        showToast("error", data.error || "Failed to switch billing interval");
      }
    } catch {
      showToast("error", "Failed to switch billing interval");
    } finally {
      setSwitchingInterval(false);
    }
  }, [billing, showToast]);

  const handleCancelSubscription = useCallback(async () => {
    setCanceling(true);
    try {
      const res = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        setBilling((prev) => (prev ? { ...prev, status: "canceled" } : prev));
        showToast("success", data.message);
      } else {
        showToast("error", data.error || "Failed to cancel subscription");
      }
    } catch {
      showToast("error", "Failed to cancel subscription");
    } finally {
      setCanceling(false);
      setShowCancelConfirm(false);
    }
  }, [showToast]);

  const handleReactivate = useCallback(async () => {
    setCanceling(true);
    try {
      const res = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reactivate: true }),
      });
      const data = await res.json();
      if (res.ok) {
        setBilling((prev) => (prev ? { ...prev, status: "active" } : prev));
        showToast("success", data.message);
      } else {
        showToast("error", data.error || "Failed to reactivate subscription");
      }
    } catch {
      showToast("error", "Failed to reactivate subscription");
    } finally {
      setCanceling(false);
    }
  }, [showToast]);

  const handleChangePlan = useCallback(
    async (plan: string) => {
      setChangingPlan(true);
      try {
        const res = await fetch("/api/billing/manage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "change_plan", plan }),
        });
        const data = await res.json();
        if (res.ok) {
          setBilling((prev) => (prev ? { ...prev, plan: data.plan } : prev));
          showToast("success", data.message);
          setShowChangePlan(false);
        } else {
          showToast("error", data.error || "Failed to change plan");
        }
      } catch {
        showToast("error", "Failed to change plan");
      } finally {
        setChangingPlan(false);
      }
    },
    [showToast]
  );

  const handleUpdatePayment = useCallback(async () => {
    setUpdatingPayment(true);
    try {
      // Use Stripe billing portal for payment method updates (simplest approach)
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        showToast("error", data.error || "Failed to open payment update");
      }
    } catch {
      showToast("error", "Failed to open payment update");
    } finally {
      setUpdatingPayment(false);
    }
  }, [showToast]);

  const handleOpenPortal = useCallback(async () => {
    setOpeningPortal(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) {
        window.open(data.url, "_blank");
      } else {
        showToast("error", data.error || "Failed to open billing portal");
      }
    } catch {
      showToast("error", "Failed to open billing portal");
    } finally {
      setOpeningPortal(false);
    }
  }, [showToast]);

  const handleSavePrompt = useCallback(
    async (key: string) => {
      setSavingPrompt(key);
      try {
        const value = prompts[key as keyof typeof prompts];
        const res = await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [key]: value || PROMPT_DEFAULTS[key] }),
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
    },
    [prompts, showToast]
  );

  const handleResetPrompt = useCallback(
    async (key: string) => {
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
    },
    [showToast]
  );

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
                  Anthropic API Key
                </h2>
                {hasAnthropicKey ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    data-testid="key-status-set"
                  >
                    Set
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    data-testid="key-status-missing"
                  >
                    Missing
                  </span>
                )}
              </div>
              <p className="text-sm text-[var(--muted-foreground)]">
                AI generation uses the server-side ANTHROPIC_API_KEY environment variable. Keys are
                never returned to the browser or edited here.
              </p>
            </section>

            {/* Model Section */}
            <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
              <h2 className="mb-4 text-lg font-semibold text-[var(--card-foreground)]">
                Claude Model
              </h2>
              <p className="mb-3 text-sm text-[var(--muted-foreground)]">
                Select which Claude model to use for architecture generation.
              </p>
              {!isAdmin ? (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <select
                      value={model}
                      disabled
                      className="flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm opacity-75"
                      aria-label="Claude Model"
                    >
                      {VALID_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.id})
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    Model selection is managed by an administrator. Current role: {currentRole}.
                  </p>
                </div>
              ) : (
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
              )}
            </section>

            {/* Theme Section */}
            <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
              <h2 className="mb-4 text-lg font-semibold text-[var(--card-foreground)]">Theme</h2>
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

            {/* Billing Section */}
            {billing && billing.plan !== "free" && (
              <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
                <h2 className="mb-4 text-lg font-semibold text-[var(--card-foreground)]">
                  Billing
                </h2>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[var(--muted-foreground)]">Current Plan</span>
                    <span className="text-sm font-medium text-[var(--foreground)] capitalize">
                      {billing.plan}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[var(--muted-foreground)]">Billing Interval</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--foreground)] capitalize">
                        {billing.billingInterval}
                      </span>
                      {billing.billingInterval === "monthly" && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          Save ~21% with annual
                        </span>
                      )}
                    </div>
                  </div>
                  {billing.currentPeriodEnd && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[var(--muted-foreground)]">
                        Next Billing Date
                      </span>
                      <span className="text-sm font-medium text-[var(--foreground)]">
                        {new Date(billing.currentPeriodEnd).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {billing.status && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[var(--muted-foreground)]">Status</span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          billing.status === "active"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : billing.status === "past_due"
                              ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        }`}
                      >
                        {billing.status === "past_due"
                          ? "Past Due"
                          : billing.status === "canceled"
                            ? "Cancels at period end"
                            : billing.status}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
                    {billing.status === "active" && (
                      <>
                        <button
                          onClick={() => setShowChangePlan(true)}
                          className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]"
                        >
                          Change Plan
                        </button>
                        <button
                          onClick={handleUpdatePayment}
                          disabled={updatingPayment}
                          className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
                        >
                          {updatingPayment ? "Opening..." : "Update Payment Method"}
                        </button>
                        <button
                          onClick={handleSwitchInterval}
                          disabled={switchingInterval}
                          className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
                        >
                          {switchingInterval
                            ? "Switching..."
                            : billing.billingInterval === "monthly"
                              ? "Switch to Annual (Save ~21%)"
                              : "Switch to Monthly"}
                        </button>
                        <button
                          onClick={() => setShowCancelConfirm(true)}
                          className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                        >
                          Cancel Subscription
                        </button>
                      </>
                    )}
                    {billing.status === "canceled" && (
                      <button
                        onClick={handleReactivate}
                        disabled={canceling}
                        className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {canceling ? "Reactivating..." : "Reactivate Subscription"}
                      </button>
                    )}
                    <button
                      onClick={handleOpenPortal}
                      disabled={openingPortal}
                      className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
                    >
                      {openingPortal ? "Opening..." : "Invoice History"}
                    </button>
                  </div>
                  {billing.billingInterval === "monthly" && billing.status === "active" && (
                    <p className="text-xs text-[var(--muted-foreground)]">
                      Switching to annual billing will prorate the charge.
                    </p>
                  )}
                </div>

                {/* Cancel Confirmation Dialog */}
                {showCancelConfirm && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                    <div className="mx-4 max-w-md rounded-lg bg-[var(--card)] p-6 shadow-xl">
                      <h3 className="mb-2 text-lg font-semibold text-[var(--card-foreground)]">
                        Cancel Subscription?
                      </h3>
                      <p className="mb-4 text-sm text-[var(--muted-foreground)]">
                        Your subscription will remain active until the end of your current billing
                        period
                        {billing.currentPeriodEnd && (
                          <> ({new Date(billing.currentPeriodEnd).toLocaleDateString()})</>
                        )}
                        . After that, you&apos;ll be downgraded to the Free plan.
                      </p>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setShowCancelConfirm(false)}
                          className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]"
                        >
                          Keep Subscription
                        </button>
                        <button
                          onClick={handleCancelSubscription}
                          disabled={canceling}
                          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {canceling ? "Canceling..." : "Yes, Cancel"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Change Plan Dialog */}
                {showChangePlan && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                    <div className="mx-4 max-w-md rounded-lg bg-[var(--card)] p-6 shadow-xl">
                      <h3 className="mb-4 text-lg font-semibold text-[var(--card-foreground)]">
                        Change Plan
                      </h3>
                      <div className="space-y-2">
                        {[
                          { key: "pro", label: "Pro", price: "$19/mo" },
                          { key: "team5", label: "Team (5 users)", price: "$39/mo" },
                          { key: "team15", label: "Team (15 users)", price: "$79/mo" },
                        ].map((p) => {
                          const isCurrent =
                            billing.plan === (p.key.startsWith("team") ? "team" : p.key);
                          return (
                            <button
                              key={p.key}
                              onClick={() => handleChangePlan(p.key)}
                              disabled={changingPlan || isCurrent}
                              className={`flex w-full items-center justify-between rounded-md border px-4 py-3 text-left text-sm font-medium transition-colors ${
                                isCurrent
                                  ? "border-[var(--color-client)] bg-[var(--color-client)]/10 text-[var(--foreground)]"
                                  : "border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
                              }`}
                            >
                              <span>{p.label}</span>
                              <span className="text-[var(--muted-foreground)]">
                                {isCurrent ? "Current" : p.price}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                        Plan changes are prorated. You&apos;ll be charged or credited the
                        difference.
                      </p>
                      <div className="mt-4 flex justify-end">
                        <button
                          onClick={() => setShowChangePlan(false)}
                          className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Node Subtypes Section */}
            <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
              <h2 className="mb-4 text-lg font-semibold text-[var(--card-foreground)]">
                Node Subtypes
              </h2>
              <p className="mb-4 text-sm text-[var(--muted-foreground)]">
                Add custom subtypes to existing node categories. Built-in subtypes are always
                available.
              </p>
              {!isAdmin ? (
                <p className="text-sm text-[var(--muted-foreground)]">
                  Custom subtype configuration is managed by an administrator.
                </p>
              ) : (
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
              )}
            </section>
            {/* AI Prompts Section — Admin Only */}
            {isAdmin && (
              <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
                <h2 className="mb-4 text-lg font-semibold text-[var(--card-foreground)]">
                  AI Prompts
                </h2>
                <p className="mb-4 text-sm text-[var(--muted-foreground)]">
                  Customize the system prompts used by AI features. Leave empty to use the default.
                </p>
                <div className="space-y-4">
                  {(
                    [
                      {
                        key: "prompt_chat",
                        label: "Chat Prompt",
                        description:
                          "System prompt for the architecture chat interview. The valid categories/subtypes section is appended automatically.",
                      },
                      {
                        key: "prompt_alternatives",
                        label: "Alternatives Prompt",
                        description:
                          "System prompt for suggesting alternative technologies for a node.",
                      },
                      {
                        key: "prompt_prd",
                        label: "PRD Export Prompt",
                        description: "System prompt for generating Product Requirements Documents.",
                      },
                    ] as const
                  ).map(({ key, label, description }) => (
                    <div key={key} className="rounded border border-[var(--border)]">
                      <button
                        type="button"
                        onClick={() => setExpandedPrompt(expandedPrompt === key ? null : key)}
                        className="flex w-full items-center justify-between p-4 text-left"
                      >
                        <div>
                          <span className="font-medium text-[var(--card-foreground)]">{label}</span>
                          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                            {description}
                          </p>
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
                            value={prompts[key] || PROMPT_DEFAULTS[key]}
                            onChange={(e) =>
                              setPrompts((prev) => ({ ...prev, [key]: e.target.value }))
                            }
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
