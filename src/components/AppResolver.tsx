"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { appDestinationForBrowserUrl, buildLocalProjectPath } from "@/lib/app-route";
import { getBrowserWorkspaceVault, type WorkspaceVault } from "@/lib/vault/workspace";

export default function AppResolver({ vault }: { vault?: WorkspaceVault }) {
  const router = useRouter();
  const [workspaceVault] = useState(() => vault ?? getBrowserWorkspaceVault());
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const resolutionRef = useRef<{
    attempt: number;
    promise: ReturnType<WorkspaceVault["resolveResume"]>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function resolveDestination() {
      setError("");
      try {
        if (!resolutionRef.current || resolutionRef.current.attempt !== attempt) {
          resolutionRef.current = {
            attempt,
            promise: workspaceVault.resolveResume(),
          };
        }
        const project = await resolutionRef.current.promise;
        if (cancelled) return;
        const destination = project ? buildLocalProjectPath(project.id) : "/project/new";
        const browserUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        router.replace(appDestinationForBrowserUrl(browserUrl, destination));
      } catch {
        if (!cancelled) {
          setError(
            "Your browser vault could not be opened. Check browser storage permissions, then retry."
          );
        }
      }
    }
    void resolveDestination();
    return () => {
      cancelled = true;
    };
  }, [attempt, router, workspaceVault]);

  return (
    <main className="app-resolver-shell">
      <div className="app-resolver-shell__status">
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              className="mt-4 min-h-11 rounded-[var(--radius-control)] bg-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand-foreground)]"
            >
              Retry browser storage
            </button>
          </>
        ) : (
          <>
            <span className="app-resolver-shell__signal" aria-hidden="true" />
            <p role="status" aria-live="polite">
              Opening your maps on this device...
            </p>
          </>
        )}
      </div>
    </main>
  );
}
