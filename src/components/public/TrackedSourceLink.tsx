"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { trackEvent, type AnalyticsLocation } from "@/lib/analytics";

interface TrackedSourceLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  location?: AnalyticsLocation;
  intent?: "source" | "star";
  children: ReactNode;
}

export default function TrackedSourceLink({
  href,
  location = "navigation",
  intent = "source",
  children,
  onClick,
  ...props
}: TrackedSourceLinkProps) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        trackEvent(intent === "star" ? "github_star_clicked" : "github_source_clicked", {
          location,
        });
        onClick?.(event);
      }}
    >
      {children}
    </a>
  );
}
