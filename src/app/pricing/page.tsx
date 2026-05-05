"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, KeyRound, Sparkles, UsersRound } from "lucide-react";
import Link from "next/link";
import CheckoutButton from "@/components/billing/CheckoutButton";
import {
  DEFAULT_PLAN_CATALOG,
  type BillingInterval,
  type PublicPlanCatalog,
  type PublicPlanCatalogEntry,
} from "@/lib/plan-config";

const PLAN_ORDER = ["free", "starter", "pro"] as const;

const PLAN_ICONS = {
  free: KeyRound,
  starter: Sparkles,
  pro: UsersRound,
} as const;

function displayPrice(plan: PublicPlanCatalogEntry, interval: BillingInterval) {
  if (plan.billing.monthlyPrice === 0) return "Free";
  return `$${interval === "annual" && plan.billing.annualPrice ? plan.billing.annualPrice : plan.billing.monthlyPrice}`;
}

export default function PricingPage() {
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [planCatalog, setPlanCatalog] = useState<PublicPlanCatalog>(DEFAULT_PLAN_CATALOG);

  useEffect(() => {
    Promise.allSettled([
      fetch("/api/billing/subscription").then((res) => (res.ok ? res.json() : null)),
      fetch("/api/plans").then((res) => (res.ok ? res.json() : null)),
    ]).then(([billingResult, plansResult]) => {
      if (billingResult.status === "fulfilled" && billingResult.value?.plan) {
        setCurrentPlan(billingResult.value.plan === "team" ? "pro" : billingResult.value.plan);
      }
      if (plansResult.status === "fulfilled" && plansResult.value?.plans) {
        setPlanCatalog(plansResult.value.plans);
      }
    });
  }, []);

  const plans = useMemo(() => PLAN_ORDER.map((key) => planCatalog[key]), [planCatalog]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="font-display text-xl font-extrabold tracking-tight">
            StackHatch
          </Link>
          <Link
            href="/login?callbackUrl=/app"
            className="rounded-md px-3 py-2 text-sm font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-end">
          <div>
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-[var(--color-data)]">
              Pricing
            </p>
            <h1 className="font-display max-w-3xl text-4xl font-extrabold tracking-tight md:text-5xl">
              Start with your own key. Upgrade when the architecture needs a handoff.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--muted-foreground)]">
              Every tier uses your Anthropic account for AI. Paid plans add deeper exports,
              collaboration, and higher operational limits at prices individual developers can say
              yes to quickly.
            </p>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 shadow-sm shadow-[var(--shadow-color)]">
            <div className="grid grid-cols-2 gap-1">
              {(["monthly", "annual"] as const).map((interval) => (
                <button
                  key={interval}
                  onClick={() => setBillingInterval(interval)}
                  className={`min-h-11 rounded-md px-4 py-2 text-sm font-semibold capitalize transition-colors ${
                    billingInterval === interval
                      ? "bg-[var(--foreground)] text-[var(--background)]"
                      : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {interval}
                </button>
              ))}
            </div>
            <p className="px-2 py-2 text-center text-xs text-[var(--muted-foreground)]">
              Annual billing gives two months free.
            </p>
          </div>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => {
            const Icon = PLAN_ICONS[plan.key];
            const isPaid = plan.key !== "free";
            const isCurrent = currentPlan === plan.key || (!currentPlan && plan.key === "free");
            const isFeatured = plan.key === "starter";

            return (
              <section
                key={plan.key}
                className={`flex min-w-0 flex-col rounded-lg border bg-[var(--card)] p-6 ${
                  isFeatured
                    ? "border-[var(--accent)] shadow-lg shadow-[var(--shadow-color)]"
                    : "border-[var(--border)]"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--muted)] text-[var(--foreground)]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h2 className="text-2xl font-bold">{plan.name}</h2>
                    <p className="mt-2 min-h-14 text-sm leading-6 text-[var(--muted-foreground)]">
                      {plan.description}
                    </p>
                  </div>
                  {isFeatured && (
                    <span className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-bold text-[var(--accent-foreground)]">
                      Builder pick
                    </span>
                  )}
                </div>

                <div className="mt-6">
                  <span className="text-4xl font-bold">{displayPrice(plan, billingInterval)}</span>
                  {isPaid && (
                    <span className="ml-2 text-sm text-[var(--muted-foreground)]">
                      /mo{billingInterval === "annual" ? ", billed annually" : ""}
                    </span>
                  )}
                  {isPaid && billingInterval === "annual" && plan.billing.annualPrice && (
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                      ${plan.billing.annualPrice * 12}/year
                    </p>
                  )}
                </div>

                <ul className="mt-6 flex-1 space-y-3">
                  {plan.bullets.map((feature) => (
                    <li key={feature} className="flex min-w-0 items-start gap-3 text-sm">
                      <Check className="mt-0.5 h-4 w-4 flex-none text-[var(--success)]" />
                      <span className="min-w-0 text-[var(--foreground)]">{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8">
                  {isCurrent ? (
                    <div className="flex min-h-11 items-center justify-center rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--muted-foreground)]">
                      Current plan
                    </div>
                  ) : plan.key === "free" ? (
                    <Link
                      href="/login"
                      className="flex min-h-11 items-center justify-center rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--muted)]"
                    >
                      Start free
                    </Link>
                  ) : (
                    <CheckoutButton
                      plan={plan.key}
                      interval={billingInterval}
                      className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                        isFeatured
                          ? "bg-[var(--brand)] text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)]"
                          : "bg-[var(--foreground)] text-[var(--background)] hover:opacity-90"
                      }`}
                    >
                      {plan.cta}
                      <ArrowRight className="h-4 w-4" />
                    </CheckoutButton>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <section className="mt-10 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <h3 className="font-semibold">Conversion trigger</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                Users keep AI control through BYOK, then upgrade naturally when they need more
                projects, repository scans, or shareable exports.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">Solo developer path</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                Builder is priced as an easy expense approval for freelancers, founders, and devtool
                teams validating architecture.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">Startup workspace</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                Studio turns diagrams into shared decisions with comments, templates, PRD export,
                and richer model access.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
