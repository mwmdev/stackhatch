import Link from "next/link";
import type { ComponentProps } from "react";

export type StackHatchWordmarkProps = Omit<ComponentProps<typeof Link>, "children"> & {
  label: string;
};

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
      <span className="stackhatch-wordmark__hatch" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="m4 7.5 8-4.5 8 4.5-8 4.5z" />
          <path d="m4 11.5 8 4.5 8-4.5" />
          <path d="m4 15.5 8 4.5 8-4.5" />
        </svg>
      </span>
      <span className="stackhatch-wordmark__name" aria-hidden="true">
        <span>Stack</span>
        <span className="stackhatch-wordmark__accent">Hatch</span>
      </span>
    </Link>
  );
}
