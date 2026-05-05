"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { USER_ROLE_OPTIONS } from "@/lib/roles";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
    fetch("/api/admin/users")
      .then((res) => {
        if (res.status === 403) throw new Error("Access denied");
        if (!res.ok) throw new Error("Failed to load users");
        return res.json();
      })
      .then((data) => setUsers(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

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
        <p className="mb-4 text-red-500">Access denied</p>
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
            <span className="text-lg font-bold tracking-tight">User Management</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {error && error !== "Access denied" && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}

        <form
          onSubmit={handleCreateUser}
          className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
        >
          <div className="mb-4 flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-[var(--card-foreground)]">Create user</h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              Create a local user for QA or support. Add a GitHub ID only when you want to link it
              to a real GitHub account.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_180px]">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Name
              <input
                value={createForm.name}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Jane Customer"
                className="min-h-11 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-normal text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-client)]"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Email
              <input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="jane@example.com"
                className="min-h-11 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-normal text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-client)]"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Role
              <select
                value={createForm.role}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, role: e.target.value }))}
                className="min-h-11 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-normal text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-client)]"
              >
                {USER_ROLE_OPTIONS.map((role) => (
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
                onChange={(e) => setCreateForm((prev) => ({ ...prev, githubId: e.target.value }))}
                placeholder="Leave blank for manual user"
                className="min-h-11 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-normal text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-client)]"
              />
            </label>
            <button
              type="submit"
              disabled={creating || !createForm.name.trim()}
              className="min-h-11 self-end rounded-md bg-[var(--color-client)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
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
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-client)] text-xs font-medium text-white">
                        {(user.name || user.githubId).slice(0, 1).toUpperCase()}
                      </span>
                      <span className="font-medium text-[var(--card-foreground)]">
                        {user.name || user.githubId}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">{user.email || "—"}</td>
                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      className="min-h-11 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-2 text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--color-client)]"
                    >
                      {USER_ROLE_OPTIONS.map((role) => (
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
                        className="min-h-11 rounded px-3 py-2 text-xs text-red-500 hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-950"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[var(--muted-foreground)]">
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
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
                className="min-h-11 rounded-md bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
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
