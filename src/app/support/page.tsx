import Link from "next/link";
import { ArrowRight, BookOpen, GitBranch, LifeBuoy, ShieldCheck, Star } from "lucide-react";
import PublicPageShell from "@/components/shells/PublicPageShell";
import styles from "../public-pages.module.css";

export const metadata = {
  title: "Help",
  description: "Help with local maps, browser backups, BYOK setup, and repository evidence.",
  alternates: { canonical: "/support" },
};

const SUPPORT_PATHS = [
  {
    id: "local-data",
    title: "Protect your local work",
    description:
      "Maps live in this browser profile and do not sync to an account. Use Settings to export a backup before clearing site data, changing browser profiles, or moving devices.",
  },
  {
    id: "byok",
    title: "Bring your Anthropic key",
    description:
      "Blank maps need no key. Add a key in Settings for AI actions; it stays in session memory unless you explicitly choose to remember it on this device. Anthropic bills usage directly.",
  },
  {
    id: "evidence",
    title: "Understand the evidence",
    description:
      "Repository maps use bounded public GitHub evidence and may be partial. Review the scanned revision, warnings, inferred components, and connections before relying on a generated map.",
  },
];

export default function SupportPage() {
  return (
    <PublicPageShell
      homeHref="/"
      homeLabel="StackHatch home"
      eyebrow="Help"
      title="Keep your map private, portable, and understandable."
      description="The app is local-first and the project is community-supported. These are the boundaries worth knowing before you start."
      className={styles.supportShell}
    >
      <div className={styles.publicLayout}>
        <nav aria-label="Help topics" className={styles.sectionNav}>
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
              <h2>Community support</h2>
              <p>
                Ask a question or report a reproducible bug on GitHub. Keep keys, private
                requirements, and private repository content out of public issues.
              </p>
            </div>
            <a
              href="https://github.com/mwmdev/stackhatch/issues/new/choose"
              target="_blank"
              rel="noreferrer"
              className={`${styles.actionLink} ${styles.primaryActionLink}`}
            >
              <GitBranch className="h-4 w-4" aria-hidden="true" />
              Open an issue
            </a>
          </section>

          <section className={styles.supportPaths} aria-label="Help guidance">
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
              <h2>Trust boundary</h2>
              <p>
                The app stores your work locally and contacts GitHub or Anthropic only after an
                explicit action. Read the exact data and provider boundaries before using sensitive
                material.
              </p>
            </div>
            <div className={styles.trustActions}>
              <Link href="/privacy" className={styles.actionLink}>
                Privacy
              </Link>
              <Link href="/terms" className={styles.actionLink}>
                Terms
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </section>

          <section className={styles.sourcePanel}>
            <p>StackHatch is MIT-licensed, open source, and developed in public.</p>
            <div className={styles.sourceActions}>
              <a
                href="https://github.com/mwmdev/stackhatch"
                target="_blank"
                rel="noreferrer"
                className={styles.actionLink}
              >
                <GitBranch className="h-4 w-4" aria-hidden="true" />
                View source
              </a>
              <a
                href="https://github.com/mwmdev/stackhatch"
                target="_blank"
                rel="noreferrer"
                className={styles.actionLink}
              >
                <Star className="h-4 w-4" aria-hidden="true" />
                Star on GitHub
              </a>
            </div>
          </section>
        </div>
      </div>
    </PublicPageShell>
  );
}
