import type { ReactNode } from "react";
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
      <header className="page-shell__site-header">
        <div className="page-shell__bar">
          <StackHatchWordmark href={homeHref} label={homeLabel} />
          {actions ? <div className="page-shell__actions">{actions}</div> : null}
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

      {footer ? <footer className="page-shell__footer">{footer}</footer> : null}
    </div>
  );
}
