"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Handle, Position } from "reactflow";
import type { NodeProps } from "reactflow";
import * as icons from "lucide-react";
import type { CSSProperties } from "react";
import type { NodeCategory, NodeSubtype, NoteColor } from "@/types/stack";
import { getCategoryConfig, getNoteColorConfig, getSubtypeConfig } from "@/lib/node-config";
import type { CustomSubtypesMap } from "@/lib/custom-subtypes";
import { sanitizeHtml, containsHtml } from "@/lib/sanitize-html";
import { useEditorDisplaySettings } from "./EditorDisplaySettings";

function DynamicIcon({
  name,
  size,
  className,
  style,
}: {
  name: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const Icon = (icons as unknown as Record<string, typeof icons.Box>)[name] ?? icons.Box;
  return <Icon size={size} className={className} style={style} />;
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
  noteCount?: number;
  noteColor?: NoteColor;
  showDescription?: boolean;
  canUseNodeLocking?: boolean;
  onLockToggle?: (id: string, locked: boolean) => void;
  onDelete?: (id: string) => void;
  onClick?: (id: string) => void;
  onAddNote?: (id: string) => void;
  onNoteBadgeClick?: (id: string) => void;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
}

function StackNodeComponent({ id, data, selected }: NodeProps<StackNodeData>) {
  const { showNodeCategory } = useEditorDisplaySettings();
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
  });
  const menuRef = useRef<HTMLDivElement>(null);

  const catConfig = getCategoryConfig(data.category);
  const subtypeConfig = getSubtypeConfig(data.category, data.subtype, data.customSubtypes);
  const iconName = subtypeConfig?.icon ?? catConfig.icon;
  const isNoteNode = data.category === "note";
  const noteColor = getNoteColorConfig(data.noteColor);
  const description = data.description.trim();
  const noteText = description || data.technology.trim();
  const tooltipId = `node-description-tooltip-${id}`;
  const hasDescription = !isNoteNode && data.showDescription !== false && description.length > 0;
  const canUseNodeLocking = data.canUseNodeLocking !== false;

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ visible: true, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
  }, []);

  const handleClick = useCallback(() => {
    data.onClick?.(id);
  }, [data, id]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ visible: true, x: 16, y: 16 });
  }, []);

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
      className={`stack-node group relative ${
        isNoteNode
          ? "rounded-[3px] border font-note shadow-lg shadow-[var(--shadow-color)]"
          : "rounded-lg border-2 bg-[var(--card)] text-[var(--card-foreground)] shadow-md shadow-[var(--shadow-color)] hover:shadow-lg"
      } ${
        selected ? "ring-2 ring-[var(--ring)]" : ""
      } ${data.locked ? "border border-dashed border-[var(--muted-foreground)]" : ""}`}
      style={{
        borderColor: isNoteNode ? noteColor.border : catConfig.color,
        minWidth: isNoteNode ? "210px" : "200px",
        ...(isNoteNode
          ? {
              backgroundColor: noteColor.fill,
              color: noteColor.foreground,
              boxShadow: `0 14px 22px -18px var(--shadow-color), 0 2px 0 color-mix(in oklch, ${noteColor.border} 24%, transparent)`,
              transform: "rotate(-1deg)",
            }
          : {}),
      }}
      onContextMenu={handleContextMenu}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-describedby={hasDescription ? tooltipId : undefined}
      data-testid={`stack-node-${id}`}
    >
      {!isNoteNode && (
        <Handle
          type="target"
          position={Position.Top}
          className="!h-3 !w-3 !border-2 !border-white"
          style={{ backgroundColor: catConfig.color }}
        />
      )}

      {/* Lock indicator */}
      {data.locked && (
        <div className="absolute bottom-2 right-2" data-testid="lock-indicator">
          <icons.Lock
            size={14}
            className={
              isNoteNode ? "text-[var(--color-note-foreground)]" : "text-[var(--color-data)]"
            }
            style={isNoteNode ? { color: noteColor.foreground } : undefined}
          />
        </div>
      )}

      {/* Note count badge */}
      {(data.noteCount ?? 0) > 0 && (
        <button
          className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--brand)] px-1 text-[10px] font-bold text-[var(--brand-foreground)] shadow-sm hover:opacity-80"
          onClick={(e) => {
            e.stopPropagation();
            data.onNoteBadgeClick?.(id);
          }}
          title={`${data.noteCount} note${data.noteCount !== 1 ? "s" : ""}`}
          data-testid="note-badge"
        >
          {data.noteCount}
        </button>
      )}

      {/* Node content */}
      {isNoteNode ? (
        <div className="px-4 pb-4 pt-3">
          <div
            className="pointer-events-none absolute right-0 top-0 h-0 w-0 border-l-[18px] border-t-[18px] border-l-transparent"
            style={{
              borderTopColor: `color-mix(in oklch, ${noteColor.border}, ${noteColor.fill} 45%)`,
            }}
          />
          <div className="flex items-start gap-2 pr-4">
            <DynamicIcon
              name={iconName}
              size={17}
              className="mt-1 shrink-0 text-[var(--color-note-foreground)]"
              style={{ color: noteColor.foreground }}
            />
            <span className="text-[18px] font-bold leading-tight">{data.name}</span>
          </div>
          {noteText && (
            <div className="mt-2 whitespace-pre-wrap text-[15px] leading-6">
              {containsHtml(noteText) ? (
                <span
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(noteText) }}
                  className="[&_a]:text-[var(--link)] [&_a]:underline"
                />
              ) : (
                noteText
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="px-3 py-2.5">
          {/* Header: icon + name */}
          <div className="flex items-center gap-2">
            <div
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded"
              style={{ backgroundColor: catConfig.fill, color: catConfig.foreground }}
            >
              <DynamicIcon name={iconName} size={14} />
            </div>
            <span className="text-sm font-semibold leading-tight">{data.name}</span>
          </div>

          {/* Technology subtitle */}
          {data.technology && (
            <div className="mt-1 pl-8 text-xs text-[var(--muted-foreground)]">
              {containsHtml(data.technology) ? (
                <span
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.technology) }}
                  className="[&_a]:text-[var(--link)] [&_a]:underline"
                />
              ) : (
                data.technology
              )}
            </div>
          )}

          {/* Category badge */}
          {showNodeCategory && (
            <div className="mt-2">
              <span
                className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: catConfig.fill, color: catConfig.foreground }}
              >
                {catConfig.displayName}
              </span>
            </div>
          )}
        </div>
      )}

      {!isNoteNode && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!h-3 !w-3 !border-2 !border-white"
          style={{ backgroundColor: catConfig.color }}
        />
      )}

      {/* Description tooltip */}
      {hasDescription && (
        <div
          id={tooltipId}
          role="tooltip"
          className="nodrag nopan pointer-events-none absolute bottom-full left-1/2 z-50 mb-3 max-h-40 w-max max-w-80 -translate-x-1/2 overflow-auto rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs leading-5 text-[var(--card-foreground)] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus:opacity-100"
          onClick={(e) => e.stopPropagation()}
          data-testid="node-description-tooltip"
        >
          {containsHtml(description) ? (
            <div
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(description) }}
              className="[&_a]:text-[var(--link)] [&_a]:underline [&_code]:rounded [&_code]:bg-[var(--muted)] [&_code]:px-1"
            />
          ) : (
            description
          )}
        </div>
      )}

      {/* Context menu */}
      {contextMenu.visible && (
        <div
          ref={menuRef}
          className="absolute z-50 min-w-[140px] rounded-md border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          data-testid="node-context-menu"
        >
          {canUseNodeLocking && (
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--card-foreground)] hover:bg-[var(--muted)]"
              onClick={(e) => {
                e.stopPropagation();
                data.onLockToggle?.(id, !data.locked);
                setContextMenu((prev) => ({ ...prev, visible: false }));
              }}
              data-testid="context-menu-lock"
            >
              {data.locked ? <icons.Unlock size={14} /> : <icons.Lock size={14} />}
              {data.locked ? "Unlock" : "Lock"}
            </button>
          )}
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--card-foreground)] hover:bg-[var(--muted)]"
            onClick={(e) => {
              e.stopPropagation();
              data.onAddNote?.(id);
              setContextMenu((prev) => ({ ...prev, visible: false }));
            }}
            data-testid="context-menu-add-note"
          >
            <icons.NotebookPen size={14} />
            Add note
          </button>
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--danger)] hover:bg-[var(--danger-surface)]"
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
