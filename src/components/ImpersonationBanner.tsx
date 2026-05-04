"use client";

import { useEffect, useState } from "react";

interface MeResponse {
  name?: string | null;
  email?: string | null;
  role: string;
  impersonatedBy?: {
    name?: string | null;
    email?: string | null;
  };
}

export default function ImpersonationBanner() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setMe(data);
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!me?.impersonatedBy) return null;

  const displayName = me.name || me.email || "this user";

  async function stopImpersonating() {
    setStopping(true);
    try {
      await fetch("/api/admin/impersonation", { method: "DELETE" });
    } finally {
      window.location.href = "/admin";
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-amber-100 px-4 py-2 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
      <span>
        Impersonating <strong>{displayName}</strong> as {me.role.replace("-", " ")}.
      </span>
      <button
        type="button"
        onClick={stopImpersonating}
        disabled={stopping}
        className="min-h-9 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-950 hover:bg-amber-200 disabled:opacity-60 dark:border-amber-800 dark:bg-amber-900 dark:text-amber-50 dark:hover:bg-amber-800"
      >
        {stopping ? "Stopping..." : "Stop impersonating"}
      </button>
    </div>
  );
}
