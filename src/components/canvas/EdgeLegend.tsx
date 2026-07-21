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
    <div className="edge-legend" data-testid="edge-legend">
      <button
        onClick={() => setVisible((v) => !v)}
        className="font-utility min-h-11 rounded-[var(--radius-control)] border border-[var(--boundary)] bg-[var(--paper)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)] shadow-sm hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        data-testid="edge-legend-toggle"
      >
        {visible ? "Hide Legend" : "Edge Legend"}
      </button>
      {visible && (
        <div
          className="edge-legend__panel mt-2 rounded-[var(--radius-surface)] border border-[var(--boundary)] bg-[var(--paper)] p-3 shadow-md"
          data-testid="edge-legend-panel"
        >
          <div className="font-utility mb-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--card-foreground)]">
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
                        style.strokeDasharray === "0" ? undefined : style.strokeDasharray
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
