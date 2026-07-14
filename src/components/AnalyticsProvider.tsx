"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { trackPageView } from "@/lib/analytics";

const scriptUrl = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL;
const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

export default function AnalyticsProvider() {
  const pathname = usePathname();
  const lastTrackedPath = useRef<string | null>(null);
  const enabled = Boolean(scriptUrl && websiteId);

  const trackCurrentPage = useCallback(() => {
    if (!enabled || !pathname || lastTrackedPath.current === pathname) return;
    if (trackPageView(pathname)) lastTrackedPath.current = pathname;
  }, [enabled, pathname]);

  useEffect(() => {
    trackCurrentPage();
  }, [trackCurrentPage]);

  if (!enabled) return null;

  return (
    <Script
      src={scriptUrl}
      data-website-id={websiteId}
      data-auto-track="false"
      strategy="afterInteractive"
      onReady={trackCurrentPage}
    />
  );
}
