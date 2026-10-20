import { getCategoryConfig, getNoteColorConfig } from "@/lib/node-config";
import type { VaultCanvasState } from "@/lib/vault/schema";

// Rendered sizes of the canvas nodes, so the thumbnail keeps the map's proportions.
const NODE_WIDTH = 192;
const NODE_HEIGHT = 70;
const NOTE_HEIGHT = 70;
const PADDING = 48;
const GRID_COLUMNS = 4;

interface PlacedNode {
  id: string;
  x: number;
  y: number;
  height: number;
  stroke: string;
  fill: string;
  /** The category tone for the label-tape tab; notes carry none. */
  tab: string | null;
}

function placeNodes(canvasState: VaultCanvasState): PlacedNode[] {
  return canvasState.nodes.map((node, index) => {
    // Maps created before positions were stored fall back to a simple grid.
    const position = canvasState.positions?.[node.id] ?? {
      x: (index % GRID_COLUMNS) * (NODE_WIDTH + 80),
      y: Math.floor(index / GRID_COLUMNS) * (NODE_HEIGHT + 100),
    };
    const isNote = node.category === "note";
    const note = isNote ? getNoteColorConfig(node.noteColor) : null;
    return {
      id: node.id,
      x: position.x,
      y: position.y,
      height: isNote ? NOTE_HEIGHT : NODE_HEIGHT,
      stroke: note ? note.border : "var(--rule-strong)",
      fill: note ? note.fill : "var(--paper)",
      tab: isNote ? null : getCategoryConfig(node.category).color,
    };
  });
}

/** Side-to-side between overlapping rows, top-to-bottom otherwise, like the editor. */
function edgePath(source: PlacedNode, target: PlacedNode) {
  const sameRow = target.y < source.y + source.height && source.y < target.y + target.height;
  if (sameRow) {
    const leftToRight = source.x <= target.x;
    const sx = leftToRight ? source.x + NODE_WIDTH : source.x;
    const tx = leftToRight ? target.x : target.x + NODE_WIDTH;
    const sy = source.y + source.height / 2;
    const ty = target.y + target.height / 2;
    const bend = Math.max(30, Math.abs(tx - sx) / 2) * (leftToRight ? 1 : -1);
    return `M ${sx} ${sy} C ${sx + bend} ${sy}, ${tx - bend} ${ty}, ${tx} ${ty}`;
  }
  const downward = source.y <= target.y;
  const sx = source.x + NODE_WIDTH / 2;
  const tx = target.x + NODE_WIDTH / 2;
  const sy = downward ? source.y + source.height : source.y;
  const ty = downward ? target.y : target.y + target.height;
  const bend = Math.max(40, Math.abs(ty - sy) / 2) * (downward ? 1 : -1);
  return `M ${sx} ${sy} C ${sx} ${sy + bend}, ${tx} ${ty - bend}, ${tx} ${ty}`;
}

/** A static, decorative preview of a stored map. */
export default function MapThumbnail({ canvasState }: { canvasState: VaultCanvasState | null }) {
  const nodes = canvasState ? placeNodes(canvasState) : [];
  if (nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-ink2">Empty map</div>
    );
  }

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const minX = Math.min(...nodes.map((node) => node.x)) - PADDING;
  const minY = Math.min(...nodes.map((node) => node.y)) - PADDING;
  const maxX = Math.max(...nodes.map((node) => node.x + NODE_WIDTH)) + PADDING;
  const maxY = Math.max(...nodes.map((node) => node.y + node.height)) + PADDING;

  return (
    <svg
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      aria-hidden="true"
      focusable="false"
    >
      {canvasState!.edges.map((edge) => {
        const source = byId.get(edge.source);
        const target = byId.get(edge.target);
        if (!source || !target) return null;
        return (
          <path
            key={edge.id}
            d={edgePath(source, target)}
            fill="none"
            stroke="var(--rule-strong)"
            strokeWidth={1.2}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {nodes.map((node) => (
        <g key={node.id}>
          <rect
            x={node.x}
            y={node.y}
            width={NODE_WIDTH}
            height={node.height}
            fill={node.fill}
            stroke={node.stroke}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          {node.tab ? (
            <rect x={node.x + 10} y={node.y - 8} width={70} height={16} fill={node.tab} />
          ) : null}
        </g>
      ))}
    </svg>
  );
}
