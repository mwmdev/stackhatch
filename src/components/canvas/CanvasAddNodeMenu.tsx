"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { NodeCategory, NodeSubtype } from "@/types/stack";
import type { CustomSubtypesMap } from "@/lib/custom-subtypes";
import AddNodeMenu from "./AddNodeMenu";

export interface CanvasAddNodeMenuProps {
  /** Viewport (client) coordinates where the menu opens. */
  position: { x: number; y: number };
  customSubtypes?: CustomSubtypesMap;
  onAddNode: (category: NodeCategory, subtype: NodeSubtype) => void;
  /** `restoreFocus` is true for Escape, false for a press outside. */
  onCancel: (restoreFocus: boolean) => void;
}

/** The Add node menu opened at a canvas point, by an edge drop or a right-click. */
export default function CanvasAddNodeMenu({
  position,
  customSubtypes,
  onAddNode,
  onCancel,
}: CanvasAddNodeMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const bounds = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(position.x, window.innerWidth - bounds.width - 8));
    const top = Math.max(8, Math.min(position.y, window.innerHeight - bounds.height - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.maxHeight = `${window.innerHeight - top - 8}px`;
    menu.querySelector("button")?.focus();
  }, [position.x, position.y]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onCancel(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCancel(true);
    }
    // Capture phase: React Flow's pane, node and edge handlers stop mousedown from bubbling.
    document.addEventListener("mousedown", handlePointerDown, true);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onCancel]);

  return (
    <AddNodeMenu
      menuRef={ref}
      className="fixed z-50"
      style={{ left: position.x, top: position.y }}
      data-testid="canvas-add-node-menu"
      onAddNode={onAddNode}
      customSubtypes={customSubtypes}
    />
  );
}
