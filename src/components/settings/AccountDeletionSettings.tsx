"use client";

import { useEffect, useRef, useState } from "react";
import { ACCOUNT_DELETION_CONFIRMATION } from "@/lib/account-deletion-contract";

interface AccountDeletionSettingsProps {
  availability: {
    enabled: boolean;
    reason?: string;
  };
  onDeleted?: () => void | Promise<void>;
}

type DeletionPhase = "idle" | "pending" | "retryable-error" | "indeterminate" | "committed";

export default function AccountDeletionSettings({
  availability,
  onDeleted = () => window.location.assign("/"),
}: AccountDeletionSettingsProps) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [phase, setPhase] = useState<DeletionPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const pending = phase === "pending";
  const terminal = phase === "indeterminate" || phase === "committed";

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function close() {
    if (pending || terminal) return;
    setOpen(false);
    setConfirmation("");
    setError(null);
    queueMicrotask(() => triggerRef.current?.focus());
  }

  async function deleteAccount() {
    if (
      !availability.enabled ||
      pending ||
      terminal ||
      confirmation !== ACCOUNT_DELETION_CONFIRMATION
    )
      return;
    setPhase("pending");
    setError(null);

    async function finishCommittedDeletion() {
      setPhase("committed");
      setError(null);
      try {
        await onDeleted();
      } catch {
        // The terminal confirmation below remains available when navigation fails.
      }
    }

    async function reconcileAmbiguousDeletion() {
      try {
        const identity = await fetch("/api/me", { cache: "no-store" });
        if (identity.status === 401) {
          await finishCommittedDeletion();
          return;
        }
        if (identity.ok) {
          setPhase("retryable-error");
          setError(
            "Account deletion could not be confirmed, and your account is still active. You can try again."
          );
          return;
        }
      } catch {
        // The indeterminate state below prevents a blind duplicate deletion request.
      }

      setPhase("indeterminate");
      setError(
        "We could not confirm whether deletion committed. Reload or sign in again to check your account before taking another action."
      );
    }

    let response: Response;
    try {
      response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
    } catch {
      await reconcileAmbiguousDeletion();
      return;
    }

    if (!response.ok) {
      const result = (await response.json().catch(() => ({}))) as { error?: unknown };
      setPhase("retryable-error");
      setError(
        typeof result.error === "string" && result.error
          ? result.error
          : "Your account was not deleted. Check your connection and try again."
      );
      return;
    }

    try {
      const result = (await response.json()) as { committed?: unknown };
      if (result.committed === true) {
        await finishCommittedDeletion();
        return;
      }
    } catch {
      // A successful HTTP response without a readable receipt is ambiguous.
    }

    await reconcileAmbiguousDeletion();
  }

  return (
    <section
      id="delete-account"
      className="scroll-mt-24 rounded-sm border border-[var(--danger-border)] bg-[var(--danger-surface)] p-5 shadow-[var(--shadow-low)] sm:p-6"
    >
      <p className="font-utility mb-1 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--danger)]">
        Danger zone · 05
      </p>
      <h2 className="text-xl font-semibold text-[var(--card-foreground)]">Delete account</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">
        Permanently remove your StackHatch account and its active application data. This action
        cannot be undone.
      </p>
      {!availability.enabled && (
        <p className="mt-3 text-sm font-medium text-[var(--danger)]" role="status">
          {availability.reason ?? "Account deletion is currently unavailable."}
        </p>
      )}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        disabled={!availability.enabled}
        className="mt-5 min-h-11 rounded-sm bg-[var(--danger)] px-4 py-2 text-sm font-bold text-[var(--danger-foreground)] hover:bg-[var(--danger-hover)]"
      >
        Delete account
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4">
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            aria-describedby="delete-account-description"
            onKeyDown={(event) => {
              if (event.key === "Escape") close();
              if (event.key !== "Tab") return;

              const focusable = Array.from(
                dialogRef.current?.querySelectorAll<HTMLElement>(
                  'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
                ) ?? []
              );
              if (focusable.length === 0) {
                event.preventDefault();
                dialogRef.current?.focus();
                return;
              }
              const first = focusable[0];
              const last = focusable.at(-1)!;
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
            }}
            tabIndex={-1}
            className="w-full max-w-lg rounded-sm border border-[var(--danger-border)] bg-[var(--card)] p-5 shadow-2xl sm:p-6"
          >
            <h3 id="delete-account-title" className="text-xl font-bold">
              Permanently delete your account?
            </h3>
            <div
              id="delete-account-description"
              className="mt-3 space-y-3 text-sm leading-6 text-[var(--muted-foreground)]"
            >
              <p>This permanently removes these active StackHatch records:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Your account profile and encrypted Anthropic API key</li>
                <li>Your projects and architecture maps, including chat messages</li>
                <li>Your saved templates, preferences, and custom node subtypes</li>
              </ul>
              <p>
                The active application database is updated when deletion commits. SQLite WAL files
                and backups follow the storage retention lifecycle managed by the operator.
              </p>
            </div>

            <label
              htmlFor="delete-account-confirmation"
              className="mt-5 block text-sm font-semibold"
            >
              Type <span className="font-utility">{ACCOUNT_DELETION_CONFIRMATION}</span> to confirm
            </label>
            <input
              ref={inputRef}
              id="delete-account-confirmation"
              value={confirmation}
              onChange={(event) => {
                setConfirmation(event.target.value);
                setError(null);
              }}
              disabled={pending || terminal}
              autoComplete="off"
              spellCheck={false}
              className="mt-2 min-h-11 w-full rounded-sm border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-utility text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />

            {error && (
              <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
                {error}
              </p>
            )}

            {phase === "committed" && (
              <div className="mt-3 text-sm" role="status" aria-live="polite">
                <p>Your account deletion committed. This account cannot be used again.</p>
                {/* A hard navigation remains usable after auth state and client routing are gone. */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a className="mt-2 inline-flex font-semibold underline" href="/">
                  Return to StackHatch home
                </a>
              </div>
            )}

            {phase === "indeterminate" && (
              <a className="mt-3 inline-flex text-sm font-semibold underline" href="/settings">
                Reload settings to check your account
              </a>
            )}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={close}
                disabled={pending || terminal}
                className="min-h-11 rounded-sm border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--muted)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteAccount}
                disabled={pending || terminal || confirmation !== ACCOUNT_DELETION_CONFIRMATION}
                className="min-h-11 rounded-sm bg-[var(--danger)] px-4 py-2 text-sm font-bold text-[var(--danger-foreground)] hover:bg-[var(--danger-hover)] disabled:opacity-50"
              >
                {phase === "pending"
                  ? "Deleting account..."
                  : phase === "committed"
                    ? "Account deleted"
                    : phase === "indeterminate"
                      ? "Deletion status unknown"
                      : "Permanently delete account"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
