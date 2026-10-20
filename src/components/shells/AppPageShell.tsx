import type { ReactNode } from "react";
import AppBar, { type AppRoute } from "./AppBar";

export type AppPageShellProps = {
  /** Passed to the app bar: marks the active control and hides `New map` on `new`. */
  current?: AppRoute;
  /** Replaces the app bar's "All maps" breadcrumb. */
  crumb?: ReactNode;
  /** The page title (h1), set as a condensed page title over a 2 px ink rule. */
  title: ReactNode;
  /** Quiet text beside the title, such as a count. */
  meta?: ReactNode;
  /** Controls at the right end of the title row, such as a quiet `Cancel`. */
  titleActions?: ReactNode;
  /** A left index column (260 px), such as the settings section nav. */
  index?: ReactNode;
  /** A docked paper column on the right (400 px), such as backup and restore. */
  aside?: ReactNode;
  /** Drops the content gutter so rows can run their rules edge to edge. */
  flush?: boolean;
  children: ReactNode;
  className?: string;
};

/**
 * The app route frame: ink bar, then index / titled column / docked aside.
 * Columns stack below 1024 px.
 */
export default function AppPageShell({
  aside,
  children,
  className,
  crumb,
  current,
  flush = false,
  index,
  meta,
  title,
  titleActions,
}: AppPageShellProps) {
  return (
    <div className={["app-shell", className].filter(Boolean).join(" ")}>
      <AppBar current={current} crumb={crumb} />
      <main id="main" tabIndex={-1} className="app-shell__body">
        <header className="app-shell__title-row">
          <h1 className="app-shell__title">{title}</h1>
          {meta ? <div className="app-shell__meta">{meta}</div> : null}
          {titleActions ? <div className="app-shell__title-actions">{titleActions}</div> : null}
        </header>
        {index ? <div className="app-shell__index">{index}</div> : null}
        <div className="app-shell__content" data-flush={flush || undefined}>
          {children}
        </div>
        {aside ? <div className="app-shell__aside">{aside}</div> : null}
      </main>
    </div>
  );
}
