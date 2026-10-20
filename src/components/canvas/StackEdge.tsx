"use client";

import { memo, useState, useRef, useEffect, useCallback } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useStore } from "reactflow";
import type { EdgeProps, ReactFlowState } from "reactflow";
import { getEdgeAnchors, type NodeRect } from "@/lib/edge-anchors";
import type { ConnectionSides, ConnectionType } from "@/types/stack";
import { useEditorDisplaySettings } from "./EditorDisplaySettings";
import { CANVAS_TEXT_LIMITS } from "@/lib/canvas-limits";

export interface StackEdgeData {
  connectionType: ConnectionType;
  label: string;
  sides?: ConnectionSides;
  connectionTypesEnabled?: boolean;
  onLabelChange?: (edgeId: string, label: string) => void;
}

export interface EdgeStyleConfig {
  color: string;
  strokeDasharray: string;
  strokeWidth: number;
  displayName: string;
}

export const edgeStyles: Record<ConnectionType, EdgeStyleConfig> = {
  http: {
    color: "var(--edge-http)",
    strokeDasharray: "0",
    strokeWidth: 2,
    displayName: "HTTP",
  },
  websocket: {
    color: "var(--edge-websocket)",
    strokeDasharray: "8 4",
    strokeWidth: 2,
    displayName: "WebSocket",
  },
  grpc: {
    color: "var(--edge-grpc)",
    strokeDasharray: "0",
    strokeWidth: 3,
    displayName: "gRPC",
  },
  tcp: {
    color: "var(--edge-tcp)",
    strokeDasharray: "4 4",
    strokeWidth: 2,
    displayName: "TCP",
  },
  "pub-sub": {
    color: "var(--edge-pub-sub)",
    strokeDasharray: "12 4 4 4",
    strokeWidth: 2,
    displayName: "Pub/Sub",
  },
  "file-io": {
    // Must differ from `tcp` in pattern, not only in colour: these edges are
    // read in greyscale PNG exports and by users who cannot separate the hues.
    color: "var(--edge-file-io)",
    strokeDasharray: "2 3",
    strokeWidth: 2,
    displayName: "File I/O",
  },
};

function EdgeLabel({
  edgeId,
  label,
  labelX,
  labelY,
  onLabelChange,
  visible,
  onHoverChange,
  onEditingChange,
}: {
  edgeId: string;
  label: string;
  labelX: number;
  labelY: number;
  onLabelChange?: (edgeId: string, label: string) => void;
  visible: boolean;
  onHoverChange: (hovered: boolean) => void;
  onEditingChange: (editing: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(label);
  }, [label]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const canEdit = Boolean(onLabelChange);

  function commit() {
    const trimmed = value.trim();
    if (trimmed && trimmed !== label) {
      onLabelChange!(edgeId, trimmed);
    } else {
      setValue(label);
    }
    setEditing(false);
    onEditingChange(false);
  }

  return (
    <div
      className={`stack-edge-label ${visible ? "" : "opacity-0"} ${
        canEdit && visible ? "pointer-events-auto cursor-pointer" : "pointer-events-none"
      }`}
      style={{
        transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
      }}
      data-testid={`edge-label-${edgeId}`}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (canEdit) {
          setEditing(true);
          onEditingChange(true);
        }
      }}
    >
      {editing ? (
        <input
          ref={inputRef}
          maxLength={CANVAS_TEXT_LIMITS.edgeLabel}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setValue(label);
              setEditing(false);
              onEditingChange(false);
            }
          }}
          className="w-24 border-none bg-transparent text-center"
          autoFocus
        />
      ) : (
        label
      )}
    </div>
  );
}

function useNodeRect(nodeId: string): NodeRect | null {
  const selector = useCallback(
    (state: ReactFlowState) => {
      const node = state.nodeInternals.get(nodeId);
      if (!node?.width || !node.height) return null;
      const position = node.positionAbsolute ?? node.position;
      return { x: position.x, y: position.y, width: node.width, height: node.height };
    },
    [nodeId]
  );
  return useStore(
    selector,
    (a, b) =>
      a === b ||
      (!!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height)
  );
}

function StackEdgeComponent({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<StackEdgeData>) {
  const sourceRect = useNodeRect(source);
  const targetRect = useNodeRect(target);
  const [edgeHovered, setEdgeHovered] = useState(false);
  const [labelHovered, setLabelHovered] = useState(false);
  const [labelEditing, setLabelEditing] = useState(false);
  const { showEdgeLabels } = useEditorDisplaySettings();
  const connectionType = data?.connectionType ?? "http";
  const connectionTypesEnabled = data?.connectionTypesEnabled ?? true;
  const style = connectionTypesEnabled
    ? edgeStyles[connectionType]
    : {
        color: "var(--ink2)",
        strokeDasharray: "0",
        strokeWidth: 2,
        displayName: "Connection",
      };

  const anchors =
    sourceRect && targetRect && !data?.sides
      ? getEdgeAnchors(sourceRect, targetRect)
      : { sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition };
  if (data?.sides && sourceRect && targetRect) {
    // React Flow anchors at the outside of the 20 px handle hit area.
    // Meet the card itself, preserving the chosen handle's other coordinate.
    if (data.sides.source === "right") anchors.sourceX = sourceRect.x + sourceRect.width;
    else anchors.sourceY = sourceRect.y + sourceRect.height;
    if (data.sides.target === "left") anchors.targetX = targetRect.x;
    else anchors.targetY = targetRect.y;
  }
  const [edgePath, labelX, labelY] = getBezierPath(anchors);
  const markerId = `stack-edge-arrow-${id.replace(/[^\w-]/g, "_")}`;

  // Hover and selection thicken the line by 1 px; selection adds a halo in the
  // edge's own colour underneath.
  const strokeWidth = style.strokeWidth + (selected || edgeHovered ? 1 : 0);
  const labelVisible = showEdgeLabels || edgeHovered || labelHovered || labelEditing;

  return (
    <>
      <g
        className="stack-edge"
        onMouseEnter={() => setEdgeHovered(true)}
        onMouseLeave={() => setEdgeHovered(false)}
      >
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth={selected ? 13 : 11}
            markerHeight={selected ? 13 : 11}
            markerUnits="userSpaceOnUse"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" style={{ fill: style.color, stroke: "none" }} />
          </marker>
        </defs>
        <path
          d={edgePath}
          fill="none"
          className="stack-edge__focus"
          aria-hidden="true"
          style={{ stroke: "var(--ring)", strokeWidth: strokeWidth + 6 }}
        />
        {selected && (
          <path
            d={edgePath}
            fill="none"
            className="stack-edge__halo"
            style={{
              stroke: `color-mix(in srgb, ${style.color} 30%, transparent)`,
              strokeWidth: strokeWidth + 8,
            }}
          />
        )}
        <BaseEdge
          id={id}
          path={edgePath}
          style={{
            stroke: style.color,
            strokeWidth,
            strokeDasharray: style.strokeDasharray,
          }}
          markerEnd={`url(#${markerId})`}
        />
      </g>
      {connectionTypesEnabled && showEdgeLabels && data?.label && (
        <EdgeLabelRenderer>
          <EdgeLabel
            edgeId={id}
            label={data.label}
            labelX={labelX}
            labelY={labelY}
            onLabelChange={data.onLabelChange}
            visible={labelVisible}
            onHoverChange={setLabelHovered}
            onEditingChange={setLabelEditing}
          />
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default memo(StackEdgeComponent);
