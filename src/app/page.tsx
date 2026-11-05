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
import HeroBackdrop from "./HeroBackdrop";
import { HeroLens, LensLayer, LensOverlay, LensProvider } from "./LandingLens";
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

/** Title on the left, its icon at the right end of the same line. */
function CardHead({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className={styles.head}>
      <h3 className="type-section">{title}</h3>
      <Icon className={styles.icon} aria-hidden="true" strokeWidth={1.75} />
    </div>
  );
}

/** A repository fanning out into the map it drafts; draws itself as the tile scrolls in. */
function LeadSketch() {
  const leaves = [
    { x: 20, tone: styles.toneApi },
    { x: 138, tone: styles.toneServices },
    { x: 256, tone: styles.toneData },
  ];
  return (
    <svg className={styles.sketch} viewBox="0 0 360 160" aria-hidden="true" focusable="false">
      {leaves.map(({ x }) => (
        <path
          key={x}
          className={styles.sketchEdge}
          d={`M180 44 C180 85 ${x + 42} 75 ${x + 42} 116`}
          pathLength={1}
        />
      ))}
      {[{ x: 138, y: 14, tone: styles.toneClient }, ...leaves.map((l) => ({ ...l, y: 116 }))].map(
        ({ x, y, tone }) => (
          <g key={`${x}-${y}`} className={styles.sketchNode}>
            <rect x={x} y={y} width={84} height={30} rx={4} />
            <rect className={tone} x={x + 6} y={y - 4} width={28} height={8} rx={2} />
          </g>
        )
      )}
    </svg>
  );
}

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <PublicBar />

      <LensProvider>
        <main id="main" tabIndex={-1} className={styles.main}>
          <section aria-labelledby="hero-heading" data-landing-region="hero">
            <div className={styles.headline}>
              <HeroBackdrop />
              <HeroLens />
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
            <LensLayer band="audience" />
            <h2 id="audience-heading" className="type-display">
              Who it&apos;s for
            </h2>
            <ul className={styles.columns}>
              {AUDIENCES.map(({ icon, title, uses }) => (
                <li key={title} className={styles.column}>
                  <CardHead icon={icon} title={title} />
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
            className={`${styles.band} ${styles.table}`}
            aria-labelledby="features-heading"
            data-landing-region="features"
          >
            <LensLayer band="features" />
            <h2 id="features-heading" className="type-display">
              Features
            </h2>
            <ul className={styles.mosaic}>
              {FEATURES.map(({ description, icon, size, title }) => (
                <li
                  key={title}
                  className={[
                    styles.tile,
                    size === "lead" ? `${styles.wide} ${styles.lead}` : "",
                    size === "wide" ? styles.wide : "",
                  ].join(" ")}
                >
                  {size === "lead" && <LeadSketch />}
                  <CardHead icon={icon} title={title} />
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
            <LensLayer band="privacy" />
            <h2 id="privacy-heading" className="type-display">
              Your maps stay yours
            </h2>
            <ul className={`${styles.columns} ${styles.privacy}`}>
              {PRIVACY.map(({ description, icon, title }) => (
                <li key={title} className={styles.column}>
                  <CardHead icon={icon} title={title} />
                  <p>{description}</p>
                </li>
              ))}
              <li className={styles.column}>
                <CardHead icon={FileCode} title="Open source" />
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
            <LensLayer band="closing" />
            <h2 id="final-cta-heading" className="type-display">
              Make the next architecture decision visible
            </h2>
            <Link href="/project/new" className="btn btn--primary btn--lg">
              Start a map
            </Link>
          </section>
          <LensOverlay />
        </main>
      </LensProvider>

      <PublicFooter />
    </div>
  );
}
