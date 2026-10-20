"use client";

import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Handle, Position } from "reactflow";
import type { NodeProps } from "reactflow";
import { Lock, Trash2, Unlock } from "lucide-react";
import type { NodeCategory, NodeSubtype, NoteColor } from "@/types/stack";
import { getCategoryConfig, getNoteColorConfig, resolveSubtypeConfig } from "@/lib/node-config";
import type { CustomSubtypesMap } from "@/lib/custom-subtypes";
import { sanitizeHtml, containsHtml } from "@/lib/sanitize-html";
import DynamicLucideIcon from "@/components/ui/DynamicLucideIcon";
import { useEditorDisplaySettings } from "./EditorDisplaySettings";

export interface StackNodeData {
  category: NodeCategory;
  subtype: NodeSubtype;
  name: string;
  technology: string;
  description: string;
  reasoning: string;
  locked: boolean;
  customSubtypes?: CustomSubtypesMap;
  noteColor?: NoteColor;
  showDescription?: boolean;
  canUseNodeLocking?: boolean;
  onLockToggle?: (id: string, locked: boolean) => void;
  onDelete?: (id: string) => void;
  onClick?: (id: string) => void;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
}

function RichText({ text }: { text: string }) {
  return containsHtml(text) ? (
    <span
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(text) }}
      className="[&_a]:text-link [&_a]:underline"
    />
  ) : (
    <>{text}</>
  );
}

function StackNodeComponent({ id, data, selected }: NodeProps<StackNodeData>) {
  const { showNodeCategory, showDescriptionOnHover } = useEditorDisplaySettings();
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const nodeRef = useRef<HTMLDivElement>(null);
  const [prevSelected, setPrevSelected] = useState(selected);

  // The menu belongs to the selection: deselecting the node dismisses it.
  // Adjusted during render (not in an effect) so the stale menu never paints.
  if (prevSelected !== selected) {
    setPrevSelected(selected);
    if (!selected && contextMenu.visible) {
      setContextMenu((prev) => ({ ...prev, visible: false }));
    }
  }

  const catConfig = getCategoryConfig(data.category);
  const subtypeConfig = resolveSubtypeConfig(data.category, data.subtype, data.customSubtypes);
  const isNoteNode = data.category === "note";
  const noteColor = getNoteColorConfig(data.noteColor);
  const description = data.description.trim();
  const noteText = description || data.technology.trim();
  const tooltipId = `node-description-tooltip-${id}`;
  const hasDescription =
    showDescriptionOnHover &&
    !isNoteNode &&
    data.showDescription !== false &&
    description.length > 0;
  const canUseNodeLocking = data.canUseNodeLocking !== false;

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDelete(false);
    setContextMenu({ visible: true, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
  }, []);

  const handleClick = useCallback(() => {
    data.onClick?.(id);
  }, [data, id]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      event.stopPropagation();
      setConfirmDelete(false);
      setContextMenu({ visible: true, x: 16, y: 16 });
      return;
    }
    // The node is focusable, so it has to be operable too. Dispatching a real
    // click rather than calling the handler directly keeps the keyboard on
    // the same path as the pointer: selection is owned by React Flow's
    // onNodeClick on the wrapper, which a synthetic click reaches by
    // bubbling. Space is prevented so it activates instead of scrolling.
    if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      event.currentTarget.click();
    }
  }, []);

  // Dismiss on any pointer press outside the menu. Capture phase, because
  // React Flow's pane stops pointer events before they bubble to document.
  useEffect(() => {
    if (!contextMenu.visible) return;
    function handleOutsidePointer(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu((prev) => ({ ...prev, visible: false }));
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setContextMenu((prev) => ({ ...prev, visible: false }));
      nodeRef.current?.focus();
    }
    document.addEventListener("pointerdown", handleOutsidePointer, true);
    document.addEventListener("keydown", handleEscape, true);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointer, true);
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [contextMenu.visible]);

  return (
    <div
      ref={nodeRef}
      className="stack-node"
      data-kind={isNoteNode ? "note" : "component"}
      data-selected={selected || undefined}
      data-locked={data.locked || undefined}
      style={
        isNoteNode
          ? ({
              backgroundColor: noteColor.fill,
              "--node-border": noteColor.border,
              color: noteColor.foreground,
            } as CSSProperties)
          : undefined
      }
      onContextMenu={handleContextMenu}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`${data.name}. ${catConfig.displayName}${
        data.technology ? `, ${data.technology}` : ""
      }${data.locked ? ". Locked" : ""}. Open details.`}
      aria-describedby={hasDescription ? tooltipId : undefined}
      data-testid={`stack-node-${id}`}
      data-subtype-status={subtypeConfig.deprecated ? "deprecated" : "active"}
    >
      {!isNoteNode && showNodeCategory && (
        // Label tape on the top edge: tone fill, icon and word, so the
        // category never rests on colour alone.
        <span
          className="stack-node__tag type-tag"
          style={{ backgroundColor: catConfig.fill, color: catConfig.foreground }}
          aria-hidden="true"
        >
          <DynamicLucideIcon name={catConfig.icon} />
          {catConfig.displayName}
        </span>
      )}

      {!isNoteNode && (
        <>
          <Handle type="target" position={Position.Top} className="stack-node-handle" />
          <Handle type="target" position={Position.Left} id="left" className="stack-node-handle" />
        </>
      )}

      {data.locked && (
        <span className="stack-node__lock" data-testid="lock-indicator" aria-hidden="true">
          <Lock />
        </span>
      )}

      {isNoteNode ? (
        <>
          <span className="stack-node__name type-node-name">
            <DynamicLucideIcon name={subtypeConfig.icon} aria-hidden="true" />
            {data.name}
          </span>
          {noteText && (
            <span className="stack-node__note type-small">
              <RichText text={noteText} />
            </span>
          )}
        </>
      ) : (
        <>
          <span className="stack-node__name type-node-name">{data.name}</span>
          {data.technology && (
            <span className="stack-node__technology">
              <RichText text={data.technology} />
            </span>
          )}
        </>
      )}

      {!isNoteNode && (
        <>
          <Handle type="source" position={Position.Bottom} className="stack-node-handle" />
          <Handle
            type="source"
            position={Position.Right}
            id="right"
            className="stack-node-handle"
          />
        </>
      )}

      {hasDescription && (
        <div
          id={tooltipId}
          role="tooltip"
          className="stack-node__description nodrag nopan pointer-events-none"
          onClick={(e) => e.stopPropagation()}
          data-testid="node-description-tooltip"
        >
          <RichText text={description} />
        </div>
      )}

      {contextMenu.visible && (
        <div
          ref={menuRef}
          className="menu nodrag nopan absolute z-50 w-44"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          data-testid="node-context-menu"
        >
          {canUseNodeLocking && (
            <>
              <button
                type="button"
                className="menu__item"
                onClick={(e) => {
                  e.stopPropagation();
                  data.onLockToggle?.(id, !data.locked);
                  setContextMenu((prev) => ({ ...prev, visible: false }));
                }}
                data-testid="context-menu-lock"
              >
                {data.locked ? <Unlock aria-hidden="true" /> : <Lock aria-hidden="true" />}
                {data.locked ? "Unlock" : "Lock"}
              </button>
              <hr className="menu__rule" />
            </>
          )}
          {/* Two presses: this removes the node and every connection attached
              to it, and there is no undo. Matches the detail panel's pattern. */}
          <button
            type="button"
            className="menu__item menu__item--danger"
            onClick={(e) => {
              e.stopPropagation();
              if (!confirmDelete) {
                setConfirmDelete(true);
                return;
              }
              data.onDelete?.(id);
              setContextMenu((prev) => ({ ...prev, visible: false }));
            }}
            data-testid="context-menu-delete"
          >
            <Trash2 aria-hidden="true" />
            {confirmDelete ? "Confirm delete" : "Delete"}
          </button>
          {confirmDelete && (
            <p className="type-small px-2.5 pb-1.5 text-ink2">Also removes its connections.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(StackNodeComponent);
