import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Check,
  Download,
  GitBranch,
  KeyRound,
  Lock,
  Network,
  Sparkles,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

const WORKFLOWS = [
  {
    step: "01",
    eyebrow: "Repo scan",
    title: "Start from the system that already exists.",
    description:
      "Paste a public GitHub URL and StackHatch turns the codebase into a first useful map: clients, routes, services, stores, and handoff paths.",
    gif: "/demos/repo-to-map.gif",
    poster: "/demos/repo-to-map-poster.png",
    alt: "StackHatch screencast showing a GitHub repository scan generating an architecture map.",
  },
  {
    step: "02",
    eyebrow: "Controlled revision",
    title: "Ask for changes without losing approved decisions.",
    description:
      "Use the architecture chat to revise the system, keep locked nodes intact, and preserve the tradeoffs the team has already agreed on.",
    gif: "/demos/ai-revision.gif",
    poster: "/demos/ai-revision-poster.png",
    alt: "StackHatch screencast showing an AI chat request updating a map while a locked auth node stays unchanged.",
  },
  {
    step: "03",
    eyebrow: "Handoff",
    title: "Leave with a diagram, alternatives, and a PRD.",
    description:
      "Review credible swaps for a node, choose the recommendation, and export material that a client, investor, or engineer can act on.",
    gif: "/demos/export-handoff.gif",
    poster: "/demos/export-handoff-poster.png",
    alt: "StackHatch screencast showing database alternatives and export options for an architecture plan.",
  },
];

const DECISION_POINTS = [
  "Bring your own Anthropic key on every plan",
  "Repo maps, blank canvases, and PRD uploads start from the same editor",
  "Node locking keeps approved choices stable while the rest of the map changes",
  "Exports create a diagram and PRD for client, investor, and engineering review",
];

const USE_CASES = [
  {
    label: "Solo founders",
    value: "Turn a loose product idea or repo into a stack you can explain before hiring.",
  },
  {
    label: "Small agencies",
    value: "Give clients an architecture plan without turning discovery into a heavyweight deck.",
  },
  {
    label: "Devtool teams",
    value: "Compare infrastructure decisions before the roadmap locks in avoidable rewrites.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="font-display text-xl font-extrabold tracking-tight">
            StackHatch
          </Link>
          <nav aria-label="Primary navigation" className="flex items-center gap-1">
            <Link
              href="/pricing"
              className="hidden min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] sm:inline-flex"
            >
              Pricing
            </Link>
            <Link
              href="/login?callbackUrl=/app"
              className="inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Sign in
            </Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl gap-10 px-6 py-14 lg:grid-cols-[minmax(0,1fr)_520px] lg:items-center lg:py-20">
          <div className="min-w-0">
            <p className="mb-5 inline-flex rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              Architecture maps for small technical teams
            </p>
            <h1 className="font-display max-w-3xl text-4xl font-extrabold leading-[0.98] tracking-tight md:text-6xl">
              StackHatch maps your architecture before the build hardens.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--muted-foreground)]">
              Start from a real repo, PRD, or blank canvas. StackHatch diagrams the system, explains
              tradeoffs, and keeps decisions visible as the product changes.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/login?callbackUrl=/app"
                className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--brand)] px-5 py-2.5 text-sm font-bold text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)]"
              >
                Open the workspace
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex min-h-11 items-center rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-5 py-2.5 text-sm font-bold hover:bg-[var(--muted)]"
              >
                Compare plans
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--muted-foreground)]">
              <span className="inline-flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-[var(--color-data)]" />
                BYOK
              </span>
              <span className="inline-flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-[var(--color-client)]" />
                Repo analysis
              </span>
              <span className="inline-flex items-center gap-2">
                <Lock className="h-4 w-4 text-[var(--color-services)]" />
                Locked decisions
              </span>
              <span className="inline-flex items-center gap-2">
                <Download className="h-4 w-4 text-[var(--color-api)]" />
                PRD and diagram export
              </span>
            </div>
          </div>

          <figure className="product-frame overflow-hidden rounded-lg bg-[var(--card)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-[var(--color-external-fill)]" />
                <span className="h-3 w-3 rounded-full bg-[var(--color-data-fill)]" />
                <span className="h-3 w-3 rounded-full bg-[var(--color-api-fill)]" />
              </div>
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                repo-to-map
              </span>
            </div>
            <div className="relative bg-[var(--canvas)]">
              <Image
                src="/demos/repo-to-map-poster.png"
                alt="StackHatch workspace showing a repository-generated architecture map."
                width={960}
                height={600}
                priority
                className="h-auto w-full"
              />
              <div className="absolute bottom-4 left-4 right-4 rounded-md border border-[var(--border)] bg-[var(--card)]/95 p-3 shadow-lg shadow-[var(--shadow-color)]">
                <div className="flex items-start gap-3">
                  <Network className="mt-0.5 h-5 w-5 flex-none text-[var(--color-client)]" />
                  <p className="text-sm leading-6 text-[var(--muted-foreground)]">
                    Auth is coupled to the API layer. Isolate token exchange before adding team
                    workspaces.
                  </p>
                </div>
              </div>
            </div>
            <figcaption className="sr-only">
              A StackHatch architecture map generated from a repository.
            </figcaption>
          </figure>
        </section>

        <section className="border-t border-[var(--border)] py-14">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-[var(--color-data)]">
                  Working proof
                </p>
                <h2 className="font-display mt-3 text-3xl font-extrabold tracking-tight">
                  Three decisions, one shared map.
                </h2>
                <p className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">
                  The page uses real app recordings because the product has to earn trust with
                  behavior, not screenshots made for a sales deck.
                </p>
              </div>

              <div className="grid gap-6">
                {WORKFLOWS.map((workflow) => (
                  <article
                    key={workflow.step}
                    className="grid overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
                  >
                    <div className="flex flex-col justify-between gap-8 p-5">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                          {workflow.step} / {workflow.eyebrow}
                        </p>
                        <h3 className="font-display mt-3 text-2xl font-bold leading-tight">
                          {workflow.title}
                        </h3>
                        <p className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">
                          {workflow.description}
                        </p>
                      </div>
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--muted)] text-[var(--color-client)]">
                        <Sparkles className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="border-t border-[var(--border)] bg-[var(--canvas)] md:border-l md:border-t-0">
                      <picture>
                        <source media="(prefers-reduced-motion: reduce)" srcSet={workflow.poster} />
                        <Image
                          src={workflow.gif}
                          alt={workflow.alt}
                          width={640}
                          height={400}
                          loading={workflow.step === "01" ? "eager" : "lazy"}
                          unoptimized
                          className="h-full w-full object-cover"
                        />
                      </picture>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-[var(--border)] py-14">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-[var(--color-api)]">
                Built for the first technical handoff
              </p>
              <h2 className="font-display mt-3 text-3xl font-extrabold tracking-tight">
                Enough structure to decide. Not so much process that you stop building.
              </h2>
            </div>
            <div className="space-y-3">
              {DECISION_POINTS.map((item) => (
                <div
                  key={item}
                  className="flex min-w-0 items-start gap-3 border-b border-[var(--border)] py-3 last:border-b-0"
                >
                  <Check className="mt-0.5 h-5 w-5 flex-none text-[var(--success)]" />
                  <p className="text-sm leading-6 text-[var(--foreground)]">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-[var(--border)] py-14">
          <div className="mx-auto grid max-w-6xl gap-8 px-6 lg:grid-cols-3">
            {USE_CASES.map((item) => (
              <article key={item.label} className="border-t border-[var(--foreground)] pt-4">
                <h3 className="font-display text-2xl font-bold">{item.label}</h3>
                <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">
                  {item.value}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-[var(--border)] py-14">
          <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-3xl font-extrabold tracking-tight">
                Map the stack before it gets expensive.
              </h2>
              <p className="mt-2 text-[var(--muted-foreground)]">
                Start free with your own key. Upgrade when exports and team workflows matter.
              </p>
            </div>
            <Link
              href="/login?callbackUrl=/app"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-5 py-2.5 text-sm font-bold text-[var(--background)] hover:opacity-90"
            >
              Open StackHatch
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border)] py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 text-sm text-[var(--muted-foreground)] sm:flex-row sm:items-center sm:justify-between">
          <span className="font-display font-bold">StackHatch</span>
          <nav aria-label="Footer navigation" className="flex flex-wrap gap-1">
            <Link
              href="/support"
              className="inline-flex min-h-11 items-center rounded-md px-3 hover:text-[var(--foreground)]"
            >
              Support
            </Link>
            <Link
              href="/privacy"
              className="inline-flex min-h-11 items-center rounded-md px-3 hover:text-[var(--foreground)]"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="inline-flex min-h-11 items-center rounded-md px-3 hover:text-[var(--foreground)]"
            >
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
