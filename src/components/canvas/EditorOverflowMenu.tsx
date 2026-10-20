"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CircleHelp, Ellipsis, FolderPlus, Settings } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import IconControl from "@/components/ui/IconControl";

interface EditorOverflowMenuProps {
  newMapHref: string;
}

/**
 * The phone bar keeps back, name, re-scan (repository maps) and export;
 * everything else the wide bar shows (new map, theme, help, settings) folds
 * into this menu.
 */
export default function EditorOverflowMenu({ newMapHref }: EditorOverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: globalThis.MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="project-editor__overflow">
      <IconControl
        controlRef={triggerRef}
        label="More map actions"
        tooltip="More"
        surface="frame"
        tooltipPlacement="left"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Ellipsis />
      </IconControl>
      {open && (
        <div className="menu project-editor__overflow-menu w-56" data-testid="editor-overflow-menu">
          <Link href={newMapHref} className="menu__item">
            <FolderPlus aria-hidden="true" />
            New map
          </Link>
          <hr className="menu__rule" />
          <ThemeToggle variant="row" />
          <Link href="/support" className="menu__item">
            <CircleHelp aria-hidden="true" />
            Help
          </Link>
          <Link href="/settings" className="menu__item">
            <Settings aria-hidden="true" />
            Settings
          </Link>
        </div>
      )}
    </div>
  );
}
