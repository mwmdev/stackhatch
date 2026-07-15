"use client";

import { markAuthenticationStarted, trackEvent } from "@/lib/analytics";
import type { ProjectStartMethod } from "@/lib/project-start";

export default function AuthStartForm({
  action,
  startMethod,
  children,
}: {
  action: () => Promise<void>;
  startMethod?: ProjectStartMethod;
  children: React.ReactNode;
}) {
  return (
    <form
      action={action}
      onSubmit={() => {
        markAuthenticationStarted(startMethod);
        trackEvent("github_auth_started", {
          location: "login",
          ...(startMethod ? { start_method: startMethod } : {}),
        });
      }}
    >
      {children}
    </form>
  );
}
