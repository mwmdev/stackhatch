import Link from "next/link";
import PublicPageShell from "@/components/shells/PublicPageShell";
import styles from "../public-pages.module.css";

export const metadata = {
  title: "Privacy",
  description:
    "The local-first StackHatch privacy boundary: device storage, direct provider requests, and static hosting.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <PublicPageShell
      homeHref="/"
      homeLabel="StackHatch home"
      eyebrow="Policy"
      title="Privacy Policy"
      description="Effective July 24, 2026"
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
            <h2>The Short Version</h2>
            <p>
              StackHatch is a static, local-first application. It has no user accounts, product
              analytics, application database, or API for receiving your maps. Projects, messages,
              repository evidence, templates, and preferences stay in your browser profile.
            </p>
          </section>

          <section>
            <h2>Data on Your Device</h2>
            <p>
              StackHatch stores workspace data in browser storage. It does not sync that data
              between devices. Clearing site data, resetting the browser profile, losing the device,
              or using private-browsing storage can remove it. Use the backup controls in Settings
              if you need a portable copy.
            </p>
            <p>
              Backups include your maps and app settings but exclude provider credentials. An
              Anthropic key stays in memory for the browser session by default. If you explicitly
              choose to remember it, the key is stored in this browser profile until you forget it
              or clear site data.
            </p>
          </section>

          <section>
            <h2>Direct Provider Requests</h2>
            <p>
              StackHatch contacts no provider while you edit a blank map. When you approve a public
              repository scan, your browser sends the repository reference directly to GitHub and
              receives bounded public evidence. Private repositories are not supported.
            </p>
            <p>
              When you approve an AI action, your browser sends the selected model, relevant map and
              conversation context, requirements, and bounded repository evidence directly to
              Anthropic using your key. StackHatch does not proxy or retain that request. GitHub and
              Anthropic process those direct requests under their own terms and privacy policies;
              Anthropic bills usage to the account that issued the key.
            </p>
          </section>

          <section>
            <h2>Static Hosting</h2>
            <p>
              The StackHatch host serves only the application&apos;s HTML, JavaScript, fonts,
              images, and styles. It sets no application session cookie and runs no product
              analytics. Like any web host, the hosting and network infrastructure may temporarily
              process ordinary request metadata such as an IP address, user agent, requested path,
              timestamp, and security events to deliver and protect the site. It has no application
              endpoint for project content or provider keys.
            </p>
          </section>

          <section>
            <h2>Network Boundary</h2>
            <p>
              The published host policy permits application connections only to the StackHatch
              origin, GitHub&apos;s API, and Anthropic&apos;s API. Imported files, repository
              content, and model output are treated as untrusted text and cannot add executable
              assets or new network destinations.
            </p>
          </section>

          <section>
            <h2>Your Controls</h2>
            <p>
              Settings lets you export or restore a backup, forget a remembered key, and clear all
              StackHatch data in this browser. Because StackHatch never receives the workspace,
              there is no remote account or project record for us to retrieve, correct, or delete.
              Self-hosted forks and third-party hosts set their own operational practices.
            </p>
          </section>
        </article>
      </div>
    </PublicPageShell>
  );
}
