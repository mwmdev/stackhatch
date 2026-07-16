"use client";

import { Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import IconControl from "@/components/ui/IconControl";
import type { EditorDisplaySettings } from "./EditorDisplaySettings";

interface EditorDisplaySettingsDropdownProps {
  value: EditorDisplaySettings;
  onChange: (next: EditorDisplaySettings) => void;
  placement?: "bottom" | "responsive";
}

export default function EditorDisplaySettingsDropdown({
  value,
  onChange,
  placement = "bottom",
}: EditorDisplaySettingsDropdownProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function updateSetting(key: keyof EditorDisplaySettings, checked: boolean) {
    onChange({ ...value, [key]: checked });
  }

  return (
    <div ref={dropdownRef} className="relative">
      <IconControl
        label="Editor display settings"
        tooltipPlacement="top"
        variant="outline"
        pressed={open}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="h-11 w-11"
        data-testid="editor-display-settings-button"
      >
        <Settings className="h-[18px] w-[18px]" aria-hidden="true" />
      </IconControl>

      {open && (
        <div
          className={`absolute z-30 w-52 rounded-lg border border-[var(--border)] bg-[var(--background)] p-1 shadow-lg ${
            placement === "responsive"
              ? "bottom-full right-0 mb-2 md:bottom-auto md:left-full md:right-auto md:top-0 md:ml-2"
              : "right-0 top-full mt-1"
          }`}
          data-placement={placement}
          data-testid="editor-display-settings-dropdown"
        >
          <label className="flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]">
            <span>Node category</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--brand)]"
              checked={value.showNodeCategory}
              onChange={(e) => updateSetting("showNodeCategory", e.target.checked)}
            />
          </label>
          <label className="flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]">
            <span>Edge labels</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--brand)]"
              checked={value.showEdgeLabels}
              onChange={(e) => updateSetting("showEdgeLabels", e.target.checked)}
            />
          </label>
        </div>
      )}
    </div>
  );
}
