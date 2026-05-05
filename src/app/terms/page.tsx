import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <article className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/"
          className="text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          Back to StackHatch
        </Link>
        <h1 className="mt-10 text-4xl font-bold tracking-tight">Terms of Service</h1>
        <p className="mt-4 text-sm text-[var(--muted-foreground)]">Effective May 4, 2026</p>

        <div className="mt-8 space-y-8 text-sm leading-7 text-[var(--muted-foreground)]">
          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Use of StackHatch</h2>
            <p className="mt-2">
              StackHatch helps users generate architecture diagrams, tradeoff notes, comments, and
              handoff artifacts. Users are responsible for reviewing AI-generated output before
              relying on it for production engineering decisions.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Accounts and Billing</h2>
            <p className="mt-2">
              All plans use bring-your-own Anthropic keys for AI. Free accounts are subject to
              product limits. Paid plans renew through Stripe unless canceled before the next
              billing period. Plan limits and included features are shown on the pricing page.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Acceptable Use</h2>
            <p className="mt-2">
              Users may not attempt to bypass access controls, abuse AI or repository scanning
              limits, upload content they do not have permission to use, or use StackHatch to
              violate applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Support</h2>
            <p className="mt-2">
              For account, billing, or product support, contact support@stackhatch.app from the
              email associated with the account.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
