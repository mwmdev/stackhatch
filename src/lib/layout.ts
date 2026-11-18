import { MAP_LAYOUTS } from "@/types/stack";
import type { MapLayout, NodeCategory, StackEdge, StackNode } from "@/types/stack";

export interface NodePosition {
  id: string;
  position: { x: number; y: number };
}

type Point = { x: number; y: number };

export const MAP_LAYOUT_LABELS: Record<MapLayout, string> = {
  tiers: "Tiers",
  flow: "Flow",
  hub: "Hub",
  groups: "Groups",
};

/** Layout applied by the next Auto-layout click: the following entry, wrapping around. */
export function nextMapLayout(current: MapLayout | undefined): MapLayout {
  if (!current) return MAP_LAYOUTS[0];
  return MAP_LAYOUTS[(MAP_LAYOUTS.indexOf(current) + 1) % MAP_LAYOUTS.length];
}

const NODE_WIDTH = 200;
const NODE_HEIGHT = 100;
const MAX_PER_LINE = 6;

/**
 * Category order shared by every layout. Infrastructure sits between client and
 * API because every built-in infrastructure subtype is ingress.
 */
const LAYOUT_CATEGORY_ORDER: NodeCategory[] = [
  "client",
  "infrastructure",
  "api",
  "services",
  "data",
  "external",
];

/** Which category wins when two nodes tie for the Hub centre. */
const HUB_PRIORITY: NodeCategory[] = [
  "api",
  "services",
  "infrastructure",
  "data",
  "external",
  "client",
];

const categoryIndex = (category: NodeCategory) => LAYOUT_CATEGORY_ORDER.indexOf(category);

/** Undirected neighbour lists over the given (non-note) nodes; parallel edges repeat. */
function buildAdjacency(nodes: StackNode[], edges: StackEdge[]): number[][] {
  const indexById = new Map(nodes.map((node, index) => [node.id, index]));
  const adjacency: number[][] = nodes.map(() => []);
  for (const edge of edges) {
    const a = indexById.get(edge.source);
    const b = indexById.get(edge.target);
    if (a === undefined || b === undefined || a === b) continue;
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
  return adjacency;
}

/** Splits `count` items into `ceil(count / MAX_PER_LINE)` near-equal lines, larger lines first. */
function lineSizes(count: number): number[] {
  const lines = Math.ceil(count / MAX_PER_LINE);
  const base = Math.floor(count / lines);
  const larger = count % lines;
  return Array.from({ length: lines }, (_, line) => (line < larger ? base + 1 : base));
}

/** Category tiers (skipping empty ones), reordered by barycenter to reduce crossings. */
function orderTiers(nodes: StackNode[], adjacency: number[][]): number[][] {
  const tiers: number[][] = [];
  for (const category of LAYOUT_CATEGORY_ORDER) {
    const tier = nodes.flatMap((node, index) => (node.category === category ? [index] : []));
    if (tier.length > 0) tiers.push(tier);
  }

  const tierOf = new Map<number, number>();
  tiers.forEach((tier, t) => tier.forEach((index) => tierOf.set(index, t)));
  const pos = new Map<number, number>();
  const refreshPositions = (t: number) =>
    tiers[t].forEach((index, i) => pos.set(index, i / Math.max(1, tiers[t].length - 1)));
  tiers.forEach((_, t) => refreshPositions(t));

  const sweep = (t: number, reference: (neighbourTier: number) => boolean) => {
    const keyed = tiers[t].map((index, current) => {
      const refs = adjacency[index].filter((n) => reference(tierOf.get(n)!));
      const key =
        refs.length > 0
          ? refs.reduce((sum, n) => sum + pos.get(n)!, 0) / refs.length
          : pos.get(index)!;
      return { index, key, current };
    });
    keyed.sort((a, b) => a.key - b.key || a.current - b.current);
    tiers[t] = keyed.map((entry) => entry.index);
    refreshPositions(t);
  };

  for (let t = 1; t < tiers.length; t += 1) sweep(t, (n) => n < t);
  for (let t = tiers.length - 2; t >= 0; t -= 1) sweep(t, (n) => n > t);
  for (let t = 1; t < tiers.length; t += 1) sweep(t, (n) => n < t);
  return tiers;
}

/** Tiers (top-down rows) and Flow (left-to-right columns) share ordering and wrapping. */
function layeredSlots(nodes: StackNode[], adjacency: number[][], vertical: boolean): Point[] {
  const slots: Point[] = new Array(nodes.length);
  let cursor = 0;
  for (const tier of orderTiers(nodes, adjacency)) {
    const sizes = lineSizes(tier.length);
    let next = 0;
    sizes.forEach((size, line) => {
      for (let j = 0; j < size; j += 1) {
        const index = tier[next + j];
        if (vertical) {
          const x0 = -(size * 280 - 80) / 2;
          slots[index] = { x: x0 + j * 280, y: cursor + line * 140 };
        } else {
          const y0 = -(size * 140 - 40) / 2;
          slots[index] = { x: cursor + line * 240, y: y0 + j * 140 };
        }
      }
      next += size;
    });
    cursor += vertical ? (sizes.length - 1) * 140 + 200 : (sizes.length - 1) * 240 + 320;
  }
  return slots;
}

function hubSlots(nodes: StackNode[], adjacency: number[][]): Point[] {
  const slots: Point[] = new Array(nodes.length);
  const centre = nodes.reduce((best, node, index) => {
    const bestDegree = adjacency[best].length;
    const degree = adjacency[index].length;
    if (degree !== bestDegree) return degree > bestDegree ? index : best;
    const priority = HUB_PRIORITY.indexOf(node.category);
    const bestPriority = HUB_PRIORITY.indexOf(nodes[best].category);
    return priority < bestPriority ? index : best;
  }, 0);

  // Breadth-first from the centre; neighbours are visited in node input order.
  const distance = new Map<number, number>([[centre, 0]]);
  const parent = new Map<number, number>();
  const queue = [centre];
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    for (const n of [...new Set(adjacency[current])].sort((a, b) => a - b)) {
      if (distance.has(n)) continue;
      distance.set(n, distance.get(current)! + 1);
      parent.set(n, current);
      queue.push(n);
    }
  }
  const maxDistance = Math.max(...distance.values());
  const rings = new Map<number, number[]>();
  nodes.forEach((_, index) => {
    if (index === centre) return;
    const ring = distance.get(index) ?? maxDistance + 1;
    rings.set(ring, [...(rings.get(ring) ?? []), index]);
  });

  // Clockwise-from-top fraction of a full turn, for nodes already placed on a ring.
  const turn = new Map<number, number>();
  let previousRadius = 0;
  for (const ring of [...rings.keys()].sort((a, b) => a - b)) {
    const members = rings.get(ring)!;
    const reachableOuter = ring >= 2 && ring <= maxDistance;
    members.sort((a, b) => {
      const byParent = reachableOuter ? turn.get(parent.get(a)!)! - turn.get(parent.get(b)!)! : 0;
      return (
        byParent || categoryIndex(nodes[a].category) - categoryIndex(nodes[b].category) || a - b
      );
    });
    const circumference = (members.length * 240) / (2 * Math.PI);
    const radius =
      ring === 1 ? Math.max(240, circumference) : Math.max(previousRadius + 220, circumference);
    previousRadius = radius;
    members.forEach((index, i) => {
      const theta = -Math.PI / 2 + (2 * Math.PI * i) / members.length;
      turn.set(index, i / members.length);
      slots[index] = {
        x: radius * Math.cos(theta) - NODE_WIDTH / 2,
        y: radius * Math.sin(theta) - NODE_HEIGHT / 2,
      };
    });
  }
  slots[centre] = { x: -NODE_WIDTH / 2, y: -NODE_HEIGHT / 2 };
  return slots;
}

function groupSlots(nodes: StackNode[]): Point[] {
  const slots: Point[] = new Array(nodes.length);
  const blocks: { members: number[]; columns: number; width: number; height: number }[] = [];
  for (const category of LAYOUT_CATEGORY_ORDER) {
    const members = nodes
      .flatMap((node, index) => (node.category === category ? [index] : []))
      .sort(
        (a, b) =>
          nodes[a].name.localeCompare(nodes[b].name, undefined, { sensitivity: "base" }) || a - b
      );
    if (members.length === 0) continue;
    const columns = Math.min(4, Math.ceil(Math.sqrt(members.length)));
    const rows = Math.ceil(members.length / columns);
    blocks.push({ members, columns, width: columns * 240 - 40, height: rows * 140 - 40 });
  }

  let blockY = 0;
  for (let start = 0; start < blocks.length; start += 3) {
    const row = blocks.slice(start, start + 3);
    let blockX = 0;
    for (const block of row) {
      block.members.forEach((index, k) => {
        slots[index] = {
          x: blockX + (k % block.columns) * 240,
          y: blockY + Math.floor(k / block.columns) * 140,
        };
      });
      blockX += block.width + 160;
    }
    blockY += Math.max(...row.map((block) => block.height)) + 160;
  }
  return slots;
}

/**
 * Places nodes by category in the chosen layout style. Notes never take part:
 * they sit in one column right of the map. Locked nodes keep `fixedPositions`
 * and the rest of the layout shifts to land beside them.
 *
 * @returns One position (top-left corner) per input node, in input order
 */
export function applyMapLayout(
  layout: MapLayout,
  nodes: StackNode[],
  edges: StackEdge[],
  fixedPositions?: Map<string, Point>
): NodePosition[] {
  if (nodes.length === 0) return [];

  const mainIndexes = nodes.flatMap((node, index) => (node.category === "note" ? [] : [index]));
  const main = mainIndexes.map((index) => nodes[index]);
  const adjacency = buildAdjacency(main, edges);

  let mainSlots: Point[] = [];
  if (main.length > 0) {
    switch (layout) {
      case "tiers":
        mainSlots = layeredSlots(main, adjacency, true);
        break;
      case "flow":
        mainSlots = layeredSlots(main, adjacency, false);
        break;
      case "hub":
        mainSlots = hubSlots(main, adjacency);
        break;
      case "groups":
        mainSlots = groupSlots(main);
        break;
    }
  }

  const slots: Point[] = new Array(nodes.length);
  mainIndexes.forEach((index, i) => {
    slots[index] = mainSlots[i];
  });

  const noteX =
    mainSlots.length > 0 ? Math.max(...mainSlots.map((s) => s.x + NODE_WIDTH)) + 160 : 0;
  let noteY = mainSlots.length > 0 ? Math.min(...mainSlots.map((s) => s.y)) : 0;
  nodes.forEach((node, index) => {
    if (node.category !== "note") return;
    slots[index] = { x: noteX, y: noteY };
    noteY += 140;
  });

  // The free layout starts at its own origin. Shift it by the locked nodes'
  // average displacement so unlocked nodes land beside them instead of at the
  // top-left of the canvas.
  let offsetX = 0;
  let offsetY = 0;
  let anchors = 0;
  nodes.forEach((node, index) => {
    const fixed = fixedPositions?.get(node.id);
    if (!fixed) return;
    offsetX += fixed.x - slots[index].x;
    offsetY += fixed.y - slots[index].y;
    anchors += 1;
  });
  if (anchors > 0) {
    offsetX /= anchors;
    offsetY /= anchors;
  }

  return nodes.map((node, index) => {
    const fixed = fixedPositions?.get(node.id);
    if (fixed) return { id: node.id, position: fixed };
    return { id: node.id, position: { x: slots[index].x + offsetX, y: slots[index].y + offsetY } };
  });
}
