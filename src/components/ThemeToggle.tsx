"use client";

import { useTheme } from "next-themes";
import { useState } from "react";
import IconControl from "@/components/ui/IconControl";

interface ThemeToggleProps {
  variant?: "icon" | "row";
}

function themeLabel(theme: string) {
  return theme.slice(0, 1).toUpperCase() + theme.slice(1);
}

export default function ThemeToggle({ variant = "icon" }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const currentTheme = theme ?? "system";
  const [announcement, setAnnouncement] = useState("");

  function cycle() {
    const nextTheme =
      currentTheme === "light" ? "dark" : currentTheme === "dark" ? "system" : "light";
    setTheme(nextTheme);
    if (variant === "row") setAnnouncement(`Theme changed to ${themeLabel(nextTheme)}`);
  }

  if (variant === "row") {
    return (
      <button
        type="button"
        onClick={cycle}
        aria-label={`Theme: ${themeLabel(currentTheme)}. Change appearance`}
        className="flex min-h-11 w-full items-center justify-between gap-4 rounded-[var(--radius-control)] px-3 py-2 text-left text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <span>Theme</span>
        <span className="text-xs font-medium text-[var(--muted-foreground)]">
          {themeLabel(currentTheme)}
        </span>
        <span className="sr-only" role="status" aria-live="polite">
          {announcement}
        </span>
      </button>
    );
  }

  return (
    <IconControl onClick={cycle} label="Theme: change appearance" tooltipPlacement="bottom">
      <svg
        className="theme-toggle__icon theme-toggle__system"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
      <svg
        className="theme-toggle__icon theme-toggle__dark"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
      <svg
        className="theme-toggle__icon theme-toggle__light"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    </IconControl>
  );
}
