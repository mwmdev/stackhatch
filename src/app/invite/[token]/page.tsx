"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

interface InviteInfo {
  email: string;
  team: { id: string; name: string } | null;
  invitedBy: { name: string | null; avatarUrl: string | null } | null;
  expiresAt: number;
}

type PageState = "loading" | "ready" | "accepting" | "accepted" | "error";

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [state, setState] = useState<PageState>("loading");
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState("");
  const [needsAuth, setNeedsAuth] = useState(false);

  useEffect(() => {
    async function fetchInvite() {
      try {
        const res = await fetch(`/api/invites/${token}`);
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Invalid invite link");
          setState("error");
          return;
        }
        const data = await res.json();
        setInvite(data);
        setState("ready");
      } catch {
        setError("Failed to load invite");
        setState("error");
      }
    }
    fetchInvite();
  }, [token]);

  async function handleAccept() {
    setState("accepting");
    try {
      const res = await fetch(`/api/invites/${token}`, { method: "POST" });
      if (res.status === 401) {
        setNeedsAuth(true);
        setState("ready");
        return;
      }
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to accept invite");
        setState("error");
        return;
      }
      setState("accepted");
    } catch {
      setError("Failed to accept invite");
      setState("error");
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-bold tracking-tight">
            StackHatch
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex min-h-[calc(100vh-73px)] items-center justify-center px-6">
        <div className="w-full max-w-sm">
          {state === "loading" && (
            <div className="text-center text-[var(--muted-foreground)]">Loading invite...</div>
          )}

          {state === "error" && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-center shadow-sm">
              <div className="mb-4 text-4xl">&#x26A0;</div>
              <h2 className="mb-2 text-lg font-semibold text-[var(--card-foreground)]">
                Invalid Invite
              </h2>
              <p className="mb-6 text-sm text-[var(--muted-foreground)]">{error}</p>
              <Link
                href="/"
                className="inline-block rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand-foreground)] transition-opacity hover:bg-[var(--brand-hover)]"
              >
                Go to StackHatch
              </Link>
            </div>
          )}

          {state === "accepted" && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-center shadow-sm">
              <div className="mb-4 text-4xl">&#x2705;</div>
              <h2 className="mb-2 text-lg font-semibold text-[var(--card-foreground)]">
                You&apos;re in!
              </h2>
              <p className="mb-6 text-sm text-[var(--muted-foreground)]">
                You&apos;ve joined <strong>{invite?.team?.name}</strong>.
              </p>
              <button
                onClick={() => router.push("/app")}
                className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand-foreground)] transition-opacity hover:bg-[var(--brand-hover)]"
              >
                Go to Dashboard
              </button>
            </div>
          )}

          {(state === "ready" || state === "accepting") && invite && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-center shadow-sm">
              <h2 className="mb-2 text-lg font-semibold text-[var(--card-foreground)]">
                Team Invite
              </h2>
              <p className="mb-1 text-sm text-[var(--muted-foreground)]">
                {invite.invitedBy?.name ?? "Someone"} invited you to join
              </p>
              <p className="mb-6 text-xl font-bold">{invite.team?.name}</p>

              {needsAuth && (
                <div className="mb-4 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-surface)] p-3 text-sm text-[var(--warning)]">
                  Please sign in with GitHub first, then revisit this link.
                </div>
              )}

              <p className="mb-6 text-xs text-[var(--muted-foreground)]">
                Invite for {invite.email} &middot; Expires{" "}
                {new Date(invite.expiresAt).toLocaleDateString()}
              </p>

              <div className="flex gap-3">
                <Link
                  href="/"
                  className="flex-1 rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--muted)]"
                >
                  Decline
                </Link>
                <button
                  onClick={handleAccept}
                  disabled={state === "accepting"}
                  className="flex-1 rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-medium text-[var(--brand-foreground)] transition-opacity hover:bg-[var(--brand-hover)] disabled:opacity-50"
                >
                  {state === "accepting" ? "Joining..." : "Accept Invite"}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
