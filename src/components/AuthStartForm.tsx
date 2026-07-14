"use client";

import { markAuthenticationStarted, trackEvent } from "@/lib/analytics";

export default function AuthStartForm({
  action,
  children,
}: {
  action: () => Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <form
      action={action}
      onSubmit={() => {
        markAuthenticationStarted();
        trackEvent("github_auth_started", { location: "login" });
      }}
    >
      {children}
    </form>
  );
}
