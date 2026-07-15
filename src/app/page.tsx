import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, GitBranch, KeyRound, Star } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import LazyArchitectureDemo from "@/components/public/LazyArchitectureDemo";
import RepositoryIntentForm from "@/components/public/RepositoryIntentForm";
import TrackedSourceLink from "@/components/public/TrackedSourceLink";
import { STACKHATCH_DEMO } from "@/content/stackhatch-demo";
import { formatGitHubStarCount, getGitHubStarCount } from "@/lib/github-stars";

export const metadata = {
  alternates: { canonical: "/" },
} satisfies Metadata;

const WORKFLOW = [
  {
    number: "01",
    title: "Map the system.",
    description:
      "Start from a public repository and get a visual overview of the main components and connections.",
  },
  {
    number: "02",
    title: "Ask in context.",
    description: "Ask how a part works or why it connects to the rest of the system.",
  },
  {
    number: "03",
    title: "Test another direction.",
    description:
      "Open a component and compare practical alternatives without losing the current map.",
  },
  {
    number: "04",
    title: "Re-scan when the code changes.",
    description: "Generate a fresh view when the repository evolves.",
  },
];

const USE_MOMENTS = [
  {
    title: "Your project",
    description: "Keep the whole system visible while you work on one part of it.",
  },
  {
    title: "A project you joined",
    description: "Form a useful mental model before making your first change.",
  },
  {
    title: "An open-source project",
    description: "Understand the architecture before choosing where to contribute.",
  },
];

export default async function LandingPage() {
  const githubStars = await getGitHubStarCount();

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="public-header">
        <div className="public-header-inner">
          <Link href="/" className="wordmark" aria-label="StackHatch home">
            <span className="wordmark-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            StackHatch
          </Link>
          <nav aria-label="Primary navigation" className="public-nav">
            <a href="#demo" className="hide-compact">
              Explore demo
            </a>
            <Link href="/demo" className="show-compact">
              Demo
            </Link>
            <TrackedSourceLink
              href="https://github.com/mwmdev/stackhatch"
              target="_blank"
              rel="noreferrer"
              className="github-star-link hide-compact"
              location="navigation"
              intent="star"
              aria-label={
                githubStars === null
                  ? "Star StackHatch on GitHub"
                  : `Star StackHatch on GitHub — ${formatGitHubStarCount(githubStars)} stars`
              }
            >
              <Star aria-hidden="true" className="h-4 w-4" />
              {githubStars === null ? "Star on GitHub" : formatGitHubStarCount(githubStars)}
            </TrackedSourceLink>
            <Link href="/login?callbackUrl=/app">Sign in</Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <p className="public-eyebrow">Visual architecture for GitHub repositories</p>
            <h1>See how your codebase fits together.</h1>
            <p className="hero-description">
              Paste a public GitHub repository. StackHatch maps the system, lets you ask
              architecture questions, and helps you compare other ways to build it.
            </p>
            <div className="hero-action">
              <RepositoryIntentForm location="hero" />
              <div className="hero-action-notes">
                <p>Free to use · AI features use your Anthropic API key</p>
                <a href="#demo">
                  Explore the StackHatch map
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>
        </section>

        <section id="demo" className="self-map-section" aria-labelledby="self-map-heading">
          <div className="self-map-intro">
            <div>
              <p className="public-eyebrow">The product is the proof</p>
              <h2 id="self-map-heading">StackHatch, mapped by StackHatch.</h2>
            </div>
            <div>
              <p>
                This is a real, read-only map generated from the public repository. Open a
                component, follow a connection, or see how StackHatch answers a question about
                itself.
              </p>
              <p className="self-map-provenance">
                {STACKHATCH_DEMO.repository} · mapped from {STACKHATCH_DEMO.sourceCommit} ·{" "}
                {STACKHATCH_DEMO.mappedAtLabel}
              </p>
            </div>
          </div>
          <LazyArchitectureDemo />
          <div className="self-map-footer">
            <Link href="/demo" className="text-action">
              Explore the full map
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <span>No sign-in or API key required</span>
          </div>
        </section>

        <section className="workflow-section" aria-labelledby="workflow-heading">
          <div className="section-heading-row">
            <p className="public-eyebrow">One working loop</p>
            <h2 id="workflow-heading">Keep the architecture in view as the code changes.</h2>
          </div>
          <ol className="workflow-line">
            {WORKFLOW.map((step) => (
              <li key={step.number}>
                <span className="workflow-number">{step.number}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="use-moments-section" aria-labelledby="use-moments-heading">
          <div className="section-heading-row">
            <p className="public-eyebrow">Useful from day one</p>
            <h2 id="use-moments-heading">A map for the codebase in front of you.</h2>
          </div>
          <div className="use-moment-rows">
            {USE_MOMENTS.map((moment) => (
              <article key={moment.title}>
                <h3>{moment.title}</h3>
                <p>{moment.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="trust-section">
          <article id="byok" aria-labelledby="byok-heading">
            <KeyRound aria-hidden="true" className="trust-icon" />
            <h2 id="byok-heading">Free product. Your model. Your key.</h2>
            <p>
              StackHatch has no plans, quotas, or feature gates. Connect an Anthropic API key for
              repository analysis, questions, and alternatives. Your key is encrypted at rest and
              never returned to the browser.
            </p>
            <p className="trust-note">Anthropic bills model usage directly to your account.</p>
            <Link href="/support#byok" className="text-action">
              How BYOK works
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </article>
          <article aria-labelledby="open-heading">
            <GitBranch aria-hidden="true" className="trust-icon" />
            <h2 id="open-heading">Built in the open.</h2>
            <p>Inspect the code behind the map, report an issue, or star StackHatch on GitHub.</p>
            <div className="github-actions">
              <TrackedSourceLink
                href="https://github.com/mwmdev/stackhatch"
                target="_blank"
                rel="noreferrer"
                className="text-action"
                location="navigation"
              >
                View the source
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </TrackedSourceLink>
              <TrackedSourceLink
                href="https://github.com/mwmdev/stackhatch"
                target="_blank"
                rel="noreferrer"
                className="text-action"
                location="navigation"
                intent="star"
              >
                Star on GitHub
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </TrackedSourceLink>
            </div>
          </article>
        </section>

        <section className="final-cta" aria-labelledby="final-cta-heading">
          <div>
            <p className="public-eyebrow">Public repositories</p>
            <h2 id="final-cta-heading">Put your codebase on the map.</h2>
          </div>
          <RepositoryIntentForm location="final" />
        </section>
      </main>

      <footer className="public-footer">
        <div>
          <span className="wordmark">StackHatch</span>
          <p>Architecture you can see, question, and revisit.</p>
        </div>
        <nav aria-label="Footer navigation">
          <Link href="/demo">Demo</Link>
          <TrackedSourceLink
            href="https://github.com/mwmdev/stackhatch"
            target="_blank"
            rel="noreferrer"
            location="navigation"
          >
            GitHub
          </TrackedSourceLink>
          <Link href="/support">Support</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </footer>
    </div>
  );
}
