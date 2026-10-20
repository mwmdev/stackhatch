"use client";

import { useTheme } from "next-themes";
import { useState } from "react";
import { isThemePreference, THEME_ICONS } from "@/components/theme-options";
import IconControl from "@/components/ui/IconControl";
import { useHydrated } from "@/lib/use-hydrated";

interface ThemeToggleProps {
  /** `icon` is an icon control; `row` is a menu row showing the current value. */
  variant?: "icon" | "row";
  /** Where the icon control sits: on the ink frame or on paper. */
  surface?: "paper" | "frame";
}

function themeLabel(theme: string) {
  return theme.slice(0, 1).toUpperCase() + theme.slice(1);
}

export default function ThemeToggle({ variant = "icon", surface = "paper" }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const currentTheme = isThemePreference(theme) ? theme : "system";
  const mounted = useHydrated();
  const [announcement, setAnnouncement] = useState("");
  const displayedTheme = mounted ? currentTheme : "system";
  const ThemeIcon = THEME_ICONS[displayedTheme];

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
        aria-label={`Theme: ${themeLabel(displayedTheme)}. Change appearance`}
        className="menu__item justify-between"
      >
        <span className="flex items-center gap-2.5">
          <ThemeIcon className="h-4 w-4 text-ink2" aria-hidden="true" />
          Theme
        </span>
        <span className="text-ink2">{themeLabel(displayedTheme)}</span>
        <span className="sr-only" role="status" aria-live="polite">
          {announcement}
        </span>
      </button>
    );
  }

  return (
    <IconControl
      onClick={cycle}
      label={`Theme: ${themeLabel(displayedTheme)}. Change appearance`}
      surface={surface}
      tooltipPlacement="bottom"
    >
      <ThemeIcon data-theme-icon={displayedTheme} />
    </IconControl>
  );
}
