"use client";

import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import CheckoutButton from "@/components/billing/CheckoutButton";
import Link from "next/link";

export default function PricingPage() {
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>('monthly');
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/billing/subscription")
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.plan) setCurrentPlan(data.plan); })
      .catch(() => {});
  }, []);

  const plans = [
    {
      name: "Free",
      description: "Perfect for getting started",
      monthlyPrice: 0,
      features: [
        "2 projects",
        "20 chat messages per month",
        "2 repository scans per month",
        "Sonnet model only",
        "Basic support"
      ],
      cta: "Get Started",
      popular: false,
    },
    {
      name: "Pro",
      description: "For professional developers",
      monthlyPrice: 19,
      annualPrice: 15,
      features: [
        "Unlimited projects",
        "Unlimited chat messages",
        "Unlimited repository scans",
        "All AI models (Sonnet, Opus, Haiku)",
        "PNG, SVG, JSON, MD exports",
        "Custom node subtypes",
        "Version history",
        "Priority support"
      ],
      cta: "Upgrade to Pro",
      popular: true,
    },
    {
      name: "Team",
      description: "For collaborative teams",
      monthlyPrice: 39,
      annualPrice: 33,
      features: [
        "Everything in Pro",
        "Shared workspaces",
        "Team diagram library",
        "Project commenting & review",
        "Up to 5 team members",
        "PDF exports",
        "SSO/SAML support",
        "Team management"
      ],
      cta: "Start Team Plan",
      popular: false,
      teamSize: "5 users",
    }
  ];

  const getDisplayPrice = (plan: typeof plans[0]) => {
    if (plan.monthlyPrice === 0) return "Free";
    if (billingInterval === 'annual' && plan.annualPrice) {
      return `$${plan.annualPrice}`;
    }
    return `$${plan.monthlyPrice}`;
  };

  const getAnnualSavings = (plan: typeof plans[0]) => {
    if (plan.annualPrice && billingInterval === 'annual') {
      const monthlyCost = plan.monthlyPrice * 12;
      const annualCost = plan.annualPrice * 12;
      const savings = Math.round((1 - annualCost / monthlyCost) * 100);
      return `Save ${savings}%`;
    }
    return null;
  };

  const isCurrentPlan = (planName: string) => {
    if (!currentPlan) return false;
    if (planName === "Free" && currentPlan === "free") return true;
    if (planName === "Pro" && currentPlan === "pro") return true;
    if (planName === "Team" && (currentPlan === "team" || currentPlan === "team5" || currentPlan === "team15")) return true;
    return false;
  };

  return (
    <div className="min-h-screen bg-[var(--background)] py-12">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-[var(--foreground)] mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-xl text-[var(--muted-foreground)] mb-8">
            Choose the plan that&apos;s right for you and your team
          </p>

          {/* Billing Toggle */}
          <div className="inline-flex items-center gap-3">
            <div className="inline-flex items-center bg-[var(--muted)] p-1 rounded-lg">
              <button
                onClick={() => setBillingInterval('monthly')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  billingInterval === 'monthly'
                    ? 'bg-[var(--background)] text-[var(--foreground)] shadow-sm'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingInterval('annual')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  billingInterval === 'annual'
                    ? 'bg-[var(--background)] text-[var(--foreground)] shadow-sm'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                Annual
              </button>
            </div>
            {billingInterval === 'annual' && (
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                Save ~21%
              </span>
            )}
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8">
          {plans.map((plan, index) => (
            <div
              key={plan.name}
              className={`relative bg-[var(--card)] rounded-lg border p-8 ${
                isCurrentPlan(plan.name)
                  ? 'border-green-500 shadow-lg ring-2 ring-green-500/20'
                  : plan.popular
                    ? 'border-blue-500 shadow-lg scale-105'
                    : 'border-[var(--border)]'
              }`}
            >
              {isCurrentPlan(plan.name) ? (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <span className="bg-green-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                    Current Plan
                  </span>
                </div>
              ) : plan.popular ? (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <span className="bg-blue-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                    Most Popular
                  </span>
                </div>
              ) : null}

              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-[var(--foreground)] mb-2">
                  {plan.name}
                </h3>
                <p className="text-[var(--muted-foreground)] mb-4">
                  {plan.description}
                </p>

                <div className="mb-2">
                  <span className="text-4xl font-bold text-[var(--foreground)]">
                    {getDisplayPrice(plan)}
                  </span>
                  {plan.monthlyPrice > 0 && (
                    <span className="text-[var(--muted-foreground)] ml-2">
                      / {billingInterval === 'monthly' ? 'month' : 'month, billed annually'}
                    </span>
                  )}
                </div>

                {billingInterval === 'annual' && plan.annualPrice && (
                  <p className="text-sm text-[var(--muted-foreground)]">
                    ${plan.annualPrice * 12}/year
                  </p>
                )}

                {plan.teamSize && (
                  <p className="text-sm text-[var(--muted-foreground)]">
                    Up to {plan.teamSize}
                  </p>
                )}

                {getAnnualSavings(plan) && (
                  <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    {getAnnualSavings(plan)}
                  </span>
                )}
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="text-[var(--foreground)]">{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto">
                {isCurrentPlan(plan.name) ? (
                  <span className="w-full bg-green-600/10 text-green-600 dark:text-green-400 font-medium py-2 px-4 rounded-md text-center block border border-green-600/20">
                    Current Plan
                  </span>
                ) : plan.name === 'Free' ? (
                  <Link
                    href="/login"
                    className="w-full bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--foreground)] font-medium py-2 px-4 rounded-md transition-colors text-center block"
                  >
                    {plan.cta}
                  </Link>
                ) : (
                  <CheckoutButton
                    plan={plan.name === 'Pro' ? 'pro' : 'team5'}
                    interval={billingInterval}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
                  >
                    {plan.cta}
                  </CheckoutButton>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Team scaling info */}
        <div className="text-center mt-12 p-6 bg-[var(--muted)] rounded-lg">
          <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">
            Need more team members?
          </h3>
          <p className="text-[var(--muted-foreground)] mb-4">
            Team plans scale with your needs:
          </p>
          <div className="flex justify-center gap-8 text-sm">
            <div>
              <span className="font-medium text-[var(--foreground)]">Up to 5 users:</span>
              <span className="text-[var(--muted-foreground)] ml-2">
                {billingInterval === 'annual' ? '$33/mo ($396/yr)' : '$39/month'}
              </span>
            </div>
            <div>
              <span className="font-medium text-[var(--foreground)]">Up to 15 users:</span>
              <span className="text-[var(--muted-foreground)] ml-2">
                {billingInterval === 'annual' ? '$66/mo ($792/yr)' : '$79/month'}
              </span>
            </div>
            <div>
              <span className="font-medium text-[var(--foreground)]">15+ users:</span>
              <span className="text-[var(--muted-foreground)] ml-2">Contact sales</span>
            </div>
          </div>
        </div>

        {/* FAQ or additional info */}
        <div className="text-center mt-12">
          <p className="text-[var(--muted-foreground)]">
            Questions about our plans?{" "}
            <Link href="/contact" className="text-blue-600 hover:text-blue-700 underline">
              Contact us
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}