"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Check, Loader2, AlertCircle } from "lucide-react";
import Link from "next/link";
import { getPlanLabel } from "@/lib/plan-config";

function SuccessPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string>("");
  const [subscriptionDetails, setSubscriptionDetails] = useState<any>(null);

  useEffect(() => {
    const sessionId = searchParams.get("session_id");

    if (!sessionId) {
      setStatus("error");
      setError("No session ID found. Please try again.");
      return;
    }

    // Process the successful payment
    const processPayment = async () => {
      try {
        const response = await fetch("/api/billing/create-subscription", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to process payment");
        }

        setSubscriptionDetails(data.subscription);
        setStatus("success");
      } catch (err) {
        console.error("Payment processing error:", err);
        setStatus("error");
        setError(err instanceof Error ? err.message : "Failed to process payment");
      }
    };

    processPayment();
  }, [searchParams]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--brand)]" />
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">
            Processing your payment...
          </h1>
          <p className="text-[var(--muted-foreground)]">
            Please wait while we confirm your subscription.
          </p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[var(--card)] rounded-lg shadow-lg p-6 text-center space-y-4">
          <AlertCircle className="w-12 h-12 mx-auto text-[var(--danger)]" />
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">Payment Error</h1>
          <p className="text-[var(--muted-foreground)]">{error}</p>
          <div className="flex gap-3 justify-center">
            <Link
              href="/pricing"
              className="px-4 py-2 bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-[var(--brand-foreground)] rounded-md transition-colors"
            >
              Try Again
            </Link>
            <Link
              href="/"
              className="px-4 py-2 border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] rounded-md transition-colors"
            >
              Go Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const planName = getPlanLabel(subscriptionDetails?.plan);

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[var(--card)] rounded-lg shadow-lg p-6 text-center space-y-4">
        <div className="w-12 h-12 mx-auto bg-[var(--success-surface)] rounded-full flex items-center justify-center">
          <Check className="w-6 h-6 text-[var(--success)]" />
        </div>

        <h1 className="text-2xl font-semibold text-[var(--foreground)]">
          Welcome to StackHatch {planName}!
        </h1>

        <p className="text-[var(--muted-foreground)]">
          Your subscription has been activated successfully. You now have access to {planName}
          features.
        </p>

        {subscriptionDetails && (
          <div className="bg-[var(--muted)] rounded-md p-4 text-left space-y-2">
            <div className="flex justify-between">
              <span className="text-[var(--muted-foreground)]">Plan:</span>
              <span className="font-medium text-[var(--foreground)]">
                {getPlanLabel(subscriptionDetails.plan)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted-foreground)]">Status:</span>
              <span className="font-medium text-[var(--success)] capitalize">
                {subscriptionDetails.status}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted-foreground)]">Next billing:</span>
              <span className="font-medium text-[var(--foreground)]">
                {new Date(subscriptionDetails.currentPeriodEnd).toLocaleDateString()}
              </span>
            </div>
          </div>
        )}

        <div className="flex gap-3 justify-center">
          <Link
            href="/app"
            className="px-4 py-2 bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-[var(--brand-foreground)] rounded-md transition-colors"
          >
            Start Building
          </Link>
          <Link
            href="/settings"
            className="px-4 py-2 border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] rounded-md transition-colors"
          >
            Manage Billing
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--brand)]" />
        </div>
      }
    >
      <SuccessPageContent />
    </Suspense>
  );
}
