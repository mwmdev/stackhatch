"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { consumeAuthenticationStarted, trackEvent } from "@/lib/analytics";
import { appDestinationForBrowserUrl } from "@/lib/app-route";
import { getPendingProjectStart } from "@/lib/project-start";

export default function AppResolver({ destination }: { destination: string }) {
  const router = useRouter();
  const resolved = useRef(false);

  useEffect(() => {
    if (resolved.current) return;
    resolved.current = true;

    if (consumeAuthenticationStarted()) {
      const startMethod = getPendingProjectStart();
      trackEvent("github_auth_completed", {
        location: "editor",
        ...(startMethod ? { start_method: startMethod } : {}),
      });
    }

    const browserUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    router.replace(appDestinationForBrowserUrl(browserUrl, destination));
  }, [destination, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-6 text-[var(--muted-foreground)]">
      <p role="status" aria-live="polite">
        Opening your map...
      </p>
    </main>
  );
}
