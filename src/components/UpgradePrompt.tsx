"use client";

import Link from "next/link";

interface UpgradePromptProps {
  /** The feature being gated, e.g. "export diagrams" */
  feature: string;
  /** Optional message override */
  message?: string;
  /** Variant: "inline" renders as a banner, "modal" renders as a dismissible modal */
  variant?: "inline" | "modal";
  /** Called when user dismisses the prompt */
  onDismiss?: () => void;
}

export default function UpgradePrompt({
  feature,
  message,
  variant = "inline",
  onDismiss,
}: UpgradePromptProps) {
  const text = message || `Upgrade to a paid plan to ${feature}.`;

  if (variant === "modal") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)]">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="upgrade-title"
          className="mx-4 w-full max-w-sm rounded-xl bg-[var(--card)] p-6 shadow-xl"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--warning-surface)]">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-[var(--warning)]"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h3 id="upgrade-title" className="text-lg font-semibold text-[var(--card-foreground)]">
            Upgrade Required
          </h3>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">{text}</p>
          <div className="mt-4 flex gap-3">
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="min-h-11 rounded-md px-3 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              >
                Dismiss
              </button>
            )}
            <Link
              href="/pricing"
              className="inline-flex min-h-11 items-center rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)]"
            >
              View Plans
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Inline banner variant
  return (
    <div className="rounded-lg border border-[var(--warning-border)] bg-[var(--warning-surface)] px-4 py-3">
      <div className="flex items-start gap-3">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="mt-0.5 flex-shrink-0 text-[var(--warning)]"
        >
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
        <div className="flex-1">
          <p className="text-sm text-[var(--foreground)]">{text}</p>
          <Link
            href="/pricing"
            className="mt-1 inline-block text-sm font-medium text-[var(--warning)] underline hover:text-[var(--foreground)]"
          >
            View Plans
          </Link>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="flex-shrink-0 text-[var(--warning)] hover:text-[var(--foreground)]"
            aria-label="Dismiss"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
