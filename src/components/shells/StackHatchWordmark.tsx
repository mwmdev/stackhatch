import Link from "next/link";
import type { ComponentProps } from "react";

export type StackHatchMarkProps = Omit<ComponentProps<"span">, "children">;

/** The mark alone: a stacked layer in a square, stroked in the primary ochre. */
export function StackHatchMark({ className, ...spanProps }: StackHatchMarkProps) {
  return (
    <span
      {...spanProps}
      className={["stackhatch-wordmark__hatch", className].filter(Boolean).join(" ")}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" focusable="false">
        <rect x="2.5" y="2.5" width="19" height="19" rx="2" />
        <path d="M6.5 10 12 7.2l5.5 2.8L12 12.8z" />
        <path d="M6.5 13.6 12 16.4l5.5-2.8" />
      </svg>
    </span>
  );
}

/** Mark and name without a link, for places that already sit on the page they name. */
export function StackHatchLogo({ className }: { className?: string }) {
  return (
    <span className={["stackhatch-wordmark", className].filter(Boolean).join(" ")}>
      <StackHatchMark />
      <span className="stackhatch-wordmark__name">StackHatch</span>
    </span>
  );
}

export type StackHatchWordmarkProps = Omit<ComponentProps<typeof Link>, "children"> & {
  label: string;
};

/** Mark and name as a link. Colour is inherited, so it reads on the frame and on paper. */
export default function StackHatchWordmark({
  className,
  label,
  ...linkProps
}: StackHatchWordmarkProps) {
  return (
    <Link
      {...linkProps}
      aria-label={label}
      className={["stackhatch-wordmark", className].filter(Boolean).join(" ")}
    >
      <StackHatchMark />
      <span className="stackhatch-wordmark__name" aria-hidden="true">
        StackHatch
      </span>
    </Link>
  );
}
