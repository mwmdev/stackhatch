"use client";

import { useRef, useEffect } from "react";
import { Check, Trash2 } from "lucide-react";
import type { ConnectionType } from "@/types/stack";
import { edgeStyles } from "./StackEdge";

const connectionTypes: { value: ConnectionType; label: string; desc: string }[] = [
  { value: "http", label: "HTTP", desc: "REST API calls" },
  { value: "websocket", label: "WebSocket", desc: "Real-time bidirectional" },
  { value: "grpc", label: "gRPC", desc: "RPC calls" },
  { value: "tcp", label: "TCP", desc: "Raw TCP connection" },
  { value: "pub-sub", label: "Pub/Sub", desc: "Event messaging" },
  { value: "file-io", label: "File I/O", desc: "File read/write" },
];

export interface ConnectionTypeSelectorProps {
  position: { x: number; y: number };
  selectedType?: ConnectionType;
  onSelect: (type: ConnectionType) => void;
  onCancel: () => void;
  /** Offered when editing an existing connection, not while drawing a new one. */
  onDelete?: () => void;
}

export default function ConnectionTypeSelector({
  position,
  selectedType,
  onSelect,
  onCancel,
  onDelete,
}: ConnectionTypeSelectorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    const bounds = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(position.x, window.innerWidth - bounds.width - 8))}px`;
    panel.style.top = `${Math.max(8, Math.min(position.y, window.innerHeight - bounds.height - 8))}px`;
    optionRefs.current[selectedType ?? "http"]?.focus();
  }, [position.x, position.y, selectedType]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target)) {
        return;
      }
      if (ref.current) {
        onCancel();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onCancel]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Connection type"
      className="menu fixed z-50 w-60"
      style={{ left: position.x, top: position.y }}
      data-testid="connection-type-selector"
    >
      <p className="menu__label">Connection type</p>
      {connectionTypes.map(({ value, label, desc }) => {
        const style = edgeStyles[value];
        return (
          <button
            type="button"
            ref={(element) => {
              optionRefs.current[value] = element;
            }}
            key={value}
            onClick={() => onSelect(value)}
            className="menu__item min-h-11"
            data-highlighted={selectedType === value || undefined}
            aria-pressed={selectedType === value}
            data-testid={`connection-type-${value}`}
          >
            <span
              className="flex h-3.5 w-[2.125rem] flex-none items-center justify-center rounded-tag bg-canvas"
              aria-hidden="true"
            >
              <svg width="24" height="6">
                <line
                  x1="0"
                  y1="3"
                  x2="24"
                  y2="3"
                  stroke={style.color}
                  strokeWidth={style.strokeWidth}
                  strokeDasharray={
                    style.strokeDasharray === "0" ? undefined : style.strokeDasharray
                  }
                />
              </svg>
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span>{label}</span>
              <span className="type-small text-ink2">{desc}</span>
            </span>
            {selectedType === value ? <Check aria-hidden="true" /> : null}
          </button>
        );
      })}
      {onDelete ? (
        // Without this a mis-drawn connection is permanent: the Delete key is
        // disabled on the canvas and nothing else removes an edge.
        <>
          <hr className="menu__rule" />
          <button
            type="button"
            onClick={onDelete}
            className="menu__item menu__item--danger"
            data-testid="connection-remove"
          >
            <Trash2 aria-hidden="true" />
            Remove connection
          </button>
        </>
      ) : null}
    </div>
  );
}
