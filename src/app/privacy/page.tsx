import Link from "next/link";
import PublicPageShell from "@/components/shells/PublicPageShell";
import styles from "../public-pages.module.css";
import { shareMetadata } from "@/lib/site-metadata";

const DESCRIPTION =
  "The local-first StackHatch privacy boundary: device storage, direct provider requests, and static hosting.";

export const metadata = {
  title: "Privacy",
  description: DESCRIPTION,
  alternates: { canonical: "/privacy" },
  ...shareMetadata("Privacy — StackHatch", DESCRIPTION),
};

export default function PrivacyPage() {
  return (
    <PublicPageShell title="Privacy Policy" description="Effective October 1, 2026">
      <nav aria-label="Legal pages" className={styles.pageNav}>
        <Link href="/privacy" aria-current="page">
          Privacy
        </Link>
        <Link href="/terms">Terms</Link>
      </nav>

      <article className={styles.legal}>
        <section>
          <h2 className="type-section">The short version</h2>
          <p>
            StackHatch is a static, local-first application. It has no user accounts, product
            analytics, application database, or API for receiving your maps. Projects, messages,
            repository evidence, and preferences stay in your browser profile.
          </p>
        </section>

        <section>
          <h2 className="type-section">Data on your device</h2>
          <p>
            StackHatch stores workspace data in browser storage. It does not sync that data between
            devices. Clearing site data, resetting the browser profile, losing the device, or using
            private-browsing storage can remove it. Back up all maps from All maps or Settings if
            you need a portable copy.
          </p>
          <p>
            Backups include your maps and app settings but exclude provider credentials and your
            GitHub token. Each provider&apos;s key (Anthropic, OpenAI, Google Gemini, or OpenRouter)
            and the optional GitHub token stay in memory for the browser session by default. If you
            explicitly choose to remember one, it is stored in this browser profile until you forget
            it, use Clear all local data, or clear site data.
          </p>
          <p>
            A repository map keeps the repository address, the commit it was generated from, and the
            folders you unchecked. Source read to generate it is not stored. Maps made with earlier
            versions may still hold README and configuration excerpts until they are re-scanned.
            Treat backups of private-repository maps as confidential.
          </p>
          <p>
            Source read to generate a local-folder map is not stored. The map keeps the
            folder&apos;s name and the folders you unchecked. If you send a component&apos;s files
            through &quot;Ask about these files&quot;, that attachment is stored in the chat and
            included in map and device backups. Common secret files and files that look like they
            hold keys are skipped, but StackHatch cannot detect every secret.
          </p>
        </section>

        <section>
          <h2 className="type-section">Direct provider requests</h2>
          <p>
            StackHatch contacts no provider while you edit a blank map or while you pick and review
            a local folder. Reviewing a repository reads it from GitHub. AI actions go straight from
            your browser to the service below, only when you start them.
          </p>
          <table className={styles.requests}>
            <thead>
              <tr>
                <th scope="col">When you</th>
                <th scope="col">Your browser contacts</th>
                <th scope="col">What it sends</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Review a repository</th>
                <td data-label="Your browser contacts">GitHub (api.github.com)</td>
                <td data-label="What it sends">
                  The repository reference and optional directory. GitHub returns the
                  repository&apos;s metadata, languages, topics, default branch, current commit,
                  file list, and how many API requests you have left. When you approve, StackHatch
                  reads each file in the folders you checked from that commit, one request per file.
                  Public repositories need no token. Private repositories need a fine-grained,
                  read-only GitHub token, sent in the Authorization header on every request.
                </td>
              </tr>
              <tr>
                <th scope="row">Map a GitHub repository</th>
                <td data-label="Your browser contacts">The AI provider you selected</td>
                <td data-label="What it sends">
                  The repository&apos;s metadata and the full text of the files in the folders you
                  checked, minus skipped files, in one request, with your key for that provider.
                  This can include content from private repositories.
                </td>
              </tr>
              <tr>
                <th scope="row">Map a local folder</th>
                <td data-label="Your browser contacts">The AI provider you selected</td>
                <td data-label="What it sends">
                  The full text of the files in the folders you checked, minus skipped files, in one
                  request, with your key for that provider. &quot;Ask about these files&quot; sends
                  that component&apos;s files when you send the message, and stores that attachment
                  in the chat and backups. Nothing is sent to GitHub.
                </td>
              </tr>
              <tr>
                <th scope="row">Ask about a component&apos;s files</th>
                <td data-label="Your browser contacts">GitHub (api.github.com)</td>
                <td data-label="What it sends">
                  The repository reference, scanned commit, and up to six linked file paths, with
                  your GitHub token when set. GitHub returns their contents, each shortened to 6,000
                  characters, for a removable chat attachment. Sending that message shares the
                  attachment with your selected AI provider and stores it in the thread and backups.
                </td>
              </tr>
              <tr>
                <th scope="row">Run an AI action</th>
                <td data-label="Your browser contacts">
                  The AI provider you selected: Anthropic, OpenAI, Google Gemini, or OpenRouter
                </td>
                <td data-label="What it sends">
                  The selected model, this map&apos;s latest committed nodes and connections, its
                  chat history, your custom subtype vocabulary, any requirements brief, and any
                  source-file or uploaded attachment you send, with your key for that provider. This
                  can include content from private repositories.
                </td>
              </tr>
            </tbody>
          </table>
          <p>
            When you set a GitHub token, your browser sends it only to api.github.com. It never
            reaches StackHatch and is never sent to an AI provider. No AI provider key is sent to
            GitHub.
          </p>
          <p>
            Entering a key is the approval for the requests your actions make; nothing is sent until
            you act. StackHatch does not proxy or retain that request. GitHub and the selected
            provider process these direct requests under their own terms and privacy policies; the
            provider bills usage to the account that issued the key. If you select OpenRouter, it
            forwards each request to the provider of the model you chose, under OpenRouter&apos;s
            terms.
          </p>
        </section>

        <section>
          <h2 className="type-section">Static hosting</h2>
          <p>
            The StackHatch host serves only the application&apos;s HTML, JavaScript, fonts, images,
            and styles. It sets no application session cookie and runs no product analytics. Like
            any web host, the hosting and network infrastructure may temporarily process ordinary
            request metadata such as an IP address, user agent, requested path, timestamp, and
            security events to deliver and protect the site. It has no application endpoint for
            project content or provider keys.
          </p>
        </section>

        <section>
          <h2 className="type-section">Network boundary</h2>
          <p>
            The published host policy permits application connections only to the StackHatch origin,
            GitHub&apos;s API, and the APIs of Anthropic, OpenAI, Google Gemini, and OpenRouter.
            Imported files, repository content, and model output are treated as untrusted text and
            cannot add executable assets or new network destinations.
          </p>
        </section>

        <section>
          <h2 className="type-section">Your controls</h2>
          <p>
            Settings lets you export a full backup, forget a remembered key, and clear all
            StackHatch data in this browser. Restore backups from All maps. Because StackHatch never
            receives the workspace, there is no remote account or project record for us to retrieve,
            correct, or delete. Self-hosted forks and third-party hosts set their own operational
            practices.
          </p>
        </section>
      </article>
    </PublicPageShell>
  );
}
