import type { ReactNode } from "react";
import { PublicBar, PublicFooter } from "./PublicChrome";

export type PublicPageShellProps = {
  /** The page title (h1), set as a condensed page title over a 2 px ink rule. */
  title: ReactNode;
  /** One quiet line under the title, such as an effective date. */
  description?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Support, privacy and terms: the public ink bar, a 720 px reading column on
 * the page gutter, and the ink footer strip.
 */
export default function PublicPageShell({
  children,
  className,
  description,
  title,
}: PublicPageShellProps) {
  return (
    <div className={["public-shell", className].filter(Boolean).join(" ")}>
      <PublicBar />
      <main id="main" tabIndex={-1} className="public-shell__main">
        <header className="public-shell__heading">
          <h1 className="public-shell__title">{title}</h1>
          {description ? <div className="public-shell__description">{description}</div> : null}
        </header>
        <div className="public-shell__content">{children}</div>
      </main>
      <PublicFooter />
    </div>
  );
}
