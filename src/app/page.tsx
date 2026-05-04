import Link from "next/link";
import { ArrowRight, Check, GitBranch, KeyRound, MessageSquare, Network } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

const PREVIEW_NODES = [
  { name: "Next.js App", tech: "Frontend", color: "var(--color-client)" },
  { name: "API Layer", tech: "Routes", color: "var(--color-api)" },
  { name: "Auth", tech: "GitHub OAuth", color: "var(--color-services)" },
  { name: "Database", tech: "SQLite/Drizzle", color: "var(--color-data)" },
  { name: "Claude", tech: "Architecture AI", color: "var(--color-services)" },
  { name: "Exports", tech: "PRD/PNG/JSON", color: "var(--color-infrastructure)" },
];

const CAPABILITIES = [
  "Map a public repo into an editable architecture diagram",
  "Chat with an assistant that understands your stack decisions",
  "Compare alternatives before committing to infrastructure",
  "Export diagrams and PRDs for investor, customer, and engineering review",
];

const LAUNCH_SIGNALS = [
  {
    label: "Customer wedge",
    value: "solo founders, freelance builders, and small devtool teams",
  },
  {
    label: "Activation",
    value: "first useful architecture map from a real repo or PRD",
  },
  {
    label: "Expansion",
    value: "exports, comments, templates, and team workspaces",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="text-lg font-bold tracking-tight">
            StackHatch
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/pricing"
              className="hidden rounded-md px-3 py-2 text-sm font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] sm:inline-flex"
            >
              Pricing
            </Link>
            <Link
              href="/login?callbackUrl=/app"
              className="rounded-md px-3 py-2 text-sm font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Sign in
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1fr_460px] lg:items-center lg:py-24">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-[var(--border)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              Architecture intelligence for developers
            </p>
            <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-6xl">
              StackHatch turns codebases and ideas into architecture you can ship.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--muted-foreground)]">
              Paste a GitHub repo, describe a product, or upload requirements. StackHatch maps the
              system, explains the tradeoffs, and keeps the diagram useful as your startup evolves.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/login?callbackUrl=/app"
                className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--color-client)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-client-hover)]"
              >
                Start free with BYOK
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex min-h-11 items-center rounded-md border border-[var(--border)] px-5 py-2.5 text-sm font-semibold hover:bg-[var(--muted)]"
              >
                View pricing
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--muted-foreground)]">
              <span className="inline-flex items-center gap-2">
                <KeyRound className="h-4 w-4" />
                Free BYOK
              </span>
              <span className="inline-flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                Repo analysis
              </span>
              <span className="inline-flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                AI architecture chat
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
                <span className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
                <span className="h-3 w-3 rounded-full bg-[#28C840]" />
              </div>
              <span className="text-xs font-medium text-[var(--muted-foreground)]">
                architecture map
              </span>
            </div>
            <div className="relative min-h-[360px] overflow-hidden p-5">
              <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
                <line x1="18%" y1="30%" x2="50%" y2="30%" stroke="var(--border)" />
                <line x1="50%" y1="30%" x2="82%" y2="30%" stroke="var(--border)" />
                <line x1="18%" y1="30%" x2="18%" y2="68%" stroke="var(--border)" />
                <line x1="50%" y1="30%" x2="50%" y2="68%" stroke="var(--border)" />
                <line x1="82%" y1="30%" x2="82%" y2="68%" stroke="var(--border)" />
              </svg>
              <div className="relative grid grid-cols-3 gap-4 pt-10">
                {PREVIEW_NODES.map((node) => (
                  <div
                    key={node.name}
                    className="min-w-0 rounded-md border bg-[var(--background)] p-3"
                    style={{ borderColor: node.color }}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 flex-none rounded-full"
                        style={{ backgroundColor: node.color }}
                      />
                      <span className="truncate text-sm font-semibold">{node.name}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-[var(--muted-foreground)]">
                      {node.tech}
                    </p>
                  </div>
                ))}
              </div>
              <div className="absolute bottom-5 left-5 right-5 rounded-md border border-[var(--border)] bg-[var(--background)] p-4">
                <div className="flex items-start gap-3">
                  <Network className="mt-0.5 h-5 w-5 flex-none text-[var(--color-client)]" />
                  <p className="text-sm leading-6 text-[var(--muted-foreground)]">
                    Your auth service is coupled to the API layer. Consider isolating token exchange
                    before adding team workspaces.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-[var(--border)] py-14">
          <div className="mx-auto grid max-w-6xl gap-8 px-6 lg:grid-cols-[360px_1fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-[var(--color-client)]">
                Why it converts
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight">
                Useful before payment. Stronger after upgrade.
              </h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {CAPABILITIES.map((item) => (
                <div
                  key={item}
                  className="flex min-w-0 gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"
                >
                  <Check className="mt-0.5 h-5 w-5 flex-none text-green-600" />
                  <p className="text-sm leading-6 text-[var(--foreground)]">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-[var(--border)] py-14">
          <div className="mx-auto grid max-w-6xl gap-8 px-6 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-[var(--color-api)]">
                Launch focus
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight">
                Built for teams that need architecture decisions before the roadmap hardens.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
                StackHatch starts narrow: technical founders and small product teams who need to
                explain system choices quickly, avoid expensive rewrites, and hand a clear plan to
                collaborators.
              </p>
            </div>
            <div className="grid gap-3">
              {LAUNCH_SIGNALS.map((signal) => (
                <div
                  key={signal.label}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"
                >
                  <div className="text-sm font-semibold">{signal.label}</div>
                  <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
                    {signal.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-[var(--border)] py-14">
          <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Ready to map your stack?</h2>
              <p className="mt-2 text-[var(--muted-foreground)]">
                Start free with your own Anthropic key, then upgrade when hosted AI and team
                workflow matter.
              </p>
            </div>
            <Link
              href="/login?callbackUrl=/app"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-5 py-2.5 text-sm font-semibold text-[var(--background)] hover:opacity-90"
            >
              Open StackHatch
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border)] py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 text-sm text-[var(--muted-foreground)] sm:flex-row sm:items-center sm:justify-between">
          <span>StackHatch</span>
          <div className="flex flex-wrap gap-5">
            <Link href="/support" className="hover:text-[var(--foreground)]">
              Support
            </Link>
            <Link href="/privacy" className="hover:text-[var(--foreground)]">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-[var(--foreground)]">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
