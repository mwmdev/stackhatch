import type { Metadata } from "next";
import Link from "next/link";
import {
  Briefcase,
  ClipboardList,
  Code,
  DatabaseBackup,
  Download,
  FileCode,
  FileText,
  FolderGit2,
  HardDrive,
  KeyRound,
  Lock,
  MessagesSquare,
  Scale,
  UserX,
  type LucideIcon,
} from "lucide-react";
import { PublicBar, PublicFooter } from "@/components/shells/PublicChrome";
import HeroStart from "./HeroStart";
import HeroTour from "./HeroTour";
import styles from "./landing.module.css";

export const metadata = {
  alternates: { canonical: "/" },
} satisfies Metadata;

const SOURCE_URL = "https://github.com/mwmdev/stackhatch";

interface Card {
  icon: LucideIcon;
  title: string;
  description: string;
}

const AUDIENCES: readonly (Omit<Card, "description"> & { uses: readonly string[] })[] = [
  {
    icon: Code,
    title: "Solo developers",
    uses: [
      "Get oriented in a repository before changing it",
      "Plan a side project before writing code",
      "Keep decisions in notes beside the diagram",
    ],
  },
  {
    icon: Briefcase,
    title: "Agencies",
    uses: [
      "Map a client's codebase at kickoff",
      "Turn a client brief into a proposed stack",
      "Hand over a diagram and a PRD",
    ],
  },
  {
    icon: ClipboardList,
    title: "PMs and non-technical founders",
    uses: [
      "See what your team built, in plain words",
      "Ask what a component does and why it's there",
      "Turn requirements into a PRD engineers can review",
    ],
  },
];

/** The lead tile takes a 2×2 block, wide tiles two columns, the rest one cell. */
const FEATURES: readonly (Card & { size?: "lead" | "wide" })[] = [
  {
    icon: FolderGit2,
    title: "Map a GitHub repository",
    description:
      "Paste a link. StackHatch reads the README, file tree, and key config files at the current commit, then drafts a map. Private repositories need a read-only token.",
    size: "lead",
  },
  {
    icon: FileText,
    title: "Start from a brief",
    description: "Drop in a Markdown brief, or start blank. Drawing needs no key.",
  },
  {
    icon: MessagesSquare,
    title: "Ask the map",
    description: "Ask how data flows or why a part exists. Answers come from the map you see.",
  },
  {
    icon: Scale,
    title: "Compare alternatives",
    description: "See the options for any component without replacing the current choice.",
  },
  {
    icon: Lock,
    title: "Lock what's settled",
    description: "Locked components keep their place and details through AI edits and Auto-layout.",
  },
  {
    icon: Download,
    title: "Export and hand off",
    description: "PNG or SVG for slides, JSON or YAML for tools, and a Markdown PRD for the team.",
    size: "wide",
  },
  {
    icon: DatabaseBackup,
    title: "Back up and restore",
    description: "Save one map or the whole workspace to a file, checked before it restores.",
    size: "wide",
  },
];

const PRIVACY: readonly Card[] = [
  {
    icon: UserX,
    title: "No account",
    description: "No sign-up, no StackHatch database, no product analytics.",
  },
  {
    icon: HardDrive,
    title: "Stays in your browser",
    description: "Maps, chat, and settings live in this browser until you export them.",
  },
  {
    icon: KeyRound,
    title: "Your key, direct",
    description:
      "AI features use your own Anthropic, OpenAI, Google Gemini, or OpenRouter key, sent straight to the provider.",
  },
];

function CardIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className={styles.icon} aria-hidden="true" strokeWidth={1.75} />;
}

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <PublicBar />

      <main id="main" tabIndex={-1} className={styles.main}>
        <section aria-labelledby="hero-heading" data-landing-region="hero">
          <div className={styles.headline}>
            {/* One line on desktop; three forced lines on a phone. */}
            <h1 id="hero-heading" className={`type-display-xl ${styles.title}`}>
              <span>Keep the</span> <span>whole stack</span> <span>in view</span>
            </h1>
            <div className={styles.lede}>
              <div className={styles.ledeText}>
                <p>
                  StackHatch turns a GitHub repository or a Markdown brief into an editable
                  architecture map you can question, reshape, and export.
                </p>
                <p className={styles.terms}>Free · No account · Bring your own AI key</p>
              </div>
              <HeroStart />
            </div>
          </div>

          <div className={styles.slot} data-testid="hero-proof">
            <HeroTour />
          </div>
        </section>

        <section
          className={styles.band}
          aria-labelledby="audience-heading"
          data-landing-region="audience"
        >
          <h2 id="audience-heading" className="type-display">
            Who it&apos;s for
          </h2>
          <ul className={styles.cards}>
            {AUDIENCES.map(({ icon, title, uses }) => (
              <li key={title} className={styles.card}>
                <CardIcon icon={icon} />
                <h3 className="type-section">{title}</h3>
                <ul className={styles.uses}>
                  {uses.map((use) => (
                    <li key={use}>{use}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>

        <section
          id="features"
          className={styles.band}
          aria-labelledby="features-heading"
          data-landing-region="features"
        >
          <h2 id="features-heading" className="type-display">
            Features
          </h2>
          <ul className={styles.mosaic}>
            {FEATURES.map(({ description, icon, size, title }) => (
              <li
                key={title}
                className={[
                  styles.card,
                  size === "lead" ? `${styles.wide} ${styles.lead}` : "",
                  size === "wide" ? styles.wide : "",
                ].join(" ")}
              >
                <CardIcon icon={icon} />
                <h3 className="type-section">{title}</h3>
                <p>{description}</p>
              </li>
            ))}
          </ul>
        </section>

        <section
          className={styles.band}
          aria-labelledby="privacy-heading"
          data-landing-region="privacy"
        >
          <h2 id="privacy-heading" className="type-display">
            Your maps stay yours
          </h2>
          <ul className={`${styles.cards} ${styles.privacy}`}>
            {PRIVACY.map(({ description, icon, title }) => (
              <li key={title} className={styles.card}>
                <CardIcon icon={icon} />
                <h3 className="type-section">{title}</h3>
                <p>{description}</p>
              </li>
            ))}
            <li className={styles.card}>
              <CardIcon icon={FileCode} />
              <h3 className="type-section">Open source</h3>
              <p>
                Free and MIT licensed.{" "}
                <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="link">
                  View on GitHub
                </a>
              </p>
            </li>
          </ul>
        </section>

        <section
          className={styles.closing}
          aria-labelledby="final-cta-heading"
          data-landing-region="final-cta"
        >
          <h2 id="final-cta-heading" className="type-display">
            Make the next architecture decision visible
          </h2>
          <Link href="/project/new" className="btn btn--primary btn--lg">
            Start a map
          </Link>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
