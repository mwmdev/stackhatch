"use client";

import { useEffect, useState } from "react";

interface CurrentUser {
  name?: string | null;
  email?: string | null;
  role?: string;
}

export type UserAvatarProps = {
  onRoleLoaded?: (role?: string) => void;
};

function getInitial(user: CurrentUser | null) {
  const value = user?.name || user?.email || user?.role || "User";
  return value.slice(0, 1).toUpperCase();
}

export default function UserAvatar({ onRoleLoaded }: UserAvatarProps) {
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) {
          setUser(data);
          onRoleLoaded?.(data?.role);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          onRoleLoaded?.();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [onRoleLoaded]);

  const label = user?.name || user?.email || "User";

  return (
    <div
      className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--brand)] text-sm font-medium text-[var(--brand-foreground)]"
      title={label}
      aria-label={label}
    >
      {getInitial(user)}
    </div>
  );
}
