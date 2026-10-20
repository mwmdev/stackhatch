"use client";

import { useState, useRef, useEffect } from "react";
import { Plus } from "lucide-react";
import type { NodeCategory, NodeSubtype } from "@/types/stack";
import type { CustomSubtypesMap } from "@/lib/custom-subtypes";
import IconControl from "@/components/ui/IconControl";
import AddNodeMenu from "./AddNodeMenu";

export interface AddNodeDropdownProps {
  onAddNode: (category: NodeCategory, subtype: NodeSubtype) => void;
  customSubtypes?: CustomSubtypesMap;
  disabled?: boolean;
}

/** The rail's Add node tool: categories, each opening onto its subtypes. */
export default function AddNodeDropdown({
  onAddNode,
  customSubtypes,
  disabled = false,
}: AddNodeDropdownProps) {
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

  function handleSubtypeClick(category: NodeCategory, subtype: NodeSubtype) {
    onAddNode(category, subtype);
    setOpen(false);
  }

  return (
    <div ref={dropdownRef} className="editor-tool-surface__anchor">
      <IconControl
        controlRef={triggerRef}
        label="Add node"
        surface="frame"
        tooltipPlacement="right"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        data-testid="add-node-button"
        disabled={disabled}
      >
        <Plus />
      </IconControl>

      {open && (
        <AddNodeMenu
          className="editor-tool-surface__menu"
          data-testid="add-node-dropdown"
          onAddNode={handleSubtypeClick}
          customSubtypes={customSubtypes}
        />
      )}
    </div>
  );
}
