"use client";

import { SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import IconControl from "@/components/ui/IconControl";
import type { EditorDisplaySettings } from "./EditorDisplaySettings";

interface EditorDisplaySettingsDropdownProps {
  value: EditorDisplaySettings;
  onChange: (next: EditorDisplaySettings) => void;
}

const SETTINGS: { key: keyof EditorDisplaySettings; label: string }[] = [
  { key: "showNodeCategory", label: "Node category" },
  { key: "showEdgeLabels", label: "Edge labels" },
  { key: "showDescriptionOnHover", label: "Show description on hover" },
];

/** The rail's last tool: what the map shows. */
export default function EditorDisplaySettingsDropdown({
  value,
  onChange,
}: EditorDisplaySettingsDropdownProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
    // Capture phase: React Flow's pane, node and edge handlers stop mousedown from bubbling.
    document.addEventListener("mousedown", handleClickOutside, true);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function updateSetting(key: keyof EditorDisplaySettings, checked: boolean) {
    onChange({ ...value, [key]: checked });
  }

  return (
    <div ref={dropdownRef} className="editor-tool-surface__anchor">
      <IconControl
        controlRef={triggerRef}
        label="Editor display settings"
        tooltip="Display settings"
        surface="frame"
        tooltipPlacement="right"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        data-testid="editor-display-settings-button"
      >
        <SlidersHorizontal />
      </IconControl>

      {open && (
        <div
          className="menu editor-tool-surface__menu w-64"
          data-testid="editor-display-settings-dropdown"
        >
          <p className="menu__label">Show on the map</p>
          {SETTINGS.map(({ key, label }) => (
            <label key={key} className="menu__item justify-between">
              <span>{label}</span>
              <input
                type="checkbox"
                className="h-4 w-4 flex-none accent-ink"
                checked={value[key]}
                onChange={(e) => updateSetting(key, e.target.checked)}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
