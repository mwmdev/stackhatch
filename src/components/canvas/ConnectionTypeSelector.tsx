"use client";

import { useRef, useEffect } from "react";
import type { ConnectionType } from "@/types/stack";

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
  ignoreOutsideClickWithin?: string;
}

export default function ConnectionTypeSelector({
  position,
  selectedType,
  onSelect,
  onCancel,
  ignoreOutsideClickWithin,
}: ConnectionTypeSelectorProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target)) {
        return;
      }
      if (
        ignoreOutsideClickWithin &&
        target instanceof Element &&
        target.closest(ignoreOutsideClickWithin)
      ) {
        return;
      }
      if (ref.current) {
        onCancel();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [ignoreOutsideClickWithin, onCancel]);

  return (
    <div
      ref={ref}
      className="fixed z-50 w-48 rounded-lg border border-[var(--border)] bg-[var(--background)] shadow-lg"
      style={{ left: position.x, top: position.y }}
      data-testid="connection-type-selector"
    >
      <div className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)] border-b border-[var(--border)]">
        Connection Type
      </div>
      {connectionTypes.map(({ value, label, desc }) => (
        <button
          key={value}
          onClick={() => onSelect(value)}
          className={`flex w-full flex-col px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--muted)] ${
            selectedType === value ? "bg-[var(--muted)]" : ""
          }`}
          aria-current={selectedType === value ? "true" : undefined}
          data-testid={`connection-type-${value}`}
        >
          <span className="font-medium text-[var(--foreground)]">{label}</span>
          <span className="text-xs text-[var(--muted-foreground)]">{desc}</span>
        </button>
      ))}
    </div>
  );
}
