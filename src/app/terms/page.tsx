import Link from "next/link";

export const metadata = {
  title: "Terms",
  description: "The terms for using StackHatch and its generated architecture maps.",
  alternates: { canonical: "/terms" },
};

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
        <p className="mt-4 text-sm text-[var(--muted-foreground)]">Effective July 14, 2026</p>

        <div className="mt-8 space-y-8 text-sm leading-7 text-[var(--muted-foreground)]">
          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Use of StackHatch</h2>
            <p className="mt-2">
              StackHatch helps users generate architecture diagrams and tradeoff notes, keep private
              notes and personal templates, and create handoff artifacts from bounded repository
              evidence and user input. Projects are accessible only to their account owner;
              StackHatch does not provide shared project access. Generated maps are explanations,
              not a complete audit of a codebase. Users are responsible for reviewing output before
              relying on it for production engineering decisions.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">
              Accounts and AI Usage
            </h2>
            <p className="mt-2">
              StackHatch is free to use. AI features require a user-provided Anthropic API key, and
              Anthropic bills that usage directly to the user&apos;s Anthropic account. Users are
              responsible for securing their Anthropic account and complying with its terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Acceptable Use</h2>
            <p className="mt-2">
              Users may not attempt to bypass access controls, abuse AI or repository scanning,
              upload content they do not have permission to use, or use StackHatch to violate
              applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Support</h2>
            <p className="mt-2">
              For account or product support, contact support@stackhatch.io from the email
              associated with the account.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
