import { applyNodeChanges, type Node, type NodeChange } from "reactflow";

export const NODE_COLLISION_GAP = 20;

const FALLBACK_NODE_WIDTH = 280;
const FALLBACK_NODE_HEIGHT = 100;

interface Position {
  x: number;
  y: number;
}

interface NodeRect extends Position {
  height: number;
  width: number;
}

function numericDimension(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.endsWith("px")) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

function nodeRect<NodeData>(node: Node<NodeData>, position = node.position): NodeRect {
  return {
    x: position.x,
    y: position.y,
    width: numericDimension(node.width ?? node.style?.width, FALLBACK_NODE_WIDTH),
    height: numericDimension(node.height ?? node.style?.height, FALLBACK_NODE_HEIGHT),
  };
}

function rectsOverlap(first: NodeRect, second: NodeRect, gap: number) {
  return (
    first.x < second.x + second.width + gap &&
    first.x + first.width + gap > second.x &&
    first.y < second.y + second.height + gap &&
    first.y + first.height + gap > second.y
  );
}

export function nodesOverlap<NodeData>(
  first: Node<NodeData>,
  second: Node<NodeData>,
  gap = NODE_COLLISION_GAP
) {
  return rectsOverlap(nodeRect(first), nodeRect(second), gap);
}

function squaredDistance(first: Position, second: Position) {
  const x = first.x - second.x;
  const y = first.y - second.y;
  return x * x + y * y;
}

export function findNearestOpenPosition<NodeData>(
  node: Node<NodeData>,
  otherNodes: Node<NodeData>[],
  desiredPosition: Position,
  gap = NODE_COLLISION_GAP
): Position {
  const desiredRect = nodeRect(node, desiredPosition);
  if (otherNodes.every((other) => !rectsOverlap(desiredRect, nodeRect(other), gap))) {
    return desiredPosition;
  }

  const candidates = otherNodes.flatMap((other) => {
    const otherRect = nodeRect(other);
    return [
      { x: otherRect.x + otherRect.width + gap, y: desiredPosition.y },
      { x: otherRect.x - desiredRect.width - gap, y: desiredPosition.y },
      { x: desiredPosition.x, y: otherRect.y + otherRect.height + gap },
      { x: desiredPosition.x, y: otherRect.y - desiredRect.height - gap },
    ];
  });

  candidates.sort((first, second) => {
    const distance =
      squaredDistance(first, desiredPosition) - squaredDistance(second, desiredPosition);
    if (distance !== 0) return distance;
    if (first.y !== second.y) return first.y - second.y;
    return first.x - second.x;
  });

  return (
    candidates.find((candidate) => {
      const candidateRect = nodeRect(node, candidate);
      return otherNodes.every((other) => !rectsOverlap(candidateRect, nodeRect(other), gap));
    }) ?? desiredPosition
  );
}

export function resolveNodeOverlaps<NodeData>(
  nodes: Node<NodeData>[],
  gap = NODE_COLLISION_GAP
): Node<NodeData>[] {
  const resolved: Node<NodeData>[] = [];

  for (const node of nodes) {
    const position = findNearestOpenPosition(node, resolved, node.position, gap);
    const positionedNode =
      position.x === node.position.x && position.y === node.position.y
        ? node
        : { ...node, position };
    resolved.push(positionedNode);
  }

  return resolved;
}

export function applyNonOverlappingNodeChanges<NodeData>(
  changes: NodeChange[],
  nodes: Node<NodeData>[],
  gap = NODE_COLLISION_GAP
): Node<NodeData>[] {
  const proposedNodes = applyNodeChanges(changes, nodes);
  const movedIds = new Set<string>();
  const dimensionsChanged = changes.some(
    (change) => change.type === "dimensions" && change.dimensions
  );
  for (const change of changes) {
    if (change.type === "position" && change.position) movedIds.add(change.id);
  }
  const rejectedIds = new Set<string>();
  const proposedNodesById = new Map(proposedNodes.map((node) => [node.id, node]));

  for (const movedId of movedIds) {
    const movedNode = proposedNodesById.get(movedId);
    if (!movedNode) continue;
    for (const otherNode of proposedNodes) {
      if (movedNode.id === otherNode.id) continue;
      if (nodesOverlap(movedNode, otherNode, gap)) {
        rejectedIds.add(movedId);
        break;
      }
    }
  }

  if (rejectedIds.size > 0) {
    for (const movedId of movedIds) rejectedIds.add(movedId);
  }

  if (rejectedIds.size === 0) {
    return dimensionsChanged ? resolveNodeOverlaps(proposedNodes, gap) : proposedNodes;
  }

  const currentNodesById = new Map(nodes.map((node) => [node.id, node]));
  const safeChanges: NodeChange[] = [];
  for (const change of changes) {
    if (change.type !== "position" || !rejectedIds.has(change.id)) {
      safeChanges.push(change);
      continue;
    }

    const current = currentNodesById.get(change.id);
    if (!current) {
      safeChanges.push(change);
      continue;
    }

    if (change.dragging !== undefined && change.dragging !== current.dragging) {
      safeChanges.push({
        id: change.id,
        type: "position",
        dragging: change.dragging,
      });
    }
  }

  if (safeChanges.length === 0) return nodes;

  const updatedNodes = applyNodeChanges(safeChanges, nodes);
  return dimensionsChanged ? resolveNodeOverlaps(updatedNodes, gap) : updatedNodes;
}
