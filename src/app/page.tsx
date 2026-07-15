import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, GitBranch, KeyRound, Star } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import PublicStartLaunchpad from "@/components/public/PublicStartLaunchpad";
import TrackedSourceLink from "@/components/public/TrackedSourceLink";
import { formatGitHubStarCount, getGitHubStarCount } from "@/lib/github-stars";

export const metadata = {
  alternates: { canonical: "/" },
} satisfies Metadata;

const WORKFLOW = [
  {
    number: "01",
    title: "Bring what you have.",
    description: "Begin with a blank canvas, requirements, a public repository, or a saved map.",
  },
  {
    number: "02",
    title: "Shape the system.",
    description:
      "See the components and connections, then edit the map until it matches your view.",
  },
  {
    number: "03",
    title: "Ask and compare.",
    description:
      "Question the architecture in context and test practical alternatives for any part.",
  },
  {
    number: "04",
    title: "Keep it current.",
    description:
      "Attach private notes, save reusable templates, and re-scan as the repository changes.",
  },
];

const USE_MOMENTS = [
  {
    title: "Your project",
    description: "Keep the whole system visible while you work on one part of it.",
  },
  {
    title: "A project you joined",
    description: "Build a useful mental model before making your first change.",
  },
  {
    title: "An open-source project",
    description: "Understand the architecture before choosing where to contribute.",
  },
];

const PRODUCT_STORIES = [
  {
    title: "Ask the architecture.",
    description:
      "Ask how a path works in context, then compare practical alternatives for the selected component.",
    desktop: "/screenshots/ask-and-compare.webp",
    mobile: "/screenshots/ask-and-compare-mobile.webp",
    alt: "StackHatch answering what the AI Analysis Engine does and showing real alternatives for the selected component",
  },
  {
    title: "Keep decisions close.",
    description: "Attach private notes to the map and re-scan a repository when the code changes.",
    desktop: "/screenshots/notes-and-rescan.webp",
    mobile: "/screenshots/notes-and-rescan-mobile.webp",
    alt: "StackHatch map with a private component note and repository re-scan controls visible",
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
            <a href="#features" className="hide-compact">
              Features
            </a>
            <a href="#workflow" className="hide-compact">
              How it works
            </a>
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
        <section className="hero-section" aria-labelledby="hero-heading">
          <div className="hero-grid">
            <div className="hero-intro">
              <p className="public-eyebrow">Visual architecture for real software</p>
              <h1 id="hero-heading">Keep the whole system in view.</h1>
              <p className="hero-description">
                StackHatch turns repositories and requirements into interactive architecture maps
                you can explore, question, and keep current while you build.
              </p>
              <div className="hero-actions">
                <a href="#features" className="hero-primary-action">
                  See StackHatch in action
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </a>
                <a href="#start" className="hero-secondary-action">
                  Start a map
                </a>
              </div>
            </div>
            <figure className="hero-product-proof">
              <picture className="hero-product-shot">
                <source
                  media="(max-width: 760px)"
                  srcSet="/screenshots/architecture-overview-mobile.webp"
                />
                <img
                  src="/screenshots/architecture-overview.webp"
                  width="1600"
                  height="1000"
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  alt="StackHatch architecture map of its own Next.js codebase with a component detail panel open"
                />
              </picture>
              <figcaption>StackHatch mapping its own codebase.</figcaption>
            </figure>
          </div>
        </section>

        <section id="start" className="start-section" aria-labelledby="start-heading">
          <div className="start-section-intro">
            <p className="public-eyebrow">Four ways in</p>
            <div>
              <h2 id="start-heading">Start from wherever you are.</h2>
              <p>
                Begin with a blank canvas, requirements, a public repository, or a saved template.
              </p>
            </div>
          </div>
          <PublicStartLaunchpad />
          <p className="start-trust-line">
            Free to use <span aria-hidden="true">·</span> Blank maps and templates need no API key{" "}
            <span aria-hidden="true">·</span> AI starts use your Anthropic key
          </p>
        </section>

        <section
          id="features"
          className="product-stories-section"
          aria-labelledby="features-heading"
        >
          <div className="product-stories-intro">
            <p className="public-eyebrow">Inside the workspace</p>
            <h2 id="features-heading">Ask why. Keep it current.</h2>
          </div>
          <div className="product-story-list">
            {PRODUCT_STORIES.map((story) => (
              <article key={story.title} className="product-story">
                <div className="product-story-copy">
                  <h3>{story.title}</h3>
                  <p>{story.description}</p>
                </div>
                <picture className="product-shot">
                  <source media="(max-width: 760px)" srcSet={story.mobile} />
                  <img
                    src={story.desktop}
                    width="1600"
                    height="1000"
                    loading="lazy"
                    decoding="async"
                    alt={story.alt}
                  />
                </picture>
              </article>
            ))}
          </div>
        </section>

        <section id="workflow" className="workflow-section" aria-labelledby="workflow-heading">
          <div className="section-heading-row">
            <p className="public-eyebrow">One working loop</p>
            <h2 id="workflow-heading">Keep the architecture in view as the project changes.</h2>
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
              requirements, repository analysis, questions, and alternatives. Your key is encrypted
              at rest and never returned to the browser.
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
            <p className="public-eyebrow">Four ways in</p>
            <h2 id="final-cta-heading">Start from where you are.</h2>
          </div>
          <div className="final-cta-actions">
            <a href="#start" className="final-primary-action">
              Choose a starting point
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </a>
            <Link href="/login?callbackUrl=/app" className="text-action">
              Sign in to StackHatch
            </Link>
          </div>
        </section>
      </main>

      <footer className="public-footer">
        <div>
          <span className="wordmark">StackHatch</span>
          <p>Architecture you can see, question, and revisit.</p>
        </div>
        <nav aria-label="Footer navigation">
          <a href="#start">Start a map</a>
          <a href="#features">Features</a>
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
