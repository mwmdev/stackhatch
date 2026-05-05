"use client";

import { Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { EditorDisplaySettings } from "./EditorDisplaySettings";

interface EditorDisplaySettingsDropdownProps {
  value: EditorDisplaySettings;
  onChange: (next: EditorDisplaySettings) => void;
}

export default function EditorDisplaySettingsDropdown({
  value,
  onChange,
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
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-11 w-11 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        title="Editor display settings"
        aria-label="Editor display settings"
        aria-expanded={open}
        data-testid="editor-display-settings-button"
      >
        <Settings className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-1 w-52 rounded-lg border border-[var(--border)] bg-[var(--background)] p-1 shadow-lg"
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
