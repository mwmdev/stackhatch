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
  fixedPositions?: Map<string, { x: number; y: number }>,
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

  // Extract positions
  const positions: NodePosition[] = nodes.map((node) => {
    // Use fixed position if provided (for locked nodes)
    if (fixedPositions?.has(node.id)) {
      return { id: node.id, position: fixedPositions.get(node.id)! };
    }

    const dagNode = g.node(node.id);
    return {
      id: node.id,
      position: {
        // Dagre returns center coordinates; offset to top-left
        x: dagNode.x - NODE_WIDTH / 2,
        y: dagNode.y - NODE_HEIGHT / 2,
      },
    };
  });

  return positions;
}
