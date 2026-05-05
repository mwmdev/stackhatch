"use client";

import { memo, useState, useRef, useEffect } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, MarkerType } from "reactflow";
import type { EdgeProps } from "reactflow";
import type { ConnectionType } from "@/types/stack";

export interface StackEdgeData {
  connectionType: ConnectionType;
  label: string;
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
    color: "var(--edge-file-io)",
    strokeDasharray: "4 4",
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
}: {
  edgeId: string;
  label: string;
  labelX: number;
  labelY: number;
  onLabelChange?: (edgeId: string, label: string) => void;
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
  }

  return (
    <div
      className={`stack-edge-label absolute rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[10px] font-medium text-[var(--card-foreground)] ${canEdit ? "pointer-events-auto cursor-pointer hover:border-[var(--color-client)]" : "pointer-events-none"}`}
      style={{
        transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
      }}
      data-testid={`edge-label-${edgeId}`}
      onDoubleClick={() => {
        if (canEdit) setEditing(true);
      }}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setValue(label);
              setEditing(false);
            }
          }}
          className="w-24 border-none bg-transparent text-center text-[10px] font-medium text-[var(--card-foreground)] outline-none"
          autoFocus
        />
      ) : (
        label
      )}
    </div>
  );
}

function StackEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<StackEdgeData>) {
  const connectionType = data?.connectionType ?? "http";
  const style = edgeStyles[connectionType];

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const strokeWidth = selected ? 3 : style.strokeWidth;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: style.color,
          strokeWidth,
          strokeDasharray: style.strokeDasharray,
        }}
        markerEnd={MarkerType.ArrowClosed}
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <EdgeLabel
            edgeId={id}
            label={data.label}
            labelX={labelX}
            labelY={labelY}
            onLabelChange={data.onLabelChange}
          />
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default memo(StackEdgeComponent);
