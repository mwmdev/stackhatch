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
          <path d="M3 6h7v5h5v7h6" />
          <circle cx="3" cy="6" r="1.5" />
          <circle cx="10" cy="11" r="1.5" />
          <circle cx="15" cy="18" r="1.5" />
          <circle cx="21" cy="18" r="1.5" />
        </svg>
      </span>
      <span className="stackhatch-wordmark__name" aria-hidden="true">
        <span>Stack</span>
        <span className="stackhatch-wordmark__accent">Hatch</span>
      </span>
    </Link>
  );
}
