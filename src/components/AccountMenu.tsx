"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useEffect, useId, useRef, useState } from "react";

interface CurrentUser {
  name?: string | null;
  email?: string | null;
}

type IdentityState =
  | { status: "loading" }
  | { status: "loaded"; user: CurrentUser }
  | { status: "unavailable" };

type SignOutState = "ready" | "saving" | "signing-out";

interface AccountMenuProps {
  beforeSignOut?: () => Promise<void> | void;
  signOutBlockedReason?: string | null;
  settingsActive?: boolean;
  onSignOutFailure?: (error: unknown) => Promise<void> | void;
}

export class AccountSessionExpiredError extends Error {
  readonly reauthenticateHref: string;

  constructor(reauthenticateHref: string) {
    super("The session expired before pending changes could be saved.");
    this.name = "AccountSessionExpiredError";
    this.reauthenticateHref = reauthenticateHref;
  }
}

function getInitial(identity: IdentityState) {
  if (identity.status !== "loaded") return "U";
  const value = identity.user.name || identity.user.email || "User";
  return value.slice(0, 1).toUpperCase();
}

export default function AccountMenu({
  beforeSignOut,
  signOutBlockedReason,
  settingsActive = false,
  onSignOutFailure,
}: AccountMenuProps) {
  const generatedId = useId();
  const panelId = `account-menu-${generatedId}`;
  const blockedReasonId = `${panelId}-blocked-reason`;
  const progressId = `${panelId}-progress`;
  const [identity, setIdentity] = useState<IdentityState>({ status: "loading" });
  const [signOutState, setSignOutState] = useState<SignOutState>("ready");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reauthenticateHref, setReauthenticateHref] = useState<string | null>(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    fetch("/api/me", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Identity request failed");
        return (await response.json()) as CurrentUser;
      })
      .then((user) => {
        if (!cancelled) setIdentity({ status: "loaded", user });
      })
      .catch(() => {
        if (!cancelled) setIdentity({ status: "unavailable" });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  async function recoverFromFailure(error: unknown) {
    try {
      await onSignOutFailure?.(error);
    } catch {
      // Recovery is best-effort; the account action must still become retryable.
    }
    pendingRef.current = false;
    setSignOutState("ready");
  }

  async function handleSignOut() {
    if (pendingRef.current || signOutBlockedReason) return;

    pendingRef.current = true;
    setErrorMessage(null);
    setReauthenticateHref(null);

    if (beforeSignOut) {
      setSignOutState("saving");
      try {
        await beforeSignOut();
      } catch (error) {
        if (error instanceof AccountSessionExpiredError) {
          setErrorMessage(
            "Your session expired before changes could be saved. Keep this tab open."
          );
          setReauthenticateHref(error.reauthenticateHref);
        } else {
          setErrorMessage("We couldn’t save your changes. You’re still signed in. Try again.");
        }
        await recoverFromFailure(error);
        return;
      }
    }

    setSignOutState("signing-out");
    try {
      await signOut({ redirectTo: "/" });
    } catch (error) {
      setErrorMessage("We couldn’t sign you out. You’re still signed in. Try again.");
      await recoverFromFailure(error);
    }
  }

  const isPending = signOutState !== "ready";
  const isSignOutUnavailable = Boolean(signOutBlockedReason) || isPending;
  const signOutDescriptionId = signOutBlockedReason
    ? blockedReasonId
    : isPending
      ? progressId
      : undefined;

  return (
    <div className="flex-none">
      <button
        type="button"
        aria-label="Account"
        popoverTarget={panelId}
        popoverTargetAction="toggle"
        className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--brand)] text-sm font-medium text-[var(--brand-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
      >
        {getInitial(identity)}
      </button>

      <div
        id={panelId}
        popover="auto"
        data-testid="account-popover"
        className="fixed inset-auto right-4 top-16 z-50 m-0 max-h-[calc(100dvh-5rem)] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-[var(--radius-surface)] border border-[var(--border)] bg-[var(--card)] p-2 text-[var(--card-foreground)] shadow-xl"
      >
        <div className="border-b border-[var(--border)] px-3 py-2">
          {identity.status === "loading" ? (
            <p className="text-sm text-[var(--muted-foreground)]">Loading identity…</p>
          ) : identity.status === "unavailable" ? (
            <p className="text-sm font-semibold">Identity unavailable</p>
          ) : (
            <>
              <p className="[overflow-wrap:anywhere] text-sm font-semibold leading-5">
                {identity.user.name || "Name unavailable"}
              </p>
              <p className="[overflow-wrap:anywhere] mt-0.5 text-xs leading-5 text-[var(--muted-foreground)]">
                {identity.user.email || "Email unavailable"}
              </p>
            </>
          )}
        </div>

        <div className="mt-1 grid gap-1">
          <Link
            href="/settings"
            aria-current={settingsActive ? "page" : undefined}
            className="flex min-h-11 items-center rounded-[var(--radius-control)] px-3 py-2 text-sm font-semibold hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            Settings
          </Link>
          <button
            type="button"
            aria-disabled={isSignOutUnavailable ? "true" : undefined}
            aria-describedby={signOutDescriptionId}
            onClick={handleSignOut}
            className="min-h-11 rounded-[var(--radius-control)] px-3 py-2 text-left text-sm font-semibold text-[var(--danger)] hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] aria-disabled:cursor-wait aria-disabled:opacity-60"
          >
            Sign out
          </button>
        </div>

        {signOutBlockedReason ? (
          <p id={blockedReasonId} className="px-3 pb-2 pt-1 text-xs text-[var(--muted-foreground)]">
            {signOutBlockedReason}
          </p>
        ) : null}

        {isPending ? (
          <p
            id={progressId}
            className="px-3 pb-2 pt-1 text-xs text-[var(--muted-foreground)]"
            role="status"
            aria-live="polite"
          >
            {signOutState === "saving" ? "Saving changes…" : "Signing out…"}
          </p>
        ) : null}

        {errorMessage ? (
          <div className="mx-3 mb-2 mt-1 text-xs leading-5 text-[var(--danger)]" role="alert">
            <p>{errorMessage}</p>
            {reauthenticateHref ? (
              <a
                href={reauthenticateHref}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex min-h-11 items-center font-semibold underline underline-offset-2"
              >
                Sign in in a new tab
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
