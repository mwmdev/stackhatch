import Link from "next/link";
import { ArrowRight, BookOpen, GitBranch, LifeBuoy, Mail, ShieldCheck, Star } from "lucide-react";
import TrackedSourceLink from "@/components/public/TrackedSourceLink";
import PublicPageShell from "@/components/shells/PublicPageShell";

export const metadata = {
  title: "Support",
  description: "Help with repository maps, bring-your-own-key setup, and scan evidence.",
  alternates: { canonical: "/support" },
};

const SUPPORT_PATHS = [
  {
    id: "first-map",
    title: "Map a repository",
    description:
      "Start with a public GitHub repository or a short Markdown PRD, then open the project and review the generated nodes before asking the assistant for tradeoffs.",
  },
  {
    id: "byok",
    title: "Bring your Anthropic key",
    description:
      "StackHatch is free and every feature is available to every user. Add your Anthropic API key in Settings; Anthropic bills AI usage directly to your account.",
  },
  {
    id: "evidence",
    title: "Understand the evidence",
    description:
      "Repository maps are inferred from bounded public evidence. The editor shows the scanned commit and marks partial analysis when a repository exceeds those limits.",
  },
];

export default function SupportPage() {
  return (
    <PublicPageShell
      homeHref="/"
      homeLabel="StackHatch home"
      eyebrow="Support"
      title="Get from repository to a map you can reason about."
      description="StackHatch helps developers see the pieces of a codebase, follow how they connect, and keep the architecture visible while the project changes."
    >
      <div className="space-y-12">
        <section className="grid gap-6 border-y border-[var(--border)] py-6 sm:grid-cols-[auto_1fr] sm:items-start">
          <LifeBuoy className="h-5 w-5 text-[var(--color-client)]" aria-hidden="true" />
          <div>
            <h2 className="font-semibold">Contact support</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
              Include your account email, browser, and the action that failed. Never email an API
              key or private project content.
            </p>
            <a
              href="mailto:support@stackhatch.io"
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)]"
            >
              <Mail className="h-4 w-4" />
              support@stackhatch.io
            </a>
          </div>
        </section>

        <section className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {SUPPORT_PATHS.map((item) => (
            <article
              key={item.title}
              id={item.id}
              className="grid gap-3 py-6 sm:grid-cols-[2rem_12rem_1fr] sm:items-start"
            >
              <BookOpen className="h-5 w-5 text-[var(--color-api)]" aria-hidden="true" />
              <h2 className="font-semibold">{item.title}</h2>
              <p className="text-sm leading-6 text-[var(--muted-foreground)]">{item.description}</p>
            </article>
          ))}
        </section>

        <section className="border-y border-[var(--border)] py-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 gap-3">
              <ShieldCheck
                className="mt-1 h-5 w-5 flex-none text-[var(--color-api)]"
                aria-hidden="true"
              />
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

        <section className="flex flex-wrap items-center gap-3">
          <p className="mr-auto text-sm text-[var(--muted-foreground)]">
            StackHatch is open source and developed in public.
          </p>
          <TrackedSourceLink
            href="https://github.com/mwmdev/stackhatch"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--muted)]"
            location="navigation"
          >
            <GitBranch className="h-4 w-4" />
            View source
          </TrackedSourceLink>
          <TrackedSourceLink
            href="https://github.com/mwmdev/stackhatch"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--muted)]"
            location="navigation"
            intent="star"
          >
            <Star className="h-4 w-4" />
            Star on GitHub
          </TrackedSourceLink>
        </section>
      </div>
    </PublicPageShell>
  );
}
