import Link from "next/link";
import type { ReactNode } from "react";
import { CircleHelp, FolderPlus, Settings } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import IconControl from "@/components/ui/IconControl";
import StackHatchWordmark from "./StackHatchWordmark";

/** The app route a bar sits on: marks the active control and hides what that route already offers. */
export type AppRoute = "maps" | "new" | "settings";

export type DeviceControlsProps = {
  /** Marks Settings as the current page. */
  settingsActive?: boolean;
};

/**
 * Theme, help and settings: the controls every ink bar ends with. Settings
 * holds the AI provider key, so it has to be reachable before a provider action
 * fails, not only from the dialog that reports the failure.
 */
export function DeviceControls({ settingsActive = false }: DeviceControlsProps) {
  return (
    <div className="app-bar__controls" role="group" aria-label="Device controls">
      <ThemeToggle surface="frame" />
      <IconControl href="/support" label="Help" surface="frame" tooltipPlacement="bottom">
        <CircleHelp />
      </IconControl>
      <IconControl
        href="/settings"
        label="Device settings"
        tooltip="Settings"
        surface="frame"
        tooltipPlacement="bottom"
        active={settingsActive}
      >
        <Settings />
      </IconControl>
    </div>
  );
}

export type NewMapLinkProps = {
  /** Defaults to `/project/new`; the editor passes its own return-aware href. */
  href?: string;
  /** Filled ochre by default. The editor passes `false`: its one filled action lives in the canvas work, not the frame. */
  primary?: boolean;
};

/** Icon-only below 480 px, where the label cannot fit. */
export function NewMapLink({ href = "/project/new", primary = true }: NewMapLinkProps) {
  return (
    <Link href={href} className={primary ? "frame-btn frame-btn--primary" : "frame-btn"}>
      <FolderPlus aria-hidden="true" />
      <span className="max-[479px]:sr-only">New map</span>
    </Link>
  );
}

export type AppBarProps = {
  current?: AppRoute;
  /** Replaces the "All maps" breadcrumb, e.g. with a way back to an interrupted flow. Style links with `app-bar__crumb`. */
  crumb?: ReactNode;
};

/**
 * The 48 px ink bar every app route shares: logo, breadcrumb, `New map`, and
 * the device controls.
 */
export default function AppBar({ current, crumb }: AppBarProps) {
  return (
    <header className="app-bar ink-frame">
      <StackHatchWordmark href="/" label="StackHatch home" />
      <span className="ink-frame__divider" aria-hidden="true" />
      {crumb ??
        (current === "maps" ? (
          <span className="app-bar__crumb">All maps</span>
        ) : (
          <Link href="/app/maps" className="app-bar__crumb">
            All maps
          </Link>
        ))}
      <span className="app-bar__spacer" />
      {current === "new" ? null : (
        <>
          <NewMapLink />
          <span className="ink-frame__divider" aria-hidden="true" />
        </>
      )}
      <DeviceControls settingsActive={current === "settings"} />
    </header>
  );
}
