import Link from "next/link";
import { ArrowRight, BookOpen, LifeBuoy, Mail, ShieldCheck } from "lucide-react";

const SUPPORT_PATHS = [
  {
    title: "First architecture map",
    description:
      "Start with a public GitHub repository or a short Markdown PRD, then open the project and review the generated nodes before asking the assistant for tradeoffs.",
  },
  {
    title: "Free BYOK access",
    description:
      "StackHatch is free and every feature is available to every user. Add your Anthropic API key in Settings; Anthropic bills AI usage directly to your account.",
  },
  {
    title: "Data handling",
    description:
      "Your Anthropic key is encrypted before storage and never returned to the browser. Public repository URLs and project descriptions are used only for actions you request.",
  },
];

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <Link
          href="/"
          className="text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          Back to StackHatch
        </Link>

        <section className="mt-10 grid gap-8 lg:grid-cols-[1fr_320px] lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-[var(--color-client)]">
              Support
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-tight md:text-5xl">
              Get from first input to shareable architecture without extra setup.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--muted-foreground)]">
              StackHatch is built for founders, freelance developers, and small product teams who
              need architecture decisions they can explain to customers, investors, and engineers.
            </p>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
            <LifeBuoy className="h-5 w-5 text-[var(--color-client)]" />
            <h2 className="mt-3 font-semibold">Contact support</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
              Include your account email, project name, browser, and the action that failed.
            </p>
            <a
              href="mailto:support@stackhatch.app"
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)]"
            >
              <Mail className="h-4 w-4" />
              support@stackhatch.app
            </a>
          </div>
        </section>

        <section className="mt-12 grid gap-5 md:grid-cols-3">
          {SUPPORT_PATHS.map((item) => (
            <article
              key={item.title}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5"
            >
              <BookOpen className="h-5 w-5 text-[var(--color-api)]" />
              <h2 className="mt-3 font-semibold">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                {item.description}
              </p>
            </article>
          ))}
        </section>

        <section className="mt-12 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 gap-3">
              <ShieldCheck className="mt-1 h-5 w-5 flex-none text-[var(--color-api)]" />
              <div>
                <h2 className="font-semibold">Trust basics</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                  Review the privacy and terms pages before sharing customer-sensitive requirements.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/privacy"
                className="inline-flex min-h-11 items-center rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--muted)]"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--muted)]"
              >
                Terms
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
