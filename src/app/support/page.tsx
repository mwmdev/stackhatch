import Link from "next/link";
import PublicPageShell from "@/components/shells/PublicPageShell";
import styles from "../public-pages.module.css";
import { shareMetadata } from "@/lib/site-metadata";

const DESCRIPTION =
  "Getting started with StackHatch, canvas controls, troubleshooting, and backups.";

export const metadata = {
  title: "Help",
  description: DESCRIPTION,
  alternates: { canonical: "/support" },
  ...shareMetadata("Help — StackHatch", DESCRIPTION),
};

const SOURCE_URL = "https://github.com/mwmdev/stackhatch";

const GETTING_STARTED = [
  {
    title: "Start a map",
    body: "Open New map. Start with a blank canvas, a requirements file, or a GitHub repository. Public repositories need no token; private ones need a read-only GitHub token from Settings. Blank starts empty; the other sources open an editable local map you can review and refine.",
  },
  {
    title: "Add an AI key",
    body: "Drawing needs no key. AI features use your own Anthropic, OpenAI, Google Gemini, or OpenRouter key, added on New map or in Settings. It stays in session memory unless you explicitly choose to remember it on this device, and the provider bills usage directly.",
  },
  {
    title: "Shape the canvas",
    body: "Select a node to open its details and rename it, change its technology, category, or subtype. Drag from a node's edge handle to another node to connect them, then pick the connection type.",
  },
  {
    title: "Rename and export",
    body: "Select the map title in the toolbar to rename it. Export gives you PNG, SVG, JSON, YAML, a portable backup of the map, and a Markdown PRD.",
  },
];

const INTERACTIONS = [
  ["Open a node", "Click it, or focus it and press Enter or Space"],
  ["Node menu", "Right-click a node, or press Shift+F10 while it is focused"],
  ["Edit a connection label", "Double-click the label on the connection"],
  ["Remove a connection", "Click the connection, then Remove connection"],
  ["Delete a node", "Node menu, then Delete twice — this also removes its connections"],
  ["Send a chat message", "Enter sends; Shift+Enter adds a line"],
  ["Close a dialog or menu", "Escape"],
];

const TROUBLESHOOTING = [
  {
    title: "\u201c<Provider> rejected the API key\u201d",
    body: "The key reached your chosen provider (Anthropic, Google Gemini, or OpenRouter) and was refused. Check for a copied space or a revoked key, then re-enter it in Settings. This is different from having no key at all, which asks you to add one.",
  },
  {
    title: "\u201c<Provider> could not be reached\u201d",
    body: "The request never got an answer your browser could read. Check your connection first. OpenAI also answers a rejected key this way, so if your connection is fine, re-enter the OpenAI key in Settings.",
  },
  {
    title: "\u201cAuto-save is paused\u201d",
    body: "The same map changed in another tab or window. The banner offers to retry, reload the stored map, save your visible version as a copy, or overwrite the stored one. Nothing is discarded until you choose.",
  },
  {
    title: "A backup will not restore",
    body: "Restores validate the file before changing anything, so a rejected backup has left your maps untouched. Check you picked a StackHatch backup rather than a diagram export \u2014 JSON and YAML exports are diagrams, not backups.",
  },
  {
    title: "A repository map looks incomplete",
    body: "Repository scans read a bounded amount of evidence and say so when a scan was partial. Re-scan from the toolbar after the code moves, and treat the result as an explanation to review rather than a source of truth.",
  },
];

const TOPICS = [
  { id: "getting-started", title: "Getting started" },
  { id: "canvas-interactions", title: "Working the canvas" },
  { id: "troubleshooting", title: "When something goes wrong" },
  { id: "local-data", title: "Back up your work" },
  { id: "get-help", title: "Get help" },
];

export default function SupportPage() {
  return (
    <PublicPageShell title="Help">
      <nav aria-label="Help topics" className={styles.pageNav}>
        {TOPICS.map((item) => (
          <a key={item.id} href={`#${item.id}`}>
            {item.title}
          </a>
        ))}
      </nav>

      <div className={styles.sections}>
        <section aria-labelledby="getting-started">
          <div className={styles.sectionHead}>
            <h2 id="getting-started" className="type-section">
              Getting started
            </h2>
            {/* Help is linked from inside the app, so it needs a way back. */}
            <Link href="/app/maps" className="btn btn--sm">
              Open your maps
            </Link>
          </div>
          <ul className={styles.ruledList}>
            {GETTING_STARTED.map((item) => (
              <li key={item.title}>
                <h3 className="type-subhead">{item.title}</h3>
                <p>{item.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="canvas-interactions">
          <h2 id="canvas-interactions" className="type-section">
            Working the canvas
          </h2>
          <dl className={styles.defs}>
            {INTERACTIONS.map(([action, how]) => (
              <div key={action}>
                <dt>{action}</dt>
                <dd>{how}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="troubleshooting">
          <h2 id="troubleshooting" className="type-section">
            When something goes wrong
          </h2>
          <ul className={`${styles.ruledList} ${styles.stacked}`}>
            {TROUBLESHOOTING.map((item) => (
              <li key={item.title}>
                <h3 className="type-subhead">{item.title}</h3>
                <p>{item.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="local-data">
          <h2 id="local-data" className="type-section">
            Back up your work
          </h2>
          <p>
            Maps live in this browser profile and do not sync to an account. Back up all maps from
            All maps or Settings before clearing site data, changing browser profiles, or moving
            devices.
          </p>
        </section>

        <section aria-labelledby="get-help">
          <h2 id="get-help" className="type-section">
            Get help
          </h2>
          <p>
            Ask a question or report a reproducible bug on GitHub. Keep keys, private requirements,
            and private repository content out of public issues. StackHatch is MIT-licensed, open
            source, and developed in public.
          </p>
          <div className={styles.actions}>
            <a
              href={`${SOURCE_URL}/issues/new/choose`}
              target="_blank"
              rel="noreferrer"
              className="btn"
            >
              Open an issue
            </a>
            <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="btn btn--quiet">
              View source
            </a>
          </div>
        </section>
      </div>
    </PublicPageShell>
  );
}
