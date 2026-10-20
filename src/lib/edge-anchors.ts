import { Position } from "reactflow";

export interface NodeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EdgeAnchors {
  sourceX: number;
  sourceY: number;
  sourcePosition: Position;
  targetX: number;
  targetY: number;
  targetPosition: Position;
}

/**
 * Vertical clearance, in flow units, needed before an edge keeps the map's
 * top-to-bottom convention. Below it the nodes sit side by side and a
 * bottom-to-top curve would loop back over both of them.
 */
const MIN_VERTICAL_GAP = 32;

function anchor(rect: NodeRect, position: Position) {
  switch (position) {
    case Position.Top:
      return { x: rect.x + rect.width / 2, y: rect.y };
    case Position.Bottom:
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
    case Position.Left:
      return { x: rect.x, y: rect.y + rect.height / 2 };
    case Position.Right:
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
  }
}

/**
 * Chooses the facing sides of two nodes so an edge leaves toward its target
 * instead of from a fixed handle. Stacked nodes keep bottom-to-top routing;
 * nodes that share a row connect side to side.
 */
export function getEdgeAnchors(source: NodeRect, target: NodeRect): EdgeAnchors {
  const gapBelow = target.y - (source.y + source.height);
  const gapAbove = source.y - (target.y + target.height);
  const gapRight = target.x - (source.x + source.width);
  const gapLeft = source.x - (target.x + target.width);

  let sourcePosition: Position;
  let targetPosition: Position;
  if (gapBelow >= MIN_VERTICAL_GAP) {
    [sourcePosition, targetPosition] = [Position.Bottom, Position.Top];
  } else if (gapAbove >= MIN_VERTICAL_GAP) {
    [sourcePosition, targetPosition] = [Position.Top, Position.Bottom];
  } else if (gapRight > 0 || gapLeft > 0) {
    [sourcePosition, targetPosition] =
      gapRight >= gapLeft ? [Position.Right, Position.Left] : [Position.Left, Position.Right];
  } else {
    [sourcePosition, targetPosition] =
      target.y + target.height / 2 >= source.y + source.height / 2
        ? [Position.Bottom, Position.Top]
        : [Position.Top, Position.Bottom];
  }

  const start = anchor(source, sourcePosition);
  const end = anchor(target, targetPosition);
  return {
    sourceX: start.x,
    sourceY: start.y,
    sourcePosition,
    targetX: end.x,
    targetY: end.y,
    targetPosition,
  };
}
