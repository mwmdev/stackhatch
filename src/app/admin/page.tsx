"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import AppPageActions from "@/components/shells/AppPageActions";
import AppPageShell from "@/components/shells/AppPageShell";
import IconControl from "@/components/ui/IconControl";
import { categoryOrder, nodeConfig } from "@/lib/node-config";
import type { CustomSubtypesMap, CustomSubtypeEntry } from "@/lib/custom-subtypes";
import type { NodeCategory } from "@/types/stack";
import {
  DEFAULT_ALTERNATIVES_PROMPT,
  DEFAULT_CHAT_PROMPT,
  DEFAULT_PRD_PROMPT,
} from "@/lib/ai/default-prompts";

interface User {
  id: string;
  githubId: string;
  email: string | null;
  name: string | null;
  role: "user" | "admin";
  createdAt: number;
  isCurrent?: boolean;
}

interface AdminSettings {
  customSubtypes?: string;
  prompt_chat?: string;
  prompt_alternatives?: string;
  prompt_prd?: string;
}

const PROMPT_DEFAULTS = {
  prompt_chat: DEFAULT_CHAT_PROMPT,
  prompt_alternatives: DEFAULT_ALTERNATIVES_PROMPT,
  prompt_prd: DEFAULT_PRD_PROMPT,
};

const PROMPT_CONFIGS = [
  {
    key: "prompt_chat",
    label: "Chat Prompt",
    description: "System prompt for the architecture chat interview.",
  },
  {
    key: "prompt_alternatives",
    label: "Alternatives Prompt",
    description: "System prompt for suggesting alternative technologies.",
  },
  {
    key: "prompt_prd",
    label: "PRD Export Prompt",
    description: "System prompt for generating Product Requirements Documents.",
  },
] as const;

const USER_ROLES = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
] as const;

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState<"users" | "subtypes" | "prompts">("users");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [customSubtypes, setCustomSubtypes] = useState<CustomSubtypesMap>({});
  const [newSubtype, setNewSubtype] = useState<
    Record<NodeCategory, { slug: string; displayName: string; icon: string }>
  >({} as Record<NodeCategory, { slug: string; displayName: string; icon: string }>);
  const [subtypeStatus, setSubtypeStatus] = useState("");
  const [savingSubtypes, setSavingSubtypes] = useState(false);
  const [prompts, setPrompts] = useState({
    prompt_chat: "",
    prompt_alternatives: "",
    prompt_prd: "",
  });
  const [expandedPrompt, setExpandedPrompt] = useState<keyof typeof prompts | null>("prompt_chat");
  const [savingPrompt, setSavingPrompt] = useState<keyof typeof prompts | null>(null);
  const [promptStatus, setPromptStatus] = useState("");
  const [createForm, setCreateForm] = useState({ name: "", email: "", githubId: "", role: "user" });
  const [creating, setCreating] = useState(false);
  const [impersonatingUserId, setImpersonatingUserId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/users").then((res) => {
        if (res.status === 403) throw new Error("Access denied");
        if (!res.ok) throw new Error("Failed to load users");
        return res.json() as Promise<User[]>;
      }),
      fetch("/api/admin/settings").then((res) => {
        if (res.status === 403) throw new Error("Access denied");
        if (!res.ok) throw new Error("Failed to load admin settings");
        return res.json() as Promise<AdminSettings>;
      }),
    ])
      .then(([usersData, settingsData]) => {
        setUsers(usersData);
        if (settingsData.customSubtypes) {
          try {
            setCustomSubtypes(JSON.parse(settingsData.customSubtypes));
          } catch {
            setCustomSubtypes({});
          }
        }
        setPrompts({
          prompt_chat: settingsData.prompt_chat ?? "",
          prompt_alternatives: settingsData.prompt_alternatives ?? "",
          prompt_prd: settingsData.prompt_prd ?? "",
        });
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const saveCustomSubtypes = useCallback(async (map: CustomSubtypesMap) => {
    setSavingSubtypes(true);
    setSubtypeStatus("");
    setError("");
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customSubtypes: JSON.stringify(map) }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setSubtypeStatus("Custom subtypes saved");
    else setError(data.error || "Failed to save custom subtypes");
    setSavingSubtypes(false);
  }, []);

  const handleAddSubtype = useCallback(
    (category: NodeCategory) => {
      const form = newSubtype[category];
      if (!form?.slug || !form?.displayName) return;
      const entry: CustomSubtypeEntry = {
        slug: form.slug.toLowerCase().trim().replace(/\s+/g, "-"),
        displayName: form.displayName.trim(),
        icon: form.icon.trim() || "Box",
      };
      const existing = [
        ...Object.keys(nodeConfig[category].subtypes),
        ...(customSubtypes[category]?.map((item) => item.slug) ?? []),
      ];
      if (existing.includes(entry.slug)) {
        setError(`Subtype "${entry.slug}" already exists`);
        return;
      }
      const updated = {
        ...customSubtypes,
        [category]: [...(customSubtypes[category] ?? []), entry],
      };
      setCustomSubtypes(updated);
      setNewSubtype((prev) => ({ ...prev, [category]: { slug: "", displayName: "", icon: "" } }));
      void saveCustomSubtypes(updated);
    },
    [customSubtypes, newSubtype, saveCustomSubtypes]
  );

  const handleRemoveSubtype = useCallback(
    (category: NodeCategory, slug: string) => {
      const updated: CustomSubtypesMap = {
        ...customSubtypes,
        [category]: (customSubtypes[category] ?? []).filter((item) => item.slug !== slug),
      };
      if (updated[category]?.length === 0) delete updated[category];
      setCustomSubtypes(updated);
      void saveCustomSubtypes(updated);
    },
    [customSubtypes, saveCustomSubtypes]
  );

  async function savePrompt(key: keyof typeof prompts, value: string, status: string) {
    setSavingPrompt(key);
    setPromptStatus("");
    setError("");
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setPrompts((prev) => ({ ...prev, [key]: value }));
      setPromptStatus(status);
    } else setError(data.error || "Failed to save prompt");
    setSavingPrompt(null);
  }

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: createForm.name.trim(),
        email: createForm.email.trim() || undefined,
        githubId: createForm.githubId.trim() || undefined,
        role: createForm.role,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setUsers((prev) => [...prev, data]);
      setCreateForm({ name: "", email: "", githubId: "", role: "user" });
    } else setError(data.error || "Failed to create user");
    setCreating(false);
  }

  async function handleRoleChange(userId: string, role: "user" | "admin") {
    const previous = users;
    setUsers((current) => current.map((user) => (user.id === userId ? { ...user, role } : user)));
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    if (!res.ok) {
      setUsers(previous);
      const data = await res.json().catch(() => ({}));
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
    const data = await res.json().catch(() => ({}));
    setError(data.error || "Failed to impersonate user");
    setImpersonatingUserId(null);
  }

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/admin/users?userId=${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) setUsers((prev) => prev.filter((user) => user.id !== deleteTarget.id));
    else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to delete user");
    }
    setDeleting(false);
    setDeleteTarget(null);
  }, [deleteTarget]);

  const resumeNavigation = (
    <IconControl href="/app" label="Resume map" tooltipPlacement="bottom">
      <ArrowLeft />
    </IconControl>
  );

  if (loading) {
    return (
      <AppPageShell
        homeHref="/app"
        homeLabel="StackHatch maps"
        title="Admin"
        navigation={resumeNavigation}
        actions={<AppPageActions currentPage="admin" isAdmin={false} />}
        density="dense"
      >
        <div className="py-12 text-center text-sm text-[var(--muted-foreground)]" role="status">
          Loading admin workspace...
        </div>
      </AppPageShell>
    );
  }
  if (error === "Access denied") {
    return (
      <AppPageShell
        homeHref="/app"
        homeLabel="StackHatch maps"
        title="Admin"
        navigation={resumeNavigation}
        actions={<AppPageActions currentPage="admin" isAdmin={false} />}
        density="dense"
      >
        <div
          className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-surface)] px-4 py-3 text-sm text-[var(--danger)]"
          role="alert"
        >
          Access denied. Return to your map to continue.
        </div>
      </AppPageShell>
    );
  }

  return (
    <AppPageShell
      homeHref="/app"
      homeLabel="StackHatch maps"
      eyebrow="Operations"
      title="Admin"
      description="Manage access and shared editor configuration."
      navigation={resumeNavigation}
      actions={<AppPageActions currentPage="admin" isAdmin />}
      density="dense"
    >
      <div className="min-w-0">
        {error && (
          <div
            className="mb-4 rounded-sm border border-[var(--danger-border)] bg-[var(--danger-surface)] px-4 py-2 text-sm text-[var(--danger)]"
            role="alert"
          >
            {error}
          </div>
        )}
        <div className="grid min-w-0 gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
          <div className="min-w-0 lg:border-r lg:border-[var(--border)] lg:pr-5">
            <p className="font-utility mb-2 hidden text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)] lg:block">
              Admin instruments
            </p>
            <div
              role="tablist"
              aria-label="Admin sections"
              className="flex min-w-0 gap-1 overflow-x-auto border-y border-[var(--border)] py-2 lg:sticky lg:top-6 lg:flex-col lg:overflow-visible lg:border-y-0"
            >
              {(
                [
                  ["users", "Users"],
                  ["subtypes", "Node Subtypes"],
                  ["prompts", "Prompts"],
                ] as const
              ).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  id={`admin-tab-${tab}`}
                  aria-controls={`admin-panel-${tab}`}
                  aria-selected={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  className={`min-h-11 shrink-0 rounded-sm border px-4 py-2 text-left text-sm font-semibold lg:w-full ${activeTab === tab ? "border-[var(--color-client)] bg-[var(--muted)] text-[var(--foreground)]" : "border-transparent text-[var(--muted-foreground)] hover:border-[var(--border)] hover:bg-[var(--card)] hover:text-[var(--foreground)]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-0">
            {activeTab === "users" && (
              <section
                role="tabpanel"
                id="admin-panel-users"
                aria-labelledby="admin-tab-users"
                className="min-w-0"
              >
                <form
                  onSubmit={handleCreateUser}
                  className="mb-6 rounded-sm border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-low)] sm:p-5"
                >
                  <p className="font-utility mb-1 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                    Access · new record
                  </p>
                  <h2 className="text-lg font-semibold">Create user</h2>
                  <p className="mb-4 text-sm text-[var(--muted-foreground)]">
                    Create a local user for QA or support.
                  </p>
                  <div className="grid gap-3 md:grid-cols-[1fr_1fr_180px]">
                    <label className="flex flex-col gap-1 text-sm font-medium">
                      Name
                      <input
                        value={createForm.name}
                        onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                        className="min-h-11 rounded-sm border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-normal"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm font-medium">
                      Email
                      <input
                        type="email"
                        value={createForm.email}
                        onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
                        className="min-h-11 rounded-sm border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-normal"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm font-medium">
                      Role
                      <select
                        value={createForm.role}
                        onChange={(e) => setCreateForm((p) => ({ ...p, role: e.target.value }))}
                        className="min-h-11 rounded-sm border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-normal"
                      >
                        {USER_ROLES.map((role) => (
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
                        onChange={(e) => setCreateForm((p) => ({ ...p, githubId: e.target.value }))}
                        className="min-h-11 rounded-sm border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-normal"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={creating || !createForm.name.trim()}
                      className="min-h-11 self-end rounded-sm bg-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand-foreground)] disabled:opacity-50"
                    >
                      {creating ? "Creating..." : "Create user"}
                    </button>
                  </div>
                </form>
                <div
                  className="max-w-full overflow-x-auto rounded-sm border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-low)]"
                  data-testid="admin-users-table-scroll"
                >
                  <table className="w-full min-w-[44rem] text-sm">
                    <thead className="bg-[var(--surface-subtle)] font-utility text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
                      <tr>
                        <th className="px-4 py-3 text-left">User</th>
                        <th className="px-4 py-3 text-left">Email</th>
                        <th className="px-4 py-3 text-left">Role</th>
                        <th className="px-4 py-3 text-left">Joined</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {users.map((user) => (
                        <tr key={user.id} className="bg-[var(--card)]">
                          <td className="px-4 py-3 font-medium">{user.name || user.githubId}</td>
                          <td className="px-4 py-3 text-[var(--muted-foreground)]">
                            {user.email || "—"}
                          </td>
                          <td className="px-4 py-3">
                            <select
                              aria-label={`Role for ${user.name || user.githubId}`}
                              value={user.role}
                              onChange={(e) =>
                                handleRoleChange(user.id, e.target.value as "user" | "admin")
                              }
                              className="min-h-11 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-2 text-xs"
                            >
                              {USER_ROLES.map((role) => (
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
                            {user.isCurrent ? (
                              <span className="px-3 text-xs text-[var(--muted-foreground)]">
                                You
                              </span>
                            ) : (
                              <button
                                onClick={() => handleImpersonate(user)}
                                disabled={impersonatingUserId === user.id}
                                className="min-h-11 px-3 text-xs text-[var(--color-client)] disabled:opacity-50"
                              >
                                {impersonatingUserId === user.id ? "Starting..." : "Impersonate"}
                              </button>
                            )}
                            <button
                              onClick={() => setDeleteTarget(user)}
                              disabled={user.isCurrent}
                              className="min-h-11 px-3 text-xs text-[var(--danger)] disabled:opacity-40"
                            >
                              Delete
                            </button>
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
              </section>
            )}

            {activeTab === "subtypes" && (
              <section
                role="tabpanel"
                id="admin-panel-subtypes"
                aria-labelledby="admin-tab-subtypes"
                className="rounded-sm border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-low)] sm:p-5"
              >
                <div className="mb-4">
                  <p className="font-utility mb-1 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                    Editor catalog · shared
                  </p>
                  <h2 className="text-lg font-semibold">Node Subtypes</h2>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    Add custom subtypes to the shared editor catalog.
                  </p>
                  {savingSubtypes && (
                    <span className="text-sm" role="status">
                      Saving...
                    </span>
                  )}
                  {subtypeStatus && (
                    <span className="text-sm text-[var(--success)]" role="status">
                      {subtypeStatus}
                    </span>
                  )}
                </div>
                <div className="space-y-5">
                  {categoryOrder.map((category) => {
                    const config = nodeConfig[category];
                    const form = newSubtype[category] ?? { slug: "", displayName: "", icon: "" };
                    return (
                      <div key={category} className="rounded-sm border border-[var(--border)] p-4">
                        <h3 className="mb-2 font-medium">{config.displayName}</h3>
                        <div className="mb-3 flex flex-wrap gap-1">
                          {(customSubtypes[category] ?? []).map((entry) => (
                            <span
                              key={entry.slug}
                              className="rounded-sm border border-[var(--border)] bg-[var(--muted)] px-2 py-1 text-xs"
                            >
                              {entry.displayName}
                              <button
                                type="button"
                                aria-label={`Remove ${entry.displayName}`}
                                onClick={() => handleRemoveSubtype(category, entry.slug)}
                                className="ml-2"
                              >
                                &times;
                              </button>
                            </span>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <input
                            placeholder="slug"
                            value={form.slug}
                            onChange={(e) =>
                              setNewSubtype((p) => ({
                                ...p,
                                [category]: { ...form, slug: e.target.value },
                              }))
                            }
                            className="min-h-9 w-28 rounded border border-[var(--border)] bg-[var(--background)] px-2 text-xs"
                          />
                          <input
                            placeholder="Display Name"
                            value={form.displayName}
                            onChange={(e) =>
                              setNewSubtype((p) => ({
                                ...p,
                                [category]: { ...form, displayName: e.target.value },
                              }))
                            }
                            className="min-h-9 min-w-40 flex-1 rounded border border-[var(--border)] bg-[var(--background)] px-2 text-xs"
                          />
                          <input
                            placeholder="Icon"
                            value={form.icon}
                            onChange={(e) =>
                              setNewSubtype((p) => ({
                                ...p,
                                [category]: { ...form, icon: e.target.value },
                              }))
                            }
                            className="min-h-9 w-24 rounded border border-[var(--border)] bg-[var(--background)] px-2 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => handleAddSubtype(category)}
                            disabled={!form.slug || !form.displayName || savingSubtypes}
                            className="min-h-9 rounded bg-[var(--brand)] px-3 text-xs text-[var(--brand-foreground)] disabled:opacity-50"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {activeTab === "prompts" && (
              <section
                role="tabpanel"
                id="admin-panel-prompts"
                aria-labelledby="admin-tab-prompts"
                className="rounded-sm border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-low)] sm:p-5"
              >
                <p className="font-utility mb-1 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  AI behavior · shared
                </p>
                <h2 className="text-lg font-semibold">AI Prompts</h2>
                <p className="mb-4 text-sm text-[var(--muted-foreground)]">
                  Customize the shared system prompts used by AI features.
                </p>
                {promptStatus && (
                  <p className="mb-3 text-sm text-[var(--success)]" role="status">
                    {promptStatus}
                  </p>
                )}
                <div className="space-y-4">
                  {PROMPT_CONFIGS.map(({ key, label, description }) => (
                    <div key={key} className="rounded-sm border border-[var(--border)]">
                      <button
                        type="button"
                        onClick={() => setExpandedPrompt(expandedPrompt === key ? null : key)}
                        className="w-full p-4 text-left"
                      >
                        <span className="font-medium">{label}</span>
                        <p className="text-xs text-[var(--muted-foreground)]">{description}</p>
                      </button>
                      {expandedPrompt === key && (
                        <div className="border-t border-[var(--border)] p-4">
                          <textarea
                            value={prompts[key] || PROMPT_DEFAULTS[key]}
                            onChange={(e) => setPrompts((p) => ({ ...p, [key]: e.target.value }))}
                            rows={14}
                            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-xs"
                          />
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                savePrompt(
                                  key,
                                  prompts[key] || PROMPT_DEFAULTS[key],
                                  "Prompt saved"
                                )
                              }
                              disabled={savingPrompt === key}
                              className="min-h-11 rounded-md bg-[var(--brand)] px-4 text-sm text-[var(--brand-foreground)]"
                            >
                              Save prompt
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                savePrompt(key, PROMPT_DEFAULTS[key], "Prompt reset to default")
                              }
                              disabled={savingPrompt === key}
                              className="min-h-11 rounded-md border border-[var(--border)] px-4 text-sm"
                            >
                              Reset to default
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
        </div>
      </div>

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)]"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-user-title"
            className="mx-4 w-full max-w-sm rounded-sm border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-user-title" className="text-lg font-semibold">
              Delete User
            </h3>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              Delete <strong>{deleteTarget.name || deleteTarget.githubId}</strong> and all their
              projects?
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="min-h-11 px-3"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="min-h-11 rounded-md bg-[var(--danger)] px-3 text-[var(--danger-foreground)]"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppPageShell>
  );
}
