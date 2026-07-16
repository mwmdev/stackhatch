import Link from "next/link";
import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { ArrowRight, GitBranch, KeyRound, Star } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import ProductStoryStack, { type ProductStory } from "@/components/public/ProductStoryStack";
import TrackedSourceLink from "@/components/public/TrackedSourceLink";
import UseCaseCarousel, { type UseCase } from "@/components/public/UseCaseCarousel";
import { formatGitHubStarCount, getGitHubStarCount } from "@/lib/github-stars";
import styles from "./landing.module.css";

export const metadata = {
  alternates: { canonical: "/" },
} satisfies Metadata;

const publicDisplay = Outfit({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-public-display",
});

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
    description: "Add Note nodes, save reusable templates, and re-scan as the repository changes.",
  },
] as const;

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
    title: "Keep decisions on the map.",
    description:
      "Place Note nodes beside the architecture and re-scan when the repository changes.",
    desktop: "/screenshots/note-node-and-rescan.webp",
    mobile: "/screenshots/note-node-and-rescan-mobile.webp",
    alt: "StackHatch architecture map with a Note node and repository re-scan controls visible.",
  },
] satisfies readonly ProductStory[];

const USE_CASES = [
  {
    title: "Your project",
    description: "Keep the whole system visible while you work on one part of it.",
    image: "/screenshots/architecture-overview.webp",
    imageAlt: "StackHatch architecture overview",
  },
  {
    title: "A project you joined",
    description: "Build a useful mental model before making your first change.",
    image: "/screenshots/ask-and-compare.webp",
    imageAlt: "StackHatch architecture question and alternatives",
  },
  {
    title: "An open-source project",
    description: "Understand the architecture before choosing where to contribute.",
    image: "/screenshots/note-node-and-rescan.webp",
    imageAlt:
      "StackHatch architecture map with a Note node and repository re-scan controls visible.",
  },
] satisfies readonly UseCase[];

const MARQUEE_ITEMS = [
  "Blank canvas",
  "Requirements",
  "Public repository",
  "Personal template",
  "One living map",
] as const;

export default async function LandingPage() {
  const githubStars = await getGitHubStarCount();

  return (
    <div className={`${styles.landingPage} ${publicDisplay.variable}`}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.wordmark} aria-label="StackHatch home">
            <span className={styles.wordmarkMark} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            StackHatch
          </Link>

          <nav aria-label="Primary navigation" className={styles.primaryNav}>
            <div className={styles.navLinks}>
              <a href="#features">Product</a>
              <a href="#workflow">How it works</a>
              <TrackedSourceLink
                href="https://github.com/mwmdev/stackhatch"
                target="_blank"
                rel="noreferrer"
                className={styles.githubStarLink}
                location="navigation"
                intent="star"
                aria-label={
                  githubStars === null
                    ? "Star StackHatch on GitHub"
                    : `Star StackHatch on GitHub — ${formatGitHubStarCount(githubStars)} stars`
                }
              >
                <Star aria-hidden="true" />
                {githubStars === null ? "GitHub" : formatGitHubStarCount(githubStars)}
              </TrackedSourceLink>
            </div>
            <div className={styles.navActions}>
              <Link href="/login?callbackUrl=/app" className={styles.signInLink}>
                Sign in
              </Link>
              <ThemeToggle />
              <Link href="/app" className={styles.navStartLink}>
                Start a map
              </Link>
            </div>
          </nav>
        </div>
      </header>

      <main className="w-full max-w-full">
        <section className={styles.hero} aria-labelledby="hero-heading" data-landing-region="hero">
          <div className={styles.heroGrid} aria-hidden="true" />
          <div className={styles.heroGlow} aria-hidden="true" />
          <div className={styles.heroInner}>
            <div className={styles.heroCopy} data-landing-region="hero-copy">
              <h1
                id="hero-heading"
                className="max-w-6xl"
                aria-label="Keep the whole system in view."
              >
                <span className={styles.heroLine}>Keep the whole system</span>
                <span className={styles.heroLine}>in view.</span>
              </h1>
              <p className={styles.heroDescription}>
                StackHatch turns repositories and requirements into interactive architecture maps
                you can explore, question, and keep current while you build.
              </p>
              <div className={styles.heroActions}>
                <Link href="/app" className={styles.primaryAction}>
                  Start a map
                  <ArrowRight aria-hidden="true" />
                </Link>
                <a href="#features" className={styles.secondaryAction}>
                  See StackHatch in action
                </a>
              </div>
            </div>

            <figure className={styles.heroProof} data-landing-region="hero-proof">
              <picture className={styles.heroPicture}>
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
              <figcaption>
                <span aria-hidden="true" />
                StackHatch mapping its own codebase
              </figcaption>
            </figure>
          </div>
        </section>

        <div className={styles.marquee} data-landing-region="marquee" aria-hidden="true">
          <div className={styles.marqueeTrack} aria-hidden="true">
            {[0, 1].map((set) => (
              <div className={styles.marqueeSet} key={set}>
                {MARQUEE_ITEMS.map((item) => (
                  <span key={`${set}-${item}`}>
                    {item}
                    <i />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        <section id="start" className={styles.startSection} aria-labelledby="start-heading">
          <div className={styles.sectionIntro}>
            <h2 id="start-heading">Start from wherever you are.</h2>
            <p>
              Enter one workspace. StackHatch resumes your latest map, or lets you choose a blank
              canvas, requirements, repository, or template inside the editor.
            </p>
          </div>
          <div className={styles.startEntry}>
            <div className={styles.startEntryCopy}>
              <p className={styles.startEntryLabel}>One application entry</p>
              <h3>Open the editor. Pick a source only when you need one.</h3>
              <p>
                Returning users continue where they left off. New maps begin from the same editor
                workspace without replacing existing work.
              </p>
              <Link href="/app" className={styles.startEntryAction}>
                Start a map
                <ArrowRight aria-hidden="true" />
              </Link>
            </div>
            <div className={styles.startEntryFlow} aria-hidden="true">
              <span>Enter StackHatch</span>
              <i />
              <strong>Resume or create in the editor</strong>
            </div>
          </div>
          <p className={styles.startTrustLine}>
            Free to use <span aria-hidden="true">·</span> Blank maps and templates need no API key{" "}
            <span aria-hidden="true">·</span> AI starts use your Anthropic key
          </p>
        </section>

        <section
          id="features"
          className={styles.featuresSection}
          aria-labelledby="features-heading"
        >
          <div className={styles.featuresIntro}>
            <h2 id="features-heading" aria-label="See the system. Ask why. Keep it current.">
              See the system.
              <span className={styles.inlineMap} aria-hidden="true" />
              Ask why. Keep it current.
            </h2>
            <p>
              The map stays useful after the first scan. Question decisions, compare alternatives,
              attach context, and revisit the system as the code changes.
            </p>
          </div>
          <ProductStoryStack stories={PRODUCT_STORIES} />
        </section>

        <section
          id="workflow"
          className={styles.workflowSection}
          aria-labelledby="workflow-heading"
        >
          <div className={styles.workflowHeading}>
            <h2 id="workflow-heading">One working loop for a changing codebase.</h2>
            <p>Bring the evidence together, shape the view, and keep decisions close to the map.</p>
          </div>
          <ol className={styles.workflowList}>
            {WORKFLOW.map((step) => (
              <li key={step.number}>
                <span className={styles.workflowNumber}>{step.number}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.useCasesSection} aria-labelledby="use-cases-heading">
          <div className={styles.useCasesHeading}>
            <h2 id="use-cases-heading">Useful before the first change—and after the hundredth.</h2>
            <p>
              StackHatch supports the moments when a codebase needs to become understandable again.
            </p>
          </div>
          <UseCaseCarousel cases={USE_CASES} />
        </section>

        <section className={styles.trustSection}>
          <article id="byok" aria-labelledby="byok-heading">
            <KeyRound aria-hidden="true" className={styles.trustIcon} />
            <h2 id="byok-heading">Free product. Your model. Your key.</h2>
            <p>
              StackHatch has no plans, quotas, or feature gates. Connect an Anthropic API key for
              requirements, repository analysis, questions, and alternatives. Your key is encrypted
              at rest and never returned to the browser.
            </p>
            <p className={styles.trustNote}>
              Anthropic bills model usage directly to your account.
            </p>
            <Link href="/support#byok" className={styles.textAction}>
              How BYOK works
              <ArrowRight aria-hidden="true" />
            </Link>
          </article>

          <article aria-labelledby="open-heading">
            <GitBranch aria-hidden="true" className={styles.trustIcon} />
            <h2 id="open-heading">Built in the open.</h2>
            <p>Inspect the code behind the map, report an issue, or star StackHatch on GitHub.</p>
            <div className={styles.githubActions}>
              <TrackedSourceLink
                href="https://github.com/mwmdev/stackhatch"
                target="_blank"
                rel="noreferrer"
                className={styles.textAction}
                location="navigation"
              >
                View the source
                <ArrowRight aria-hidden="true" />
              </TrackedSourceLink>
              <TrackedSourceLink
                href="https://github.com/mwmdev/stackhatch"
                target="_blank"
                rel="noreferrer"
                className={styles.textAction}
                location="navigation"
                intent="star"
              >
                Star on GitHub
                <ArrowRight aria-hidden="true" />
              </TrackedSourceLink>
            </div>
          </article>
        </section>

        <section className={styles.finalCta} aria-labelledby="final-cta-heading">
          <div className={styles.finalCtaInner}>
            <div>
              <h2 id="final-cta-heading">Map the codebase in front of you.</h2>
              <p>Start with what you already have. Keep the architecture useful as it changes.</p>
            </div>
            <div className={styles.finalCtaActions}>
              <Link href="/app" className={styles.finalPrimaryAction}>
                Start a map
                <ArrowRight aria-hidden="true" />
              </Link>
              <Link href="/login?callbackUrl=/app" className={styles.finalSecondaryAction}>
                Sign in to StackHatch
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div>
          <span className={styles.wordmark}>StackHatch</span>
          <p>Architecture you can see, question, and revisit.</p>
        </div>
        <nav aria-label="Footer navigation">
          <Link href="/app">Start a map</Link>
          <a href="#features">Product</a>
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
