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
      title="Terms of Service"
      description="Effective July 15, 2026"
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
            <h2>Use of StackHatch</h2>
            <p className="mt-2">
              StackHatch helps users generate architecture diagrams, place Note nodes on maps, keep
              personal templates, and create handoff artifacts from bounded repository evidence and
              user input. Projects are accessible only to their account owner; StackHatch does not
              provide shared project access. Generated maps are explanations, not a complete audit
              of a codebase. Users are responsible for reviewing output before relying on it for
              production engineering decisions.
            </p>
          </section>

          <section>
            <h2>Accounts and AI Usage</h2>
            <p className="mt-2">
              StackHatch is free to use. AI features require a user-provided Anthropic API key, and
              Anthropic bills that usage directly to the user&apos;s Anthropic account. Users are
              responsible for securing their Anthropic account and complying with its terms.
            </p>
          </section>

          <section>
            <h2>Acceptable Use</h2>
            <p className="mt-2">
              Users may not attempt to bypass access controls, abuse AI or repository scanning,
              upload content they do not have permission to use, or use StackHatch to violate
              applicable law.
            </p>
          </section>

          <section>
            <h2>Support</h2>
            <p className="mt-2">
              For account or product support, contact support@stackhatch.io from the email
              associated with the account.
            </p>
          </section>
        </article>
      </div>
    </PublicPageShell>
  );
}
