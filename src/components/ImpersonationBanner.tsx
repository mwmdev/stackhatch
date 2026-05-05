"use client";

import { useEffect, useRef, useState } from "react";
import { getRoleLabel } from "@/lib/roles";

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
  const bannerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!me?.impersonatedBy) {
      document.documentElement.style.setProperty("--impersonation-banner-height", "0px");
      return;
    }

    const banner = bannerRef.current;
    if (!banner) return;

    const updateBannerHeight = () => {
      document.documentElement.style.setProperty(
        "--impersonation-banner-height",
        `${banner.offsetHeight}px`
      );
    };

    updateBannerHeight();

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateBannerHeight);
    resizeObserver?.observe(banner);
    window.addEventListener("resize", updateBannerHeight);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateBannerHeight);
      document.documentElement.style.setProperty("--impersonation-banner-height", "0px");
    };
  }, [me?.impersonatedBy]);

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
    <div
      ref={bannerRef}
      className="sticky top-0 z-[60] flex flex-wrap items-center justify-between gap-3 border-b border-[var(--warning-border)] bg-[var(--warning-surface)] px-4 py-2 text-sm text-[var(--foreground)]"
    >
      <span>
        Impersonating <strong>{displayName}</strong> as {getRoleLabel(me.role)}.
      </span>
      <button
        type="button"
        onClick={stopImpersonating}
        disabled={stopping}
        className="min-h-9 rounded-md border border-[var(--warning-border)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-60"
      >
        {stopping ? "Stopping..." : "Stop impersonating"}
      </button>
    </div>
  );
}
