"use client";

import Link from "next/link";
import { FolderPlus, Settings } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

export type AppPageActionsProps = {
  settingsActive?: boolean;
};

export default function AppPageActions({ settingsActive = false }: AppPageActionsProps) {
  return (
    <>
      <Link
        href="/project/new"
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-sm bg-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)]"
      >
        <FolderPlus className="h-4 w-4" aria-hidden="true" />
        New Map
      </Link>
      <div className="flex items-center gap-1" role="group" aria-label="Device controls">
        <ThemeToggle />
        <Link
          href="/settings"
          aria-label="Device settings"
          aria-current={settingsActive ? "page" : undefined}
          className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <Settings className="h-5 w-5" aria-hidden="true" />
        </Link>
      </div>
    </>
  );
}
