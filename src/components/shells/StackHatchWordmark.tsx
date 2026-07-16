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
        <span />
        <span />
        <span />
      </span>
      <span aria-hidden="true">StackHatch</span>
    </Link>
  );
}
