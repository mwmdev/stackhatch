import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <article className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/"
          className="text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          Back to StackHatch
        </Link>
        <h1 className="mt-10 text-4xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="mt-4 text-sm text-[var(--muted-foreground)]">Effective May 4, 2026</p>

        <div className="mt-8 space-y-8 text-sm leading-7 text-[var(--muted-foreground)]">
          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Information We Use</h2>
            <p className="mt-2">
              StackHatch stores account profile details from authentication, project names,
              descriptions, public repository URLs, generated architecture data, billing status,
              team membership, comments, and usage counts needed to operate plan limits.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">
              AI Keys and Project Content
            </h2>
            <p className="mt-2">
              Bring-your-own Anthropic keys are encrypted before storage and are never returned to
              the browser. Project content is sent to configured AI providers only when a user asks
              StackHatch to generate, analyze, or revise architecture output.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Payments</h2>
            <p className="mt-2">
              Stripe processes paid subscriptions. StackHatch stores subscription identifiers, plan
              status, billing interval, and renewal period data. Full payment card details are not
              stored by StackHatch.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Data Requests</h2>
            <p className="mt-2">
              To request account deletion, project export, or correction of account data, contact
              support@stackhatch.app from the email associated with the account.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
