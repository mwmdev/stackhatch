"use client";

import { memo, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
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

/** The phone layout starts with the swatches folded away above the tool dock. */
const COMPACT_QUERY = "(max-width: 640px)";

function initiallyExpanded() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return !window.matchMedia(COMPACT_QUERY).matches;
}

/**
 * The legend strip docked under the canvas: part of the ink frame, so the
 * connection key is always readable without floating over the map. The
 * toggle folds the swatches; the React Flow credit stays at the right.
 */
function EdgeLegendComponent() {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const listId = `edge-legend-${useId()}`;

  return (
    <div className="edge-legend ink-frame" data-testid="edge-legend" data-expanded={expanded}>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-controls={listId}
        className="edge-legend__toggle"
        data-testid="edge-legend-toggle"
      >
        Legend
        <ChevronDown aria-hidden="true" />
      </button>
      {expanded && (
        <ul
          id={listId}
          aria-label="Connection types"
          className="edge-legend__list"
          data-testid="edge-legend-panel"
        >
          {connectionTypes.map((type) => {
            const style = edgeStyles[type];
            return (
              <li key={type} className="edge-legend__item">
                <span className="edge-legend__well" aria-hidden="true">
                  <svg width="24" height="6" data-testid={`legend-line-${type}`}>
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
                {style.displayName}
              </li>
            );
          })}
        </ul>
      )}
      <a
        className="edge-legend__credit"
        href="https://reactflow.dev"
        target="_blank"
        rel="noreferrer"
      >
        React Flow
      </a>
    </div>
  );
}

export default memo(EdgeLegendComponent);
