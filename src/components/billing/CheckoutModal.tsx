"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CreditCard, Loader2, X } from "lucide-react";
import type { CheckoutPlanKey, BillingInterval } from "@/lib/plan-config";

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: CheckoutPlanKey;
  interval: BillingInterval;
  teamName?: string;
}

function planLabel(plan: CheckoutModalProps["plan"]) {
  if (plan === "starter") return "Builder";
  if (plan === "pro") return "Studio";
  if (plan === "team5") return "Team (5 users)";
  return "Team (15 users)";
}

export default function CheckoutModal({
  isOpen,
  onClose,
  plan,
  interval,
  teamName,
}: CheckoutModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleClose = useCallback(() => {
    setError("");
    setIsLoading(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleClose, isOpen]);

  const handleCheckout = async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/billing/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, interval, teamName }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to create checkout session");
      }
      if (!data.checkoutUrl) {
        throw new Error("No checkout URL received");
      }

      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <button
          type="button"
          className="fixed inset-0 cursor-default bg-black/50"
          onClick={handleClose}
          aria-label="Close checkout"
        />

        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkout-title"
          className="relative w-full max-w-md rounded-lg bg-[var(--card)] p-6 shadow-xl"
        >
          <div className="mb-6 flex items-center justify-between gap-4">
            <h2 id="checkout-title" className="text-lg font-semibold text-[var(--foreground)]">
              Subscribe to {planLabel(plan)}
            </h2>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={handleClose}
              className="flex h-11 w-11 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              aria-label="Close checkout"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleCheckout}
            disabled={isLoading}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--color-client)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-client-hover)] disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Redirecting...
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4" />
                Continue to Stripe
              </>
            )}
          </button>

          <p className="mt-4 text-center text-xs text-[var(--muted-foreground)]">
            Secure checkout is handled by Stripe.
          </p>
        </div>
      </div>
    </div>
  );
}
