"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import ThemeToggle from "@/components/ThemeToggle";

interface Member {
  userId: string;
  role: string;
  joinedAt: number;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

interface Invite {
  id: string;
  email: string;
  inviteUrl: string;
  status: string;
  expiresAt: number;
}

interface TeamData {
  id: string;
  name: string;
  ownerId: string;
  members: Member[];
  isOwner: boolean;
}

export default function TeamPage() {
  const params = useParams();
  const teamId = params.id as string;

  const [team, setTeam] = useState<TeamData | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchTeam = useCallback(async () => {
    try {
      const res = await fetch(`/api/teams/${teamId}`);
      if (!res.ok) {
        setError("Failed to load team");
        return;
      }
      const data = await res.json();
      setTeam(data);
    } catch {
      setError("Failed to load team");
    }
  }, [teamId]);

  const fetchInvites = useCallback(async () => {
    try {
      const res = await fetch(`/api/teams/${teamId}/invites`);
      if (res.ok) {
        setInvites(await res.json());
      }
    } catch {
      // Non-owners won't have access, that's fine
    }
  }, [teamId]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      await Promise.all([fetchTeam(), fetchInvites()]);
      setLoading(false);
    }
    load();
  }, [fetchTeam, fetchInvites]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setInviting(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast("error", data.error || "Failed to send invite");
        setInviting(false);
        return;
      }

      setInviteEmail("");
      showToast("success", `Invite link created for ${data.email}`);
      await fetchInvites();
    } catch {
      showToast("error", "Failed to send invite");
    }
    setInviting(false);
  }

  async function handleRevokeInvite(inviteId: string) {
    try {
      const res = await fetch(`/api/teams/${teamId}/invites/${inviteId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setInvites((prev) => prev.filter((i) => i.id !== inviteId));
        showToast("success", "Invite revoked");
      }
    } catch {
      showToast("error", "Failed to revoke invite");
    }
  }

  async function handleCopyInvite(inviteUrl: string) {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      showToast("success", "Invite link copied");
    } catch {
      showToast("error", "Copy failed. Select and copy the invite link manually.");
    }
  }

  async function handleRemoveMember(userId: string, name: string | null) {
    if (!confirm(`Remove ${name || "this member"} from the team?`)) return;

    try {
      const res = await fetch(`/api/teams/${teamId}/members/${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        showToast("error", data.error || "Failed to remove member");
        return;
      }
      await fetchTeam();
      showToast("success", `${name || "Member"} removed`);
    } catch {
      showToast("error", "Failed to remove member");
    }
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || newName.trim() === team?.name) {
      setEditingName(false);
      return;
    }

    setRenaming(true);
    try {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        showToast("error", data.error || "Failed to rename team");
      } else {
        setTeam((prev) => (prev ? { ...prev, name: newName.trim() } : prev));
        showToast("success", "Team renamed");
      }
    } catch {
      showToast("error", "Failed to rename team");
    }
    setRenaming(false);
    setEditingName(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <header className="border-b border-[var(--border)]">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/app" className="text-lg font-bold tracking-tight">
              StackHatch
            </Link>
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-6 py-12 text-center text-[var(--muted-foreground)]">
          Loading team...
        </main>
      </div>
    );
  }

  if (error || !team) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <header className="border-b border-[var(--border)]">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/app" className="text-lg font-bold tracking-tight">
              StackHatch
            </Link>
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-6 py-12 text-center text-[var(--danger)]">
          {error || "Team not found"}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/app" className="text-lg font-bold tracking-tight">
            StackHatch
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        {/* Toast */}
        {toast && (
          <div
            className={`fixed right-6 top-6 z-50 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
              toast.type === "success"
                ? "bg-[var(--success-surface)] text-[var(--success)] border border-[var(--success-border)]"
                : "bg-[var(--danger-surface)] text-[var(--danger)] border border-[var(--danger-border)]"
            }`}
          >
            {toast.message}
          </div>
        )}

        {/* Team Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              {editingName ? (
                <form onSubmit={handleRename} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    autoFocus
                    className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1 text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setEditingName(false);
                    }}
                  />
                  <button
                    type="submit"
                    disabled={renaming}
                    className="rounded-lg bg-[var(--brand)] px-3 py-1 text-sm font-medium text-[var(--brand-foreground)] transition-opacity hover:bg-[var(--brand-hover)] disabled:opacity-50"
                  >
                    {renaming ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingName(false)}
                    className="rounded-lg px-3 py-1 text-sm text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <h1 className="text-2xl font-bold">{team.name}</h1>
                  {team.isOwner && (
                    <button
                      onClick={() => {
                        setNewName(team.name);
                        setEditingName(true);
                      }}
                      className="rounded px-2 py-1 text-xs text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                      title="Rename team"
                    >
                      Rename
                    </button>
                  )}
                </>
              )}
            </div>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {team.members.length} {team.members.length === 1 ? "member" : "members"}
            </p>
          </div>
          <Link
            href={`/project/new?teamId=${team.id}`}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)]"
          >
            New project
          </Link>
        </div>

        {/* Members */}
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold">Members</h2>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] divide-y divide-[var(--border)]">
            {team.members.map((member) => (
              <div key={member.userId} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  {member.avatarUrl ? (
                    <Image
                      src={member.avatarUrl}
                      alt=""
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-full"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--muted)] text-xs font-medium">
                      {(member.name || "?")[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-medium">
                      {member.name || "Unknown"}
                      {member.role === "owner" && (
                        <span className="ml-2 text-xs text-[var(--muted-foreground)]">Owner</span>
                      )}
                    </div>
                    {member.email && (
                      <div className="text-xs text-[var(--muted-foreground)]">{member.email}</div>
                    )}
                  </div>
                </div>
                {team.isOwner && member.role !== "owner" && (
                  <button
                    onClick={() => handleRemoveMember(member.userId, member.name)}
                    className="rounded px-2 py-1 text-xs text-[var(--danger)] transition-colors hover:bg-[var(--danger-surface)]"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Invite Section (owner only) */}
        {team.isOwner && (
          <section className="mb-10">
            <h2 className="mb-4 text-lg font-semibold">Invite Members</h2>
            <p className="mb-3 text-sm text-[var(--muted-foreground)]">
              Create a private link, then share it with the invited person.
            </p>
            <form onSubmit={handleInvite} className="flex gap-3">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
              <button
                type="submit"
                disabled={inviting || !inviteEmail.trim()}
                className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand-foreground)] transition-opacity hover:bg-[var(--brand-hover)] disabled:opacity-50"
              >
                {inviting ? "Creating..." : "Create Invite Link"}
              </button>
            </form>

            {/* Pending Invites */}
            {invites.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 text-sm font-medium text-[var(--muted-foreground)]">
                  Pending Invites
                </h3>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] divide-y divide-[var(--border)]">
                  {invites.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm">{invite.email}</div>
                        <div className="text-xs text-[var(--muted-foreground)]">
                          Expires {new Date(invite.expiresAt).toLocaleDateString()}
                        </div>
                        <input
                          aria-label={`Invite link for ${invite.email}`}
                          readOnly
                          value={invite.inviteUrl}
                          onFocus={(event) => event.currentTarget.select()}
                          className="mt-2 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-xs text-[var(--muted-foreground)]"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopyInvite(invite.inviteUrl)}
                          className="rounded border border-[var(--border)] px-2 py-1 text-xs transition-colors hover:bg-[var(--muted)]"
                        >
                          Copy link
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRevokeInvite(invite.id)}
                          className="rounded px-2 py-1 text-xs text-[var(--danger)] transition-colors hover:bg-[var(--danger-surface)]"
                        >
                          Revoke
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <div className="text-center">
          <Link
            href="/app"
            className="text-sm text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
          >
            &larr; Back to Dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
