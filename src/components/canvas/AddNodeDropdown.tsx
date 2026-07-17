"use client";

import { useState, useRef, useEffect } from "react";
import * as icons from "lucide-react";
import type { NodeCategory, NodeSubtype } from "@/types/stack";
import { categoryOrder, nodeConfig, getSubtypesForCategory } from "@/lib/node-config";
import type { CustomSubtypesMap } from "@/lib/custom-subtypes";
import IconControl from "@/components/ui/IconControl";

function DynamicIcon({
  name,
  size,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const Icon = (icons as unknown as Record<string, typeof icons.Box>)[name] ?? icons.Box;
  return <Icon size={size} className={className} />;
}

export interface AddNodeDropdownProps {
  onAddNode: (category: NodeCategory, subtype: NodeSubtype) => void;
  customSubtypes?: CustomSubtypesMap;
  iconOnly?: boolean;
  placement?: "bottom" | "responsive";
}

export default function AddNodeDropdown({
  onAddNode,
  customSubtypes,
  iconOnly = false,
  placement = "bottom",
}: AddNodeDropdownProps) {
  const [open, setOpen] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<NodeCategory | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setExpandedCategory(null);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  function handleSubtypeClick(category: NodeCategory, subtype: NodeSubtype) {
    onAddNode(category, subtype);
    setOpen(false);
    setExpandedCategory(null);
  }

  return (
    <div ref={dropdownRef} className="relative">
      {iconOnly ? (
        <IconControl
          label="Add node"
          tooltipPlacement="top"
          variant="outline"
          pressed={open}
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          data-testid="add-node-button"
        >
          <icons.Plus />
        </IconControl>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex min-h-11 items-center gap-1.5 rounded border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
          aria-label="Add node"
          aria-expanded={open}
          data-testid="add-node-button"
        >
          <icons.Plus size={16} aria-hidden="true" />
          Add Node
        </button>
      )}

      {open && (
        <div
          className={`absolute z-30 max-h-[min(28rem,calc(100dvh-2rem))] w-[min(16rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--background)] shadow-lg ${
            placement === "responsive"
              ? "bottom-full left-0 mb-2 md:bottom-auto md:left-full md:top-0 md:ml-2"
              : "left-0 top-full mt-1"
          }`}
          data-placement={placement}
          data-testid="add-node-dropdown"
        >
          {categoryOrder.map((category) => {
            const config = nodeConfig[category];
            const isExpanded = expandedCategory === category;
            return (
              <div key={category}>
                <button
                  onClick={() => setExpandedCategory(isExpanded ? null : category)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--muted)] transition-colors"
                  data-testid={`category-${category}`}
                >
                  <div
                    className="flex h-6 w-6 items-center justify-center rounded"
                    style={{ backgroundColor: config.color, color: "white" }}
                  >
                    <DynamicIcon name={config.icon} size={14} />
                  </div>
                  <span className="flex-1 text-left font-medium text-[var(--foreground)]">
                    {config.displayName}
                  </span>
                  {isExpanded ? (
                    <icons.ChevronDown size={14} className="text-[var(--muted-foreground)]" />
                  ) : (
                    <icons.ChevronRight size={14} className="text-[var(--muted-foreground)]" />
                  )}
                </button>
                {isExpanded && (
                  <div className="border-t border-[var(--border)] bg-[var(--muted)]">
                    {Object.entries(getSubtypesForCategory(category, customSubtypes)).map(
                      ([subtype, subtypeConfig]) => (
                        <button
                          key={subtype}
                          onClick={() => handleSubtypeClick(category, subtype as NodeSubtype)}
                          className="flex w-full items-center gap-2 px-3 py-1.5 pl-11 text-sm text-[var(--foreground)] hover:bg-[var(--border)] transition-colors"
                          data-testid={`subtype-${subtype}`}
                        >
                          <DynamicIcon
                            name={subtypeConfig.icon}
                            size={14}
                            className="text-[var(--muted-foreground)]"
                          />
                          <span>{subtypeConfig.displayName}</span>
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
