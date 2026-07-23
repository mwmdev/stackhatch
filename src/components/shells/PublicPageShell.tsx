import Link from "next/link";
import type { ReactNode } from "react";
import ThemeToggle from "../ThemeToggle";
import TrackedSourceLink from "../public/TrackedSourceLink";
import StackIllustration from "./StackIllustration";
import StackHatchWordmark from "./StackHatchWordmark";

export type PublicPageShellProps = {
  homeHref: string;
  homeLabel: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: "standard" | "reading";
  className?: string;
};

function PublicPageFooter() {
  return (
    <div className="public-page-shell__footer-inner">
      <span className="font-display font-bold text-[var(--foreground)]">StackHatch</span>
      <nav aria-label="Footer navigation" className="public-page-shell__footer-links">
        <TrackedSourceLink
          href="https://github.com/mwmdev/stackhatch"
          target="_blank"
          rel="noreferrer"
          location="navigation"
        >
          Source
        </TrackedSourceLink>
        <Link href="/support">Support</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </nav>
    </div>
  );
}

export default function PublicPageShell({
  actions,
  children,
  className,
  description,
  eyebrow,
  footer,
  homeHref,
  homeLabel,
  title,
  width = "standard",
}: PublicPageShellProps) {
  return (
    <div className={["page-shell public-page-shell", className].filter(Boolean).join(" ")}>
      <StackIllustration variant="shell" />
      <header className="page-shell__site-header">
        <div className="page-shell__bar">
          <StackHatchWordmark href={homeHref} label={homeLabel} />
          <div className="page-shell__actions">
            {actions}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="page-shell__main" data-width={width}>
        <header className="page-shell__heading">
          {eyebrow ? <div className="page-shell__eyebrow">{eyebrow}</div> : null}
          <h1 className="page-shell__title">{title}</h1>
          {description ? <div className="page-shell__description">{description}</div> : null}
        </header>
        <div className="page-shell__content">{children}</div>
      </main>

      {footer === null ? null : (
        <footer className="page-shell__footer">
          {footer === undefined ? <PublicPageFooter /> : footer}
        </footer>
      )}
    </div>
  );
}
