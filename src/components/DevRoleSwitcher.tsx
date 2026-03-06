"use client";

import { useState, useSyncExternalStore } from "react";

const ROLES = ["admin", "paid-user", "free-user"] as const;

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function getDevRole() {
  return getCookie("dev-role") || "admin";
}

function subscribeToDevRole(_cb: () => void) {
  return () => {};
}

export default function DevRoleSwitcher() {
  const initialRole = useSyncExternalStore(subscribeToDevRole, getDevRole, () => "admin");
  const [role, setRole] = useState(initialRole);

  function handleChange(newRole: string) {
    document.cookie = `dev-role=${newRole};path=/;max-age=31536000`;
    setRole(newRole);
    window.location.reload();
  }

  return (
    <div className="fixed bottom-3 right-3 z-[9999] flex items-center gap-2 rounded-lg border border-orange-400/50 bg-orange-50 px-3 py-1.5 text-xs shadow-lg dark:bg-orange-950/80">
      <span className="font-medium text-orange-700 dark:text-orange-300">DEV</span>
      <select
        value={role}
        onChange={(e) => handleChange(e.target.value)}
        className="rounded border border-orange-300 bg-white px-1.5 py-0.5 text-xs text-orange-900 focus:outline-none dark:border-orange-700 dark:bg-orange-900 dark:text-orange-100"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
    </div>
  );
}
