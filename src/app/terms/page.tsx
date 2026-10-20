import Link from "next/link";
import PublicPageShell from "@/components/shells/PublicPageShell";
import styles from "../public-pages.module.css";
import { shareMetadata } from "@/lib/site-metadata";

const DESCRIPTION = "The terms for using StackHatch and its generated architecture maps.";

export const metadata = {
  title: "Terms",
  description: DESCRIPTION,
  alternates: { canonical: "/terms" },
  ...shareMetadata("Terms — StackHatch", DESCRIPTION),
};

export default function TermsPage() {
  return (
    <PublicPageShell title="Terms of Use" description="Effective October 1, 2026">
      <nav aria-label="Legal pages" className={styles.pageNav}>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms" aria-current="page">
          Terms
        </Link>
      </nav>

      <article className={styles.legal}>
        <section>
          <h2 className="type-section">Using StackHatch</h2>
          <p>
            StackHatch is free, open-source software for creating and exploring architecture maps.
            The hosted app requires no account and stores workspace data in your browser. You are
            responsible for keeping backups when the work matters and for protecting access to your
            device and browser profile.
          </p>
        </section>

        <section>
          <h2 className="type-section">Providers and credentials</h2>
          <p>
            Repository and AI actions are optional. When you start one, your browser connects
            directly to GitHub or your chosen AI provider (Anthropic, OpenAI, Google Gemini, or
            OpenRouter). You are responsible for your provider credentials, charges, rate limits,
            and compliance with each provider&apos;s terms. Never use a key you are not authorized
            to use.
          </p>
        </section>

        <section>
          <h2 className="type-section">Content and generated output</h2>
          <p>
            Only analyze repositories and content you have permission to use. Generated maps,
            explanations, alternatives, and PRDs may be incomplete or incorrect. They are aids for
            engineering judgment, not a security audit or a substitute for reviewing the underlying
            system before making production decisions.
          </p>
        </section>

        <section>
          <h2 className="type-section">Acceptable use</h2>
          <p>
            Do not use StackHatch to violate applicable law, disrupt the hosted site or provider
            services, bypass technical safeguards, distribute malware, or expose credentials or
            content that you are not permitted to share.
          </p>
        </section>

        <section>
          <h2 className="type-section">Availability and support</h2>
          <p>
            The software and public hosted app are provided as-is, without an uptime or support
            commitment. Community help is handled in the public GitHub repository. Do not post API
            keys, private project content, or other sensitive material in a public issue.
          </p>
        </section>
      </article>
    </PublicPageShell>
  );
}
