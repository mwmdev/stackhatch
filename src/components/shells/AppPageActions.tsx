"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { FolderPlus, Map as MapIcon, Settings, Users } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import UserAvatar from "@/components/UserAvatar";
import IconControl from "@/components/ui/IconControl";

export type AppPageActionsProps = {
  currentPage?: "settings" | "admin";
  isAdmin?: boolean;
};

export default function AppPageActions({ currentPage, isAdmin: knownAdmin }: AppPageActionsProps) {
  const [loadedIsAdmin, setLoadedIsAdmin] = useState(false);
  const isAdmin = knownAdmin ?? loadedIsAdmin;

  const handleRoleLoaded = useCallback(
    (role?: string) => {
      if (knownAdmin === undefined) setLoadedIsAdmin(role === "admin");
    },
    [knownAdmin]
  );

  return (
    <>
      {currentPage ? (
        <Link
          href="/app/maps"
          aria-label="All Maps"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-sm border border-transparent px-2 text-sm font-semibold text-[var(--muted-foreground)] hover:border-[var(--border)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] sm:px-3"
        >
          <MapIcon className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">All Maps</span>
        </Link>
      ) : (
        <Link
          href="/project/new"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-sm bg-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)]"
        >
          <FolderPlus className="h-4 w-4" aria-hidden="true" />
          New map
        </Link>
      )}
      <div className="flex items-center gap-1" role="group" aria-label="Account controls">
        <ThemeToggle />
        {isAdmin && (
          <IconControl
            href="/admin"
            label="Admin"
            tooltipPlacement="bottom"
            active={currentPage === "admin"}
          >
            <Users />
          </IconControl>
        )}
        <IconControl
          href="/settings"
          label="Settings"
          tooltipPlacement="bottom"
          active={currentPage === "settings"}
        >
          <Settings />
        </IconControl>
        <UserAvatar onRoleLoaded={handleRoleLoaded} />
      </div>
    </>
  );
}
