"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { consumeAuthenticationStarted, trackEvent } from "@/lib/analytics";
import { appDestinationForBrowserUrl } from "@/lib/app-route";
import { getPendingProjectStart } from "@/lib/project-start";
import StackIllustration from "@/components/shells/StackIllustration";

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
    <main className="app-resolver-shell">
      <StackIllustration variant="resolver" />
      <div className="app-resolver-shell__status">
        <span className="app-resolver-shell__signal" aria-hidden="true" />
        <p role="status" aria-live="polite">
          Opening your map...
        </p>
      </div>
    </main>
  );
}
