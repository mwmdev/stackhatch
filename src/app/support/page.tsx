import Link from "next/link";
import { ArrowRight, BookOpen, GitBranch, LifeBuoy, Mail, ShieldCheck, Star } from "lucide-react";
import TrackedSourceLink from "@/components/public/TrackedSourceLink";
import PublicPageShell from "@/components/shells/PublicPageShell";
import styles from "../public-pages.module.css";

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
      className={styles.supportShell}
    >
      <div className={styles.publicLayout}>
        <nav aria-label="Support topics" className={styles.sectionNav}>
          {SUPPORT_PATHS.map((item) => (
            <a key={item.id} href={`#${item.id}`}>
              {item.title}
            </a>
          ))}
        </nav>

        <div className={styles.supportContent}>
          <section className={styles.contactPanel}>
            <LifeBuoy aria-hidden="true" />
            <div className={styles.panelCopy}>
              <h2>Contact support</h2>
              <p>
                Include your account email, browser, and the action that failed. Never email an API
                key or private project content.
              </p>
            </div>
            <a
              href="mailto:support@stackhatch.io"
              className={`${styles.actionLink} ${styles.primaryActionLink}`}
            >
              <Mail className="h-4 w-4" aria-hidden="true" />
              support@stackhatch.io
            </a>
          </section>

          <section className={styles.supportPaths} aria-label="Support guidance">
            {SUPPORT_PATHS.map((item) => (
              <article key={item.title} id={item.id} className={styles.supportPath}>
                <BookOpen aria-hidden="true" />
                <h2>{item.title}</h2>
                <p>{item.description}</p>
              </article>
            ))}
          </section>

          <section className={styles.trustPanel}>
            <ShieldCheck aria-hidden="true" />
            <div className={styles.panelCopy}>
              <h2>Trust basics</h2>
              <p>
                Review the privacy and terms pages before sharing customer-sensitive requirements.
              </p>
            </div>
            <div className={styles.trustActions}>
              <Link href="/privacy" className={styles.actionLink}>
                Privacy
              </Link>
              <Link href="/terms" className={styles.actionLink}>
                Terms
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>

          <section className={styles.sourcePanel}>
            <p>StackHatch is open source and developed in public.</p>
            <div className={styles.sourceActions}>
              <TrackedSourceLink
                href="https://github.com/mwmdev/stackhatch"
                target="_blank"
                rel="noreferrer"
                className={styles.actionLink}
                location="navigation"
              >
                <GitBranch className="h-4 w-4" />
                View source
              </TrackedSourceLink>
              <TrackedSourceLink
                href="https://github.com/mwmdev/stackhatch"
                target="_blank"
                rel="noreferrer"
                className={styles.actionLink}
                location="navigation"
                intent="star"
              >
                <Star className="h-4 w-4" />
                Star on GitHub
              </TrackedSourceLink>
            </div>
          </section>
        </div>
      </div>
    </PublicPageShell>
  );
}
