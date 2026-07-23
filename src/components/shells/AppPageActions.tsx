"use client";

import Link from "next/link";
import { FolderPlus } from "lucide-react";
import AccountMenu from "@/components/AccountMenu";
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
      <div className="flex items-center gap-1" role="group" aria-label="Account controls">
        <ThemeToggle />
        <AccountMenu settingsActive={settingsActive} />
      </div>
    </>
  );
}
