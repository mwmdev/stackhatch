import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import StackHatchWordmark, { StackHatchLogo } from "./StackHatchWordmark";

const SOURCE_URL = "https://github.com/mwmdev/stackhatch";

function GitHubMark() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="20"
      height="20"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/**
 * The 56 px ink bar shared by the landing page and the public pages: logo,
 * Features, Source, theme, and the one `Start a map` action. The text links
 * drop out below 640 px; the footer repeats Source.
 */
export function PublicBar() {
  return (
    <header className="public-bar ink-frame">
      <StackHatchWordmark href="/" label="StackHatch home" />
      <nav aria-label="Primary navigation" className="public-nav">
        <Link href="/#features" className="public-nav__link">
          Features
        </Link>
        <a
          href={SOURCE_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Source on GitHub"
          title="Source on GitHub"
          className="public-nav__link"
        >
          <GitHubMark />
        </a>
        <ThemeToggle surface="frame" />
        <Link href="/app" className="btn btn--primary public-nav__start">
          Start a map
        </Link>
      </nav>
    </header>
  );
}

/** The 64 px ink footer strip: logo, the privacy line, and the site links. */
export function PublicFooter() {
  return (
    <footer className="public-footer ink-frame">
      <StackHatchLogo />
      <p className="public-footer__tagline">Private by architecture. Open by default.</p>
      <nav aria-label="Footer navigation" className="public-footer__nav">
        <a
          href={SOURCE_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Source on GitHub"
          title="Source on GitHub"
        >
          <GitHubMark />
        </a>
        <Link href="/support">Support</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </nav>
    </footer>
  );
}
