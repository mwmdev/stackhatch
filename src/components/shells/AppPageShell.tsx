import type { ReactNode } from "react";
import StackHatchWordmark from "./StackHatchWordmark";

export type AppPageShellProps = {
  homeHref: string;
  homeLabel: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  navigation?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  density?: "comfortable" | "dense";
  className?: string;
};

export default function AppPageShell({
  actions,
  children,
  className,
  density = "comfortable",
  description,
  eyebrow,
  footer,
  homeHref,
  homeLabel,
  navigation,
  title,
}: AppPageShellProps) {
  return (
    <div
      className={["page-shell app-page-shell", className].filter(Boolean).join(" ")}
      data-density={density}
    >
      <header className="page-shell__site-header">
        <div className="page-shell__bar">
          <StackHatchWordmark href={homeHref} label={homeLabel} />
          {navigation ? (
            <nav className="page-shell__navigation" aria-label="Primary navigation">
              {navigation}
            </nav>
          ) : null}
          {actions ? <div className="page-shell__actions">{actions}</div> : null}
        </div>
      </header>

      <main className="page-shell__main" data-density={density}>
        <header className="page-shell__heading">
          {eyebrow ? <div className="page-shell__eyebrow">{eyebrow}</div> : null}
          <div className="page-shell__heading-row">
            <div>
              <h1 className="page-shell__title">{title}</h1>
              {description ? <div className="page-shell__description">{description}</div> : null}
            </div>
          </div>
        </header>
        <div className="page-shell__content">{children}</div>
      </main>

      {footer ? <footer className="page-shell__footer">{footer}</footer> : null}
    </div>
  );
}
