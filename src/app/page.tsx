import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CircleHelp,
  HardDrive,
  MessageSquareText,
  Network,
  RefreshCw,
  Send,
  Star,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import StackHatchWordmark from "@/components/shells/StackHatchWordmark";
import IconControl from "@/components/ui/IconControl";
import styles from "./landing.module.css";

export const metadata = {
  alternates: { canonical: "/" },
} satisfies Metadata;

const CAPABILITIES = [
  {
    title: "See and shape the system.",
    description:
      "Turn a repository or requirements brief into components and connections you can rearrange as your understanding changes.",
    icon: Network,
  },
  {
    title: "Ask how it works. Compare alternatives.",
    description:
      "Question a component in context, trace a path through the stack, and compare practical options for the part in front of you.",
    icon: MessageSquareText,
  },
  {
    title: "Keep decisions and the map current.",
    description:
      "Place Notes beside decisions, save reusable templates, and re-scan repository-backed maps as the code changes.",
    icon: RefreshCw,
  },
] as const;

const WORKFLOW = [
  {
    number: "01",
    title: "Bring what you have.",
    description: "Begin with a public repository, a requirements file, a blank map, or a template.",
  },
  {
    number: "02",
    title: "Shape and explore the map.",
    description:
      "Follow the connections, inspect components, and edit the structure into a useful view.",
  },
  {
    number: "03",
    title: "Ask. Decide. Revisit.",
    description:
      "Question the architecture, keep context in Notes, and re-scan when the code moves.",
  },
] as const;

export default function LandingPage() {
  return (
    <div className={styles.landingPage}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <StackHatchWordmark href="/" label="StackHatch home" className={styles.wordmark} />

          <nav aria-label="Primary navigation" className={styles.primaryNav}>
            <div className={styles.navLinks}>
              <a href="#features">Features</a>
              <a href="#workflow">How it works</a>
              <a
                href="https://github.com/mwmdev/stackhatch"
                target="_blank"
                rel="noreferrer"
                className={styles.githubStarLink}
                aria-label="Star StackHatch on GitHub"
              >
                <Star aria-hidden="true" />
                GitHub
              </a>
            </div>

            <div className={styles.navActions}>
              <IconControl href="/support" label="Support" tooltipPlacement="bottom">
                <CircleHelp />
              </IconControl>
              <ThemeToggle />
              <Link href="/app" className={styles.navStartLink}>
                Start a map
              </Link>
            </div>
          </nav>
        </div>
      </header>

      <main>
        <section className={styles.hero} aria-labelledby="hero-heading" data-landing-region="hero">
          <div className={styles.heroInner}>
            <div className={styles.heroCopy} data-testid="hero-copy">
              <p className={styles.eyebrow}>Architecture workspace</p>
              <h1 id="hero-heading" aria-label="Keep the whole stack in view">
                <span className={styles.heroLine}>Keep the whole stack</span>
                <span className={styles.heroLine}>in view</span>
              </h1>
              <p className={styles.heroDescription}>
                StackHatch turns repositories and requirements into interactive architecture maps
                that stay in your browser. No account, no product analytics, and no StackHatch data
                server.
              </p>
              <div className={styles.heroActions}>
                <Link href="/app" className={styles.primaryAction}>
                  Start a map
                  <ArrowRight aria-hidden="true" />
                </Link>
                <a href="#features" className={styles.secondaryAction}>
                  See what it does
                </a>
              </div>
            </div>

            <figure className={styles.heroProof} data-testid="hero-proof">
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
                  alt="Synthetic Customer Portal reference architecture in the real StackHatch editor with a component detail panel open"
                />
              </picture>
              <figcaption>
                <span aria-hidden="true" />A synthetic Customer Portal reference architecture in the
                real StackHatch editor
              </figcaption>
            </figure>
          </div>
        </section>

        <section
          className={styles.trustStrip}
          aria-label="Why teams can start with StackHatch"
          data-landing-region="trust"
        >
          <div className={styles.trustInner}>
            <article>
              <HardDrive aria-hidden="true" />
              <div>
                <h2>No account. Maps stay on this device.</h2>
                <p>
                  Projects, chat, templates, and preferences live in your browser—not in a
                  StackHatch database.
                </p>
              </div>
            </article>
            <article>
              <Send aria-hidden="true" />
              <div>
                <h2>Direct BYOK, only when you ask.</h2>
                <p>
                  Approved actions contact GitHub or Anthropic from your browser. Your key never
                  passes through us.
                </p>
              </div>
            </article>
            <article>
              <Star aria-hidden="true" />
              <div>
                <h2>Open source on GitHub.</h2>
                <p>
                  Inspect the code or contribute.{" "}
                  <a
                    href="https://github.com/mwmdev/stackhatch"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="View StackHatch on GitHub"
                  >
                    View on GitHub
                  </a>
                </p>
              </div>
            </article>
          </div>
        </section>

        <section
          id="features"
          className={styles.capabilitiesSection}
          aria-labelledby="features-heading"
          data-landing-region="capabilities"
        >
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>One working surface</p>
            <h2 id="features-heading">A map for the work around the code.</h2>
            <p>
              The architecture stays useful after the first scan: a shared place to understand the
              system, test a direction, and keep the reasoning close.
            </p>
          </div>

          <div className={styles.capabilityRows}>
            {CAPABILITIES.map(({ description, icon: Icon, title }) => (
              <article key={title} className={styles.capabilityRow}>
                <div className={styles.capabilityIcon}>
                  <Icon aria-hidden="true" />
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          id="workflow"
          className={styles.workflowSection}
          aria-labelledby="workflow-heading"
          data-landing-region="workflow"
        >
          <div className={styles.workflowInner}>
            <div className={styles.sectionHeading}>
              <p className={styles.eyebrow}>A short path in</p>
              <h2 id="workflow-heading">From source to a living map.</h2>
              <p>Start with the evidence you have, then refine the view as the system evolves.</p>
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
          </div>
        </section>

        <section
          className={styles.finalCta}
          aria-labelledby="final-cta-heading"
          data-landing-region="final-cta"
        >
          <div className={styles.finalCtaInner}>
            <div>
              <p className={styles.eyebrow}>Start with what you have</p>
              <h2 id="final-cta-heading">Map the codebase in front of you.</h2>
              <p>Keep the architecture visible, useful, and ready for the next decision.</p>
            </div>
            <div className={styles.finalCtaActions}>
              <Link href="/app" className={styles.primaryAction}>
                Start a map
                <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div>
          <StackHatchWordmark href="/" label="StackHatch home" />
          <p>Private by architecture. Open by default.</p>
        </div>
        <nav aria-label="Footer navigation">
          <a href="https://github.com/mwmdev/stackhatch" target="_blank" rel="noreferrer">
            Source
          </a>
          <Link href="/support">Support</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </footer>
    </div>
  );
}
