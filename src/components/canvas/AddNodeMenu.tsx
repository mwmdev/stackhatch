"use client";

import { useState, type CSSProperties, type Ref } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { NodeCategory, NodeSubtype } from "@/types/stack";
import { categoryOrder, nodeConfig, getSubtypesForCategory } from "@/lib/node-config";
import type { CustomSubtypesMap } from "@/lib/custom-subtypes";
import DynamicLucideIcon from "@/components/ui/DynamicLucideIcon";

export interface AddNodeMenuProps {
  onAddNode: (category: NodeCategory, subtype: NodeSubtype) => void;
  customSubtypes?: CustomSubtypesMap;
  /** Positioning classes added to the shared `menu` classes. */
  className?: string;
  style?: CSSProperties;
  menuRef?: Ref<HTMLDivElement>;
  "data-testid": string;
}

/** Categories, each opening onto its subtypes. The parent owns open state and placement. */
export default function AddNodeMenu({
  onAddNode,
  customSubtypes,
  className,
  style,
  menuRef,
  "data-testid": testId,
}: AddNodeMenuProps) {
  const [expandedCategory, setExpandedCategory] = useState<NodeCategory | null>(null);

  return (
    <div
      ref={menuRef}
      className={`menu max-h-[min(30rem,calc(100dvh-7rem))] w-60 overflow-y-auto ${className ?? ""}`}
      style={style}
      data-testid={testId}
    >
      <p className="menu__label">Add node</p>
      {categoryOrder.map((category) => {
        const config = nodeConfig[category];
        const isExpanded = expandedCategory === category;
        return (
          <div key={category}>
            <button
              type="button"
              onClick={() => setExpandedCategory(isExpanded ? null : category)}
              className="menu__item"
              aria-expanded={isExpanded}
              data-testid={`category-${category}`}
            >
              <span
                className="flex h-5 w-5 flex-none items-center justify-center rounded-tag [&>svg]:h-3 [&>svg]:w-3"
                style={{ backgroundColor: config.fill, color: config.foreground }}
                aria-hidden="true"
              >
                <DynamicLucideIcon name={config.icon} />
              </span>
              <span className="flex-1">{config.displayName}</span>
              {isExpanded ? (
                <ChevronDown aria-hidden="true" />
              ) : (
                <ChevronRight aria-hidden="true" />
              )}
            </button>
            {isExpanded && (
              <div className="mb-1 ml-[1.1875rem] border-l border-rule pl-1.5">
                {Object.entries(getSubtypesForCategory(category, customSubtypes)).map(
                  ([subtype, subtypeConfig]) => (
                    <button
                      type="button"
                      key={subtype}
                      onClick={() => onAddNode(category, subtype as NodeSubtype)}
                      className="menu__item"
                      data-testid={`subtype-${subtype}`}
                    >
                      <DynamicLucideIcon name={subtypeConfig.icon} aria-hidden="true" />
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
  );
}
