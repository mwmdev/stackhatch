import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

export const THEME_ICONS = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const satisfies Record<string, LucideIcon>;

export type ThemePreference = keyof typeof THEME_ICONS;

export const THEME_OPTIONS = Object.entries(THEME_ICONS) as [ThemePreference, LucideIcon][];

export function isThemePreference(theme: string | undefined): theme is ThemePreference {
  return theme !== undefined && Object.prototype.hasOwnProperty.call(THEME_ICONS, theme);
}
