import Link from "next/link";
import PublicPageShell from "@/components/shells/PublicPageShell";
import styles from "../public-pages.module.css";

export const metadata = {
  title: "Privacy",
  description:
    "How StackHatch handles accounts, public repository analysis, AI keys, and analytics.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <PublicPageShell
      homeHref="/"
      homeLabel="StackHatch home"
      eyebrow="Policy"
      title="Privacy Policy"
      description="Effective July 22, 2026"
      className={styles.legalShell}
    >
      <div className={styles.publicLayout}>
        <nav aria-label="Legal pages" className={styles.sectionNav}>
          <Link href="/privacy" aria-current="page">
            Privacy
          </Link>
          <Link href="/terms">Terms</Link>
        </nav>

        <article className={styles.legalArticle}>
          <section>
            <h2>Information We Use</h2>
            <p className="mt-2">
              StackHatch stores account profile details from authentication, personal project names
              and descriptions, public repository URLs, generated architecture data (including Note
              nodes placed on a map), personal templates, and user preferences needed to operate the
              product.
            </p>
          </section>

          <section>
            <h2>Public Repository Analysis</h2>
            <p className="mt-2">
              When you ask StackHatch to scan a public GitHub repository, it reads bounded
              repository metadata, languages, the file tree, README, and selected configuration
              files. StackHatch records the public repository URL, scanned commit, scan time, and
              whether the evidence was partial. Private repositories are not supported.
            </p>
          </section>

          <section>
            <h2>Product Analytics</h2>
            <p className="mt-2">
              When enabled, StackHatch uses privacy-focused Umami analytics to count page visits and
              named product actions. It records the normalized page path, site hostname, browser
              language, screen dimensions, and—when relevant—an allowlisted page location and fixed
              error category. Automatic event capture and user identification are disabled.
              Analytics never include repository names, project IDs, prompts, API keys, account
              identifiers, referrers, page titles, or URL query strings.
            </p>
          </section>

          <section>
            <h2>AI Keys and Project Content</h2>
            <p className="mt-2">
              Each user provides their own Anthropic API key. Keys are encrypted before storage,
              used only on the server for that user&apos;s requests, and never returned to the
              browser. Project content is sent to Anthropic only when a user asks StackHatch to
              generate, analyze, or revise architecture output.
            </p>
          </section>

          <section>
            <h2>AI Provider</h2>
            <p className="mt-2">
              StackHatch does not process payments. Anthropic bills AI usage directly to the
              Anthropic account associated with each user-provided key. Anthropic&apos;s own privacy
              terms apply when it processes those AI requests.
            </p>
          </section>

          <section>
            <h2>Data Retention</h2>
            <p className="mt-2">
              Account and personal project data remain stored until the related project or account
              is deleted. You can delete your account permanently from Settings. After deletion
              commits, your profile, encrypted AI key, projects, messages, templates, and
              preferences are removed from the active application database. StackHatch does not
              currently apply an automatic expiration period. If you later sign in with GitHub
              again, StackHatch creates a fresh account; the new account and any old session do not
              restore deleted data.
            </p>
            <p className="mt-2">
              SQLite WAL files and backups follow the storage-retention lifecycle managed by the
              operator. Self-hosted operators control their own database backups and retention
              schedules, so account deletion does not promise immediate byte-level removal from
              every backup or storage layer.
            </p>
          </section>

          <section>
            <h2>Data Requests</h2>
            <p className="mt-2">
              Use Settings for self-service account deletion. To request project export or
              correction of account data, contact support@stackhatch.io from the email associated
              with the account.
            </p>
          </section>
        </article>
      </div>
    </PublicPageShell>
  );
}
