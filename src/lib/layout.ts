import dagre from "dagre";
import type { StackNode, StackEdge, NodeCategory } from "@/types/stack";

export interface NodePosition {
  id: string;
  position: { x: number; y: number };
}

/** Maps each category to a Dagre rank (lower = higher on screen) */
const categoryRank: Record<NodeCategory, number> = {
  client: 0,
  api: 1,
  services: 2,
  data: 3,
  infrastructure: 4,
  external: 5,
  note: 6,
};

const NODE_WIDTH = 200;
const NODE_HEIGHT = 100;
const NODE_SEP = 80;
const RANK_SEP = 100;
const EDGE_SEP = 20;

/**
 * Applies Dagre auto-layout to position nodes in a top-to-bottom directed graph
 * grouped by category layer.
 *
 * @param nodes - Stack nodes (no position data)
 * @param edges - Stack edges connecting nodes
 * @param fixedPositions - Optional map of node ID to fixed position (for locked nodes)
 * @returns Array of node positions (id + x,y)
 */
export function applyDagreLayout(
  nodes: StackNode[],
  edges: StackEdge[],
  fixedPositions?: Map<string, { x: number; y: number }>
): NodePosition[] {
  if (nodes.length === 0) return [];

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "TB",
    nodesep: NODE_SEP,
    ranksep: RANK_SEP,
    edgesep: EDGE_SEP,
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Add nodes with dimensions and rank hints
  for (const node of nodes) {
    g.setNode(node.id, {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      rank: categoryRank[node.category],
    });
  }

  // Add edges
  for (const edge of edges) {
    // Only add edges where both endpoints exist
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(g);

  // Dagre returns center coordinates; offset to top-left
  const laidOut = new Map(
    nodes.map((node) => {
      const dagNode = g.node(node.id);
      return [node.id, { x: dagNode.x - NODE_WIDTH / 2, y: dagNode.y - NODE_HEIGHT / 2 }];
    })
  );

  // Dagre lays out from its own origin. Shift the free layout by the locked
  // nodes' average displacement so unlocked nodes land beside them instead of
  // at the top-left of the canvas.
  let offsetX = 0;
  let offsetY = 0;
  let anchors = 0;
  for (const [id, fixed] of fixedPositions ?? []) {
    const position = laidOut.get(id);
    if (!position) continue;
    offsetX += fixed.x - position.x;
    offsetY += fixed.y - position.y;
    anchors += 1;
  }
  if (anchors > 0) {
    offsetX /= anchors;
    offsetY /= anchors;
  }

  return nodes.map((node) => {
    const fixed = fixedPositions?.get(node.id);
    if (fixed) return { id: node.id, position: fixed };
    const position = laidOut.get(node.id)!;
    return { id: node.id, position: { x: position.x + offsetX, y: position.y + offsetY } };
  });
}
