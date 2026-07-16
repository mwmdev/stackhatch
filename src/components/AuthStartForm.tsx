"use client";

import { useRef } from "react";
import { markAuthenticationStarted, trackEvent } from "@/lib/analytics";
import { callbackUrlWithLegacyFragment, type ProjectStartMethod } from "@/lib/project-start";

export default function AuthStartForm({
  action,
  callbackUrl,
  startMethod,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  callbackUrl?: string;
  startMethod?: ProjectStartMethod;
  children: React.ReactNode;
}) {
  const callbackInputRef = useRef<HTMLInputElement>(null);

  return (
    <form
      action={action}
      onSubmit={() => {
        if (callbackUrl && callbackInputRef.current) {
          callbackInputRef.current.value = callbackUrlWithLegacyFragment(
            callbackUrl,
            window.location.hash
          );
        }
        markAuthenticationStarted(startMethod);
        trackEvent("github_auth_started", {
          location: "login",
          ...(startMethod ? { start_method: startMethod } : {}),
        });
      }}
    >
      {callbackUrl && (
        <input ref={callbackInputRef} type="hidden" name="callbackUrl" defaultValue={callbackUrl} />
      )}
      {children}
    </form>
  );
}
