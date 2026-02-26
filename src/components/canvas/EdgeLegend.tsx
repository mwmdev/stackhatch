"use client";

import { memo, useState } from "react";
import { edgeStyles } from "./StackEdge";
import type { ConnectionType } from "@/types/stack";

const connectionTypes: ConnectionType[] = [
  "http",
  "websocket",
  "grpc",
  "tcp",
  "pub-sub",
  "file-io",
];

function EdgeLegendComponent() {
  const [visible, setVisible] = useState(false);

  return (
    <div className="absolute bottom-4 left-4 z-10" data-testid="edge-legend">
      <button
        onClick={() => setVisible((v) => !v)}
        className="rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs text-[var(--muted-foreground)] shadow-sm hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        data-testid="edge-legend-toggle"
      >
        {visible ? "Hide Legend" : "Edge Legend"}
      </button>
      {visible && (
        <div
          className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 shadow-md"
          data-testid="edge-legend-panel"
        >
          <div className="mb-2 text-xs font-semibold text-[var(--card-foreground)]">
            Connection Types
          </div>
          <div className="flex flex-col gap-2">
            {connectionTypes.map((type) => {
              const style = edgeStyles[type];
              return (
                <div key={type} className="flex items-center gap-2">
                  <svg
                    width="40"
                    height="12"
                    className="flex-shrink-0"
                    data-testid={`legend-line-${type}`}
                  >
                    <line
                      x1="0"
                      y1="6"
                      x2="40"
                      y2="6"
                      stroke={style.color}
                      strokeWidth={style.strokeWidth}
                      strokeDasharray={
                        style.strokeDasharray === "0"
                          ? undefined
                          : style.strokeDasharray
                      }
                    />
                  </svg>
                  <span className="text-[11px] text-[var(--card-foreground)]">
                    {style.displayName}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(EdgeLegendComponent);
