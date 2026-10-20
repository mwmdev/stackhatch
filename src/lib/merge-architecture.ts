import type { StackArchitecture, StackNode, StackEdge } from "@/types/stack";
import type { NodePosition } from "@/lib/layout";

export interface MergeResult {
  architecture: StackArchitecture;
  fixedPositions: Map<string, { x: number; y: number }>;
}

/**
 * Merges an incoming AI-generated architecture with the current canvas state.
 * Locked nodes from the current state are preserved exactly (positions + properties).
 * Unlocked nodes come from the incoming architecture.
 * Edges: preserved if both endpoints are locked; otherwise uses AI's definition
 * while retaining chosen sides for the same edge ID and endpoints.
 */
export function mergeArchitecture(
  current: StackArchitecture,
  incoming: StackArchitecture,
  currentPositions: NodePosition[],
  options: { nodeLockingEnabled?: boolean } = {}
): MergeResult {
  const nodeLockingEnabled = options.nodeLockingEnabled ?? true;
  const lockedNodes = nodeLockingEnabled ? current.nodes.filter((n) => n.locked) : [];
  const lockedIds = new Set(lockedNodes.map((n) => n.id));

  // Build position map for locked nodes
  const fixedPositions = new Map<string, { x: number; y: number }>();
  for (const pos of currentPositions) {
    if (lockedIds.has(pos.id)) {
      fixedPositions.set(pos.id, { ...pos.position });
    }
  }

  // Merged nodes: locked nodes from current + unlocked nodes from incoming
  const incomingUnlocked = incoming.nodes.filter((n) => !lockedIds.has(n.id));
  const mergedNodes: StackNode[] = [...lockedNodes, ...incomingUnlocked];

  // Merged edges: if both endpoints are locked, preserve current edge;
  // otherwise use incoming edge definitions
  const mergedNodeIds = new Set(mergedNodes.map((n) => n.id));

  // Keep current edges where both endpoints are locked
  const preservedEdges = current.edges.filter(
    (e) => lockedIds.has(e.source) && lockedIds.has(e.target)
  );
  const preservedEdgeKeys = new Set(preservedEdges.map((e) => `${e.source}->${e.target}`));

  // Add incoming edges that connect valid nodes and aren't already preserved
  const incomingEdges = incoming.edges.filter((e) => {
    const key = `${e.source}->${e.target}`;
    return (
      mergedNodeIds.has(e.source) && mergedNodeIds.has(e.target) && !preservedEdgeKeys.has(key)
    );
  });

  const reservedEdgeIds = new Set([...preservedEdges, ...incomingEdges].map((edge) => edge.id));
  const seenEdgeIds = new Set(preservedEdges.map((edge) => edge.id));
  const currentEdges = new Map(current.edges.map((edge) => [edge.id, edge]));
  const mergedEdges: StackEdge[] = [...preservedEdges];
  for (const edge of incomingEdges) {
    let id = edge.id;
    if (seenEdgeIds.has(id)) {
      for (let suffix = 2; reservedEdgeIds.has(id); suffix++) {
        id = `${edge.id.slice(0, 128 - String(suffix).length - 1)}-${suffix}`;
      }
    }
    reservedEdgeIds.add(id);
    seenEdgeIds.add(id);
    const previous = currentEdges.get(edge.id);
    const sides =
      previous?.source === edge.source && previous.target === edge.target
        ? previous.sides
        : undefined;
    mergedEdges.push(sides ? { ...edge, id, sides } : id === edge.id ? edge : { ...edge, id });
  }

  return {
    architecture: { nodes: mergedNodes, edges: mergedEdges },
    fixedPositions,
  };
}
