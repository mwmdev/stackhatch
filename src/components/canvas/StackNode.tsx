"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Handle, Position } from "reactflow";
import type { NodeProps } from "reactflow";
import * as icons from "lucide-react";
import type { NodeCategory, NodeSubtype, StackNode as StackNodeType } from "@/types/stack";
import { getCategoryConfig, getSubtypeConfig } from "@/lib/node-config";
import type { CustomSubtypesMap } from "@/lib/custom-subtypes";
import { sanitizeHtml, containsHtml } from "@/lib/sanitize-html";

function DynamicIcon({
  name,
  size,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const Icon =
    (icons as unknown as Record<string, typeof icons.Box>)[name] ?? icons.Box;
  return <Icon size={size} className={className} />;
}

export interface StackNodeData {
  category: NodeCategory;
  subtype: NodeSubtype;
  name: string;
  technology: string;
  description: string;
  reasoning: string;
  locked: boolean;
  customSubtypes?: CustomSubtypesMap;
  onLockToggle?: (id: string, locked: boolean) => void;
  onDelete?: (id: string) => void;
  onClick?: (id: string) => void;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
}

function StackNodeComponent({ id, data, selected }: NodeProps<StackNodeData>) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
  });
  const menuRef = useRef<HTMLDivElement>(null);

  const catConfig = getCategoryConfig(data.category);
  const subtypeConfig = getSubtypeConfig(data.category, data.subtype, data.customSubtypes);
  const iconName = subtypeConfig?.icon ?? catConfig.icon;

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ visible: true, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
    },
    [],
  );

  const handleClick = useCallback(() => {
    data.onClick?.(id);
  }, [data, id]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu.visible) return;
    function handleOutsideClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu((prev) => ({ ...prev, visible: false }));
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [contextMenu.visible]);

  return (
    <div
      className={`stack-node relative rounded-xl border-l-4 bg-[var(--card)] text-[var(--card-foreground)] shadow-md hover:shadow-lg ${
        selected ? "ring-2 ring-blue-500" : ""
      } ${data.locked ? "border border-dashed border-[var(--muted-foreground)]" : ""}`}
      style={{
        borderLeftColor: catConfig.color,
        borderLeftWidth: "4px",
        borderLeftStyle: "solid",
        minWidth: "200px",
      }}
      onContextMenu={handleContextMenu}
      onClick={handleClick}
      data-testid={`stack-node-${id}`}
    >
      {/* Target handle (top) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-white"
        style={{ backgroundColor: catConfig.color }}
      />

      {/* Lock indicator */}
      {data.locked && (
        <div
          className="absolute right-2 top-2"
          data-testid="lock-indicator"
        >
          <icons.Lock size={14} className="text-[var(--color-data)]" />
        </div>
      )}

      {/* Node content */}
      <div className="px-3 py-2.5">
        {/* Header: icon + name */}
        <div className="flex items-center gap-2">
          <div
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded"
            style={{ backgroundColor: catConfig.color, color: "white" }}
          >
            <DynamicIcon name={iconName} size={14} />
          </div>
          <span className="text-sm font-semibold leading-tight">
            {data.name}
          </span>
        </div>

        {/* Technology subtitle */}
        {data.technology && (
          <div className="mt-1 pl-8 text-xs text-[var(--muted-foreground)]">
            {containsHtml(data.technology) ? (
              <span
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.technology) }}
                className="[&_a]:text-blue-500 [&_a]:underline"
              />
            ) : (
              data.technology
            )}
          </div>
        )}

        {/* Category badge */}
        <div className="mt-2">
          <span
            className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
            style={{ backgroundColor: catConfig.color }}
          >
            {catConfig.displayName}
          </span>
        </div>
      </div>

      {/* Source handle (bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-white"
        style={{ backgroundColor: catConfig.color }}
      />

      {/* Context menu */}
      {contextMenu.visible && (
        <div
          ref={menuRef}
          className="absolute z-50 min-w-[140px] rounded-md border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          data-testid="node-context-menu"
        >
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--card-foreground)] hover:bg-[var(--muted)]"
            onClick={(e) => {
              e.stopPropagation();
              data.onLockToggle?.(id, !data.locked);
              setContextMenu((prev) => ({ ...prev, visible: false }));
            }}
            data-testid="context-menu-lock"
          >
            {data.locked ? (
              <icons.Unlock size={14} />
            ) : (
              <icons.Lock size={14} />
            )}
            {data.locked ? "Unlock" : "Lock"}
          </button>
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-500 hover:bg-[var(--muted)]"
            onClick={(e) => {
              e.stopPropagation();
              data.onDelete?.(id);
              setContextMenu((prev) => ({ ...prev, visible: false }));
            }}
            data-testid="context-menu-delete"
          >
            <icons.Trash2 size={14} />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(StackNodeComponent);
