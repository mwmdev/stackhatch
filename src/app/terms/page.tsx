import Link from "next/link";
import PublicPageShell from "@/components/shells/PublicPageShell";
import styles from "../public-pages.module.css";

export const metadata = {
  title: "Terms",
  description: "The terms for using StackHatch and its generated architecture maps.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <PublicPageShell
      homeHref="/"
      homeLabel="StackHatch home"
      eyebrow="Agreement"
      title="Terms of Use"
      description="Effective July 24, 2026"
      className={styles.legalShell}
    >
      <div className={styles.publicLayout}>
        <nav aria-label="Legal pages" className={styles.sectionNav}>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms" aria-current="page">
            Terms
          </Link>
        </nav>

        <article className={styles.legalArticle}>
          <section>
            <h2>Using StackHatch</h2>
            <p>
              StackHatch is free, open-source software for creating and exploring architecture maps.
              The hosted app requires no account and stores workspace data in your browser. You are
              responsible for keeping backups when the work matters and for protecting access to
              your device and browser profile.
            </p>
          </section>

          <section>
            <h2>Providers and Credentials</h2>
            <p>
              Repository and AI actions are optional. When you approve one, your browser connects
              directly to GitHub or Anthropic. You are responsible for your provider credentials,
              charges, rate limits, and compliance with each provider&apos;s terms. Never use a key
              you are not authorized to use.
            </p>
          </section>

          <section>
            <h2>Content and Generated Output</h2>
            <p>
              Only analyze repositories and content you have permission to use. Generated maps,
              explanations, alternatives, and PRDs may be incomplete or incorrect. They are aids for
              engineering judgment, not a security audit or a substitute for reviewing the
              underlying system before making production decisions.
            </p>
          </section>

          <section>
            <h2>Acceptable Use</h2>
            <p>
              Do not use StackHatch to violate applicable law, disrupt the hosted site or provider
              services, bypass technical safeguards, distribute malware, or expose credentials or
              content that you are not permitted to share.
            </p>
          </section>

          <section>
            <h2>Availability and Support</h2>
            <p>
              The software and public hosted app are provided as-is, without an uptime or support
              commitment. Community help is handled in the public GitHub repository. Do not post API
              keys, private project content, or other sensitive material in a public issue.
            </p>
          </section>
        </article>
      </div>
    </PublicPageShell>
  );
}
