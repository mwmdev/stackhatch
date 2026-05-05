"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

interface Settings {
  hasAnthropicKey?: boolean;
  hasUserAnthropicKey?: boolean;
  theme?: string;
}

interface BillingSummary {
  plan: string;
  billingInterval: string | null;
  status: string | null;
  currentPeriodEnd: number | null;
}

export default function SettingsPage() {
  const { theme: currentTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const [loading, setLoading] = useState(true);
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [hasUserAnthropicKey, setHasUserAnthropicKey] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [billing, setBilling] = useState<BillingSummary | null>(null);
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
      .then(([data, billingData]: [Settings, BillingSummary | null]) => {
        setHasAnthropicKey(Boolean(data.hasAnthropicKey));
        setHasUserAnthropicKey(Boolean(data.hasUserAnthropicKey));
        if (data.theme) {
          setTheme(data.theme);
        }
        if (billingData) {
          setBilling(billingData);
        }
      })
      .catch(() => {
        // Keep the page usable even when optional settings fail to load.
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
      const data = await res.json();
      if (res.ok) {
        setApiKey("");
        setHasAnthropicKey(Boolean(data.hasAnthropicKey));
        setHasUserAnthropicKey(Boolean(data.hasUserAnthropicKey));
        showToast("success", "BYOK key saved");
      } else {
        showToast("error", data.error || "Failed to save API key");
      }
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
      const data = await res.json();
      if (res.ok) {
        setHasAnthropicKey(Boolean(data.hasAnthropicKey));
        setHasUserAnthropicKey(Boolean(data.hasUserAnthropicKey));
        showToast("success", "BYOK key removed");
      } else {
        showToast("error", data.error || "Failed to remove API key");
      }
    } catch {
      showToast("error", "Failed to remove API key");
    } finally {
      setSavingApiKey(false);
    }
  }, [showToast]);

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
        // Theme already applied locally, DB save is best-effort.
      }
    },
    [setTheme]
  );

  const handleSwitchInterval = useCallback(async () => {
    if (!billing?.billingInterval) return;
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
                {hasAnthropicKey ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--success-border)] bg-[var(--success-surface)] px-2 py-0.5 text-xs font-medium text-[var(--success)]"
                    data-testid="key-status-set"
                  >
                    Set
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--danger-border)] bg-[var(--danger-surface)] px-2 py-0.5 text-xs font-medium text-[var(--danger)]"
                    data-testid="key-status-missing"
                  >
                    Missing
                  </span>
                )}
              </div>
              <p className="text-sm text-[var(--muted-foreground)]">
                Every plan uses your own Anthropic key. Keys are encrypted at rest and are never
                returned to the browser.
              </p>
              <div className="mt-4 rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                  Your BYOK key
                </p>
                <p className="mt-1 text-sm font-medium text-[var(--foreground)]">
                  {hasUserAnthropicKey ? "Saved" : "Not saved"}
                </p>
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <label className="sr-only" htmlFor="anthropic-api-key">
                  API Key
                </label>
                <input
                  id="anthropic-api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  autoComplete="off"
                  className="min-h-11 flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
                <button
                  type="button"
                  onClick={handleSaveApiKey}
                  disabled={savingApiKey || !apiKey.trim()}
                  className="min-h-11 rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)] disabled:opacity-50"
                >
                  {savingApiKey ? "Saving..." : "Save key"}
                </button>
                {hasUserAnthropicKey && (
                  <button
                    type="button"
                    onClick={handleClearApiKey}
                    disabled={savingApiKey}
                    className="min-h-11 rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
              <h2 className="mb-4 text-lg font-semibold text-[var(--card-foreground)]">Theme</h2>
              <p className="mb-3 text-sm text-[var(--muted-foreground)]">
                Choose your preferred appearance.
              </p>
              <div className="flex gap-3">
                {(["light", "dark", "system"] as const).map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    onClick={() => handleThemeChange(theme)}
                    className={`rounded-md border px-4 py-2 text-sm font-medium capitalize transition-colors ${
                      currentTheme === theme
                        ? "border-[var(--color-client)] bg-[var(--brand)] text-[var(--brand-foreground)]"
                        : "border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)]"
                    }`}
                    aria-label={`Theme ${theme}`}
                    aria-pressed={currentTheme === theme}
                  >
                    {theme}
                  </button>
                ))}
              </div>
            </section>

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
                        <span className="rounded-full border border-[var(--success-border)] bg-[var(--success-surface)] px-2 py-0.5 text-xs font-medium text-[var(--success)]">
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
                            ? "border border-[var(--success-border)] bg-[var(--success-surface)] text-[var(--success)]"
                            : billing.status === "past_due"
                              ? "border border-[var(--warning-border)] bg-[var(--warning-surface)] text-[var(--warning)]"
                              : "border border-[var(--danger-border)] bg-[var(--danger-surface)] text-[var(--danger)]"
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
                          type="button"
                          onClick={() => setShowChangePlan(true)}
                          className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]"
                        >
                          Change Plan
                        </button>
                        <button
                          type="button"
                          onClick={handleUpdatePayment}
                          disabled={updatingPayment}
                          className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
                        >
                          {updatingPayment ? "Opening..." : "Update Payment Method"}
                        </button>
                        <button
                          type="button"
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
                          type="button"
                          onClick={() => setShowCancelConfirm(true)}
                          className="rounded-md border border-[var(--danger-border)] px-4 py-2 text-sm font-medium text-[var(--danger)] hover:bg-[var(--danger-surface)]"
                        >
                          Cancel Subscription
                        </button>
                      </>
                    )}
                    {billing.status === "canceled" && (
                      <button
                        type="button"
                        onClick={handleReactivate}
                        disabled={canceling}
                        className="rounded-md bg-[var(--success)] px-4 py-2 text-sm font-medium text-[var(--success-foreground)] hover:opacity-90 disabled:opacity-50"
                      >
                        {canceling ? "Reactivating..." : "Reactivate Subscription"}
                      </button>
                    )}
                    <button
                      type="button"
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
              </section>
            )}
          </div>
        )}
      </main>

      {showCancelConfirm && billing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)]">
          <div className="mx-4 max-w-md rounded-lg bg-[var(--card)] p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-[var(--card-foreground)]">
              Cancel Subscription?
            </h3>
            <p className="mb-4 text-sm text-[var(--muted-foreground)]">
              Your subscription will remain active until the end of your current billing period
              {billing.currentPeriodEnd && (
                <> ({new Date(billing.currentPeriodEnd).toLocaleDateString()})</>
              )}
              . After that, you&apos;ll be downgraded to the Free plan.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCancelConfirm(false)}
                className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]"
              >
                Keep Subscription
              </button>
              <button
                type="button"
                onClick={handleCancelSubscription}
                disabled={canceling}
                className="rounded-md bg-[var(--danger)] px-4 py-2 text-sm font-medium text-[var(--danger-foreground)] hover:bg-[var(--danger-hover)] disabled:opacity-50"
              >
                {canceling ? "Canceling..." : "Yes, Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showChangePlan && billing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)]">
          <div className="mx-4 max-w-md rounded-lg bg-[var(--card)] p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-[var(--card-foreground)]">
              Change Plan
            </h3>
            <div className="space-y-2">
              {[
                { key: "starter", label: "Builder", price: "$6/mo" },
                { key: "pro", label: "Studio", price: "$14/mo" },
              ].map((plan) => {
                const isCurrent = billing.plan === plan.key;
                return (
                  <button
                    key={plan.key}
                    type="button"
                    onClick={() => handleChangePlan(plan.key)}
                    disabled={changingPlan || isCurrent}
                    className={`flex w-full items-center justify-between rounded-md border px-4 py-3 text-left text-sm font-medium transition-colors ${
                      isCurrent
                        ? "border-[var(--color-client)] bg-[var(--brand)]/10 text-[var(--foreground)]"
                        : "border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
                    }`}
                  >
                    <span>{plan.label}</span>
                    <span className="text-[var(--muted-foreground)]">
                      {isCurrent ? "Current" : plan.price}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-[var(--muted-foreground)]">
              Plan changes are prorated. You&apos;ll be charged or credited the difference.
            </p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowChangePlan(false)}
                className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 rounded-lg px-4 py-3 text-sm font-medium shadow-lg transition-opacity ${
            toast.type === "success"
              ? "bg-[var(--success)] text-[var(--success-foreground)]"
              : "bg-[var(--danger)] text-[var(--danger-foreground)]"
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
