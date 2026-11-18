import { Position } from "reactflow";
import type { MapLayout } from "@/types/stack";

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
 * instead of from a fixed handle. Routing follows the map's layout: Tiers keep
 * bottom-to-top routing, Flow prefers right-to-left, and Hub and Groups follow
 * whichever axis separates the two nodes most.
 */
export function getEdgeAnchors(
  source: NodeRect,
  target: NodeRect,
  layout: MapLayout = "tiers"
): EdgeAnchors {
  const gapBelow = target.y - (source.y + source.height);
  const gapAbove = source.y - (target.y + target.height);
  const gapRight = target.x - (source.x + source.width);
  const gapLeft = source.x - (target.x + target.width);

  const down: [Position, Position] = [Position.Bottom, Position.Top];
  const up: [Position, Position] = [Position.Top, Position.Bottom];
  const right: [Position, Position] = [Position.Right, Position.Left];
  const left: [Position, Position] = [Position.Left, Position.Right];
  const centreBelow = target.y + target.height / 2 >= source.y + source.height / 2;
  const centreRight = target.x + target.width / 2 >= source.x + source.width / 2;

  let sides: [Position, Position];
  if (layout === "flow") {
    if (gapRight >= MIN_VERTICAL_GAP) sides = right;
    else if (gapLeft >= MIN_VERTICAL_GAP) sides = left;
    else if (gapBelow > 0 || gapAbove > 0) sides = gapBelow >= gapAbove ? down : up;
    else sides = centreRight ? right : left;
  } else if (layout === "hub" || layout === "groups") {
    const vertical = Math.max(gapBelow, gapAbove);
    const horizontal = Math.max(gapRight, gapLeft);
    if (vertical <= 0 && horizontal <= 0) sides = centreBelow ? down : up;
    else if (vertical >= horizontal) sides = gapBelow >= gapAbove ? down : up;
    else sides = gapRight >= gapLeft ? right : left;
  } else if (gapBelow >= MIN_VERTICAL_GAP) {
    sides = down;
  } else if (gapAbove >= MIN_VERTICAL_GAP) {
    sides = up;
  } else if (gapRight > 0 || gapLeft > 0) {
    sides = gapRight >= gapLeft ? right : left;
  } else {
    sides = centreBelow ? down : up;
  }
  const [sourcePosition, targetPosition] = sides;

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
