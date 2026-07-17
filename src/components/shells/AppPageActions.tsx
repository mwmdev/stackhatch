"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { FolderPlus, Settings, Users } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import UserAvatar from "@/components/UserAvatar";
import IconControl from "@/components/ui/IconControl";

export type AppPageActionsProps = {
  currentPage?: "settings";
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
      <Link
        href="/project/new"
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)]"
      >
        <FolderPlus className="h-4 w-4" aria-hidden="true" />
        New map
      </Link>
      <div className="flex items-center gap-1" role="group" aria-label="Account controls">
        <ThemeToggle />
        {isAdmin && (
          <IconControl href="/admin" label="Admin" tooltipPlacement="bottom">
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
