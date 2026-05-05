"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  DEFAULT_PLAN_CATALOG,
  DIAGRAM_EXPORT_FORMATS,
  PUBLIC_PLAN_KEYS,
  type DiagramExportFormat,
  type LimitValue,
  type PlanCatalog,
  type PlanCatalogEntry,
  type PublicPlanKey,
} from "@/lib/plan-config";

interface User {
  id: string;
  githubId: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  role: string;
  createdAt: number;
  isCurrent?: boolean;
}

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [planDraft, setPlanDraft] = useState<PlanCatalog>(DEFAULT_PLAN_CATALOG);
  const [activeTab, setActiveTab] = useState<"users" | "plans">("users");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [planSaving, setPlanSaving] = useState(false);
  const [planStatus, setPlanStatus] = useState("");
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    githubId: "",
    role: "free",
  });
  const [creating, setCreating] = useState(false);
  const [impersonatingUserId, setImpersonatingUserId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/users").then((res) => {
        if (res.status === 403) throw new Error("Access denied");
        if (!res.ok) throw new Error("Failed to load users");
        return res.json();
      }),
      fetch("/api/admin/plans").then((res) => {
        if (res.status === 403) throw new Error("Access denied");
        if (!res.ok) throw new Error("Failed to load plans");
        return res.json();
      }),
    ])
      .then(([usersData, plansData]) => {
        setUsers(usersData);
        if (plansData?.plans) setPlanDraft(plansData.plans);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function updatePlan<K extends PublicPlanKey>(
    key: K,
    updater: (plan: PlanCatalog[K]) => PlanCatalog[K]
  ) {
    setPlanDraft((prev) => ({ ...prev, [key]: updater(prev[key]) }));
    setPlanStatus("");
  }

  function setPlanText(
    key: PublicPlanKey,
    field: "name" | "shortName" | "description" | "cta",
    value: string
  ) {
    updatePlan(key, (plan) => ({ ...plan, [field]: value }));
  }

  function setPlanBilling(
    key: PublicPlanKey,
    field: keyof PlanCatalogEntry["billing"],
    value: string
  ) {
    updatePlan(key, (plan) => ({
      ...plan,
      billing: {
        ...plan.billing,
        [field]:
          field === "monthlyPrice" || field === "annualPrice"
            ? value === ""
              ? undefined
              : Number(value)
            : value,
      },
    }));
  }

  function setPlanLimit(
    key: PublicPlanKey,
    field: "projects" | "scansPerMonth",
    unlimited: boolean,
    value?: string
  ) {
    updatePlan(key, (plan) => {
      const nextValue: LimitValue = unlimited ? "unlimited" : Math.max(0, Number(value || 0));
      return { ...plan, features: { ...plan.features, [field]: nextValue } };
    });
  }

  function setPlanToggle(
    key: PublicPlanKey,
    field:
      | "nodeDescriptions"
      | "nodeLocking"
      | "connectionTypes"
      | "alternatives"
      | "prdExport"
      | "customSubtypes"
      | "collaboration",
    value: boolean
  ) {
    updatePlan(key, (plan) => ({
      ...plan,
      features: { ...plan.features, [field]: value },
    }));
  }

  function setPlanExport(key: PublicPlanKey, format: DiagramExportFormat, enabled: boolean) {
    updatePlan(key, (plan) => {
      const current = new Set(plan.features.exports);
      if (enabled) current.add(format);
      else current.delete(format);
      const exports = DIAGRAM_EXPORT_FORMATS.filter((item) => current.has(item));
      return {
        ...plan,
        features: {
          ...plan.features,
          exports: exports.length > 0 ? exports : ["json"],
        },
      };
    });
  }

  function setPlanBullets(key: PublicPlanKey, value: string) {
    updatePlan(key, (plan) => ({
      ...plan,
      bullets: value.split("\n"),
    }));
  }

  function normalizePlanBullets(catalog: PlanCatalog): PlanCatalog {
    return {
      ...catalog,
      free: {
        ...catalog.free,
        bullets: catalog.free.bullets.map((line) => line.trim()).filter(Boolean),
      },
      starter: {
        ...catalog.starter,
        bullets: catalog.starter.bullets.map((line) => line.trim()).filter(Boolean),
      },
      pro: {
        ...catalog.pro,
        bullets: catalog.pro.bullets.map((line) => line.trim()).filter(Boolean),
      },
    };
  }

  async function handleSavePlans() {
    setPlanSaving(true);
    setPlanStatus("");
    setError("");
    const plans = normalizePlanBullets(planDraft);
    const res = await fetch("/api/admin/plans", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plans }),
    });
    const data = await res.json().catch(() => ({ error: "Failed to save plans" }));
    if (res.ok) {
      setPlanDraft(data.plans);
      setPlanStatus("Plan catalog saved");
    } else {
      setError(data.error || "Failed to save plans");
    }
    setPlanSaving(false);
  }

  const userRoleOptions = [
    { value: "free", label: planDraft.free.name },
    { value: "starter", label: planDraft.starter.name },
    { value: "pro", label: planDraft.pro.name },
    { value: "admin", label: "Admin" },
  ];

  async function handleCreateUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setError("");

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: createForm.name.trim(),
        email: createForm.email.trim(),
        githubId: createForm.githubId.trim() || undefined,
        role: createForm.role,
      }),
    });
    const data = await res.json().catch(() => ({ error: "Failed to create user" }));

    if (res.ok) {
      setUsers((prev) => [...prev, data]);
      setCreateForm({ name: "", email: "", githubId: "", role: "free" });
    } else {
      setError(data.error || "Failed to create user");
    }
    setCreating(false);
  }

  async function handleRoleChange(userId: string, role: string) {
    const prev = users.map((u) => ({ ...u }));
    setUsers((us) => us.map((u) => (u.id === userId ? { ...u, role } : u)));

    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    if (!res.ok) {
      setUsers(prev);
      const data = await res.json().catch(() => ({ error: "Failed" }));
      setError(data.error || "Failed to update role");
    }
  }

  async function handleImpersonate(user: User) {
    setImpersonatingUserId(user.id);
    setError("");
    const res = await fetch("/api/admin/impersonation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id }),
    });

    if (res.ok) {
      window.location.href = "/app";
      return;
    }

    const data = await res.json().catch(() => ({ error: "Failed to impersonate user" }));
    setError(data.error || "Failed to impersonate user");
    setImpersonatingUserId(null);
  }

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/users?userId=${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      } else {
        const data = await res.json().catch(() => ({ error: "Failed" }));
        setError(data.error || "Failed to delete user");
      }
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] text-[var(--muted-foreground)]">
        Loading...
      </div>
    );
  }

  if (error === "Access denied") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)]">
        <p className="mb-4 text-[var(--danger)]">Access denied</p>
        <Link href="/app" className="text-[var(--color-client)] hover:underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/app"
              className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              &larr; Dashboard
            </Link>
            <span className="text-lg font-bold tracking-tight">User and Plan Management</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {error && error !== "Access denied" && (
          <div className="mb-4 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-surface)] px-4 py-2 text-sm text-[var(--danger)]">
            {error}
          </div>
        )}

        <div className="mb-6 border-b border-[var(--border)]">
          <div role="tablist" aria-label="Admin sections" className="flex gap-2">
            {(
              [
                ["users", "Users"],
                ["plans", "Plans"],
              ] as const
            ).map(([tab, label]) => {
              const selected = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTab(tab)}
                  className={`min-h-11 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                    selected
                      ? "border-[var(--color-client)] text-[var(--foreground)]"
                      : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {activeTab === "plans" && (
          <section className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--card-foreground)]">
                  Plan Designer
                </h2>
                <p className="text-sm text-[var(--muted-foreground)]">
                  Configure public plan copy, display prices, Stripe price IDs, and feature access.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {planStatus && (
                  <span className="text-sm font-medium text-[var(--success)]">{planStatus}</span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setPlanDraft(DEFAULT_PLAN_CATALOG);
                    setPlanStatus("Defaults loaded, save to publish");
                  }}
                  disabled={planSaving}
                  className="min-h-11 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--muted)] disabled:opacity-50"
                >
                  Reset defaults
                </button>
                <button
                  type="button"
                  onClick={handleSavePlans}
                  disabled={planSaving}
                  className="min-h-11 rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)] disabled:opacity-50"
                >
                  {planSaving ? "Saving..." : "Save plans"}
                </button>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              {PUBLIC_PLAN_KEYS.map((planKey) => {
                const plan = planDraft[planKey];
                const projectsUnlimited = plan.features.projects === "unlimited";
                const scansUnlimited = plan.features.scansPerMonth === "unlimited";

                return (
                  <div
                    key={planKey}
                    className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--background)] p-4"
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-[var(--foreground)]">{plan.name}</h3>
                        <p className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                          {plan.key}
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-xs font-medium text-[var(--muted-foreground)]">
                        <input
                          type="checkbox"
                          checked={plan.featured}
                          onChange={(e) =>
                            updatePlan(planKey, (prev) => ({ ...prev, featured: e.target.checked }))
                          }
                        />
                        Featured
                      </label>
                    </div>

                    <div className="space-y-3">
                      <label className="flex flex-col gap-1 text-sm font-medium">
                        Name
                        <input
                          value={plan.name}
                          onChange={(e) => setPlanText(planKey, "name", e.target.value)}
                          className="min-h-11 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-sm font-medium">
                        Short name
                        <input
                          value={plan.shortName}
                          onChange={(e) => setPlanText(planKey, "shortName", e.target.value)}
                          className="min-h-11 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-sm font-medium">
                        Description
                        <textarea
                          value={plan.description}
                          onChange={(e) => setPlanText(planKey, "description", e.target.value)}
                          rows={3}
                          className="rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-sm font-medium">
                        CTA
                        <input
                          value={plan.cta}
                          onChange={(e) => setPlanText(planKey, "cta", e.target.value)}
                          className="min-h-11 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-sm font-medium">
                        Marketing bullets
                        <textarea
                          value={plan.bullets.join("\n")}
                          onChange={(e) => setPlanBullets(planKey, e.target.value)}
                          rows={5}
                          className="rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                        />
                      </label>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1 text-sm font-medium">
                          Monthly display price
                          <input
                            type="number"
                            min="0"
                            value={plan.billing.monthlyPrice}
                            onChange={(e) =>
                              setPlanBilling(planKey, "monthlyPrice", e.target.value)
                            }
                            className="min-h-11 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-normal"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-sm font-medium">
                          Annual monthly price
                          <input
                            type="number"
                            min="0"
                            value={plan.billing.annualPrice ?? ""}
                            onChange={(e) => setPlanBilling(planKey, "annualPrice", e.target.value)}
                            className="min-h-11 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-normal"
                          />
                        </label>
                      </div>

                      {planKey !== "free" && (
                        <div className="grid gap-3">
                          <label className="flex flex-col gap-1 text-sm font-medium">
                            Monthly Stripe price ID
                            <input
                              value={plan.billing.monthlyStripePriceId ?? ""}
                              onChange={(e) =>
                                setPlanBilling(planKey, "monthlyStripePriceId", e.target.value)
                              }
                              placeholder="price_..."
                              className="min-h-11 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-normal"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-sm font-medium">
                            Annual Stripe price ID
                            <input
                              value={plan.billing.annualStripePriceId ?? ""}
                              onChange={(e) =>
                                setPlanBilling(planKey, "annualStripePriceId", e.target.value)
                              }
                              placeholder="price_..."
                              className="min-h-11 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-normal"
                            />
                          </label>
                        </div>
                      )}

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1 text-sm font-medium">
                          Projects
                          <input
                            type="number"
                            min="0"
                            disabled={projectsUnlimited}
                            value={projectsUnlimited ? "" : plan.features.projects}
                            onChange={(e) =>
                              setPlanLimit(planKey, "projects", false, e.target.value)
                            }
                            className="min-h-11 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-normal disabled:opacity-50"
                          />
                        </label>
                        <label className="mt-6 flex min-h-11 items-center gap-2 text-sm font-medium">
                          <input
                            type="checkbox"
                            checked={projectsUnlimited}
                            onChange={(e) => setPlanLimit(planKey, "projects", e.target.checked)}
                          />
                          Unlimited
                        </label>
                        <label className="flex flex-col gap-1 text-sm font-medium">
                          Scans per month
                          <input
                            type="number"
                            min="0"
                            disabled={scansUnlimited}
                            value={scansUnlimited ? "" : plan.features.scansPerMonth}
                            onChange={(e) =>
                              setPlanLimit(planKey, "scansPerMonth", false, e.target.value)
                            }
                            className="min-h-11 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-normal disabled:opacity-50"
                          />
                        </label>
                        <label className="mt-6 flex min-h-11 items-center gap-2 text-sm font-medium">
                          <input
                            type="checkbox"
                            checked={scansUnlimited}
                            onChange={(e) =>
                              setPlanLimit(planKey, "scansPerMonth", e.target.checked)
                            }
                          />
                          Unlimited
                        </label>
                      </div>

                      <div>
                        <div className="mb-2 text-sm font-medium">Features</div>
                        <div className="grid grid-cols-2 gap-2">
                          {DIAGRAM_EXPORT_FORMATS.map((format) => (
                            <label key={format} className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={plan.features.exports.includes(format)}
                                onChange={(e) => setPlanExport(planKey, format, e.target.checked)}
                              />
                              Diagram export: {format.toUpperCase()}
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="grid gap-2 text-sm">
                        {(
                          [
                            ["nodeDescriptions", "Node descriptions"],
                            ["nodeLocking", "Node locking"],
                            ["connectionTypes", "Connection types"],
                            ["alternatives", "Alternatives"],
                            ["prdExport", "PRD export"],
                            ["customSubtypes", "Custom subtypes"],
                            ["collaboration", "Collaboration"],
                          ] as const
                        ).map(([field, label]) => (
                          <label key={field} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={plan.features[field]}
                              onChange={(e) => setPlanToggle(planKey, field, e.target.checked)}
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {activeTab === "users" && (
          <>
            <form
              onSubmit={handleCreateUser}
              className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
            >
              <div className="mb-4 flex flex-col gap-1">
                <h2 className="text-lg font-semibold text-[var(--card-foreground)]">Create user</h2>
                <p className="text-sm text-[var(--muted-foreground)]">
                  Create a local user for QA or support. Add a GitHub ID only when you want to link
                  it to a real GitHub account.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_180px]">
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Name
                  <input
                    value={createForm.name}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Jane Customer"
                    className="min-h-11 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-normal text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Email
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="jane@example.com"
                    className="min-h-11 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-normal text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Role
                  <select
                    value={createForm.role}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, role: e.target.value }))}
                    className="min-h-11 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-normal text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  >
                    {userRoleOptions.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                <label className="flex flex-col gap-1 text-sm font-medium">
                  GitHub ID optional
                  <input
                    value={createForm.githubId}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, githubId: e.target.value }))
                    }
                    placeholder="Leave blank for manual user"
                    className="min-h-11 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-normal text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  />
                </label>
                <button
                  type="submit"
                  disabled={creating || !createForm.name.trim()}
                  className="min-h-11 self-end rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)] disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create user"}
                </button>
              </div>
            </form>

            <div className="overflow-hidden rounded-xl border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--muted)]">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                      User
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                      Email
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                      Role
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                      Joined
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-[var(--muted-foreground)]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {users.map((user) => (
                    <tr key={user.id} className="bg-[var(--card)]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand)] text-xs font-medium text-[var(--brand-foreground)]">
                            {(user.name || user.githubId).slice(0, 1).toUpperCase()}
                          </span>
                          <span className="font-medium text-[var(--card-foreground)]">
                            {user.name || user.githubId}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[var(--muted-foreground)]">
                        {user.email || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user.id, e.target.value)}
                          className="min-h-11 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-2 text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                        >
                          {userRoleOptions.map((role) => (
                            <option key={role.value} value={role.value}>
                              {role.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-[var(--muted-foreground)]">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {user.isCurrent ? (
                            <span className="inline-flex min-h-11 items-center px-3 py-2 text-xs text-[var(--muted-foreground)]">
                              You
                            </span>
                          ) : (
                            <button
                              onClick={() => handleImpersonate(user)}
                              disabled={impersonatingUserId === user.id}
                              className="min-h-11 rounded px-3 py-2 text-xs text-[var(--color-client)] hover:bg-[var(--muted)] disabled:opacity-50"
                            >
                              {impersonatingUserId === user.id ? "Starting..." : "Impersonate"}
                            </button>
                          )}
                          <button
                            onClick={() => setDeleteTarget(user)}
                            disabled={user.isCurrent}
                            className="min-h-11 rounded px-3 py-2 text-xs text-[var(--danger)] hover:bg-[var(--danger-surface)] disabled:opacity-40"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-8 text-center text-[var(--muted-foreground)]"
                      >
                        No users found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)]"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-user-title"
            className="mx-4 w-full max-w-sm rounded-xl bg-[var(--card)] p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="delete-user-title"
              className="text-lg font-semibold text-[var(--card-foreground)]"
            >
              Delete User
            </h3>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              Are you sure you want to delete{" "}
              <strong>{deleteTarget.name || deleteTarget.githubId}</strong>? This will also delete
              all their projects.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="min-h-11 rounded-md px-3 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="min-h-11 rounded-md bg-[var(--danger)] px-3 py-2 text-sm text-[var(--danger-foreground)] hover:bg-[var(--danger-hover)] disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
