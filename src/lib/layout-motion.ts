type Point = { x: number; y: number };

/** Duration of an explicit Auto-layout settle. */
export const LAYOUT_SETTLE_MS = 240;

/** One in-flight Auto-layout: where nodes started, where they end, how far along. */
export interface LayoutMotion {
  from: ReadonlyMap<string, Point>;
  to: ReadonlyMap<string, Point>;
  progress: number;
}

/** Monotonic cubic ease-in-out (the same curve React Flow uses for viewport moves). */
export function easeLayoutProgress(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * Presents nodes part-way between their previous and Auto-layout positions.
 * A node is only interpolated while it still sits at its Auto-layout
 * destination; if anything else has moved it, its real position wins, so the
 * motion can never overwrite a newer edit. The canonical nodes are never
 * mutated; unchanged nodes keep their identity.
 */
export function applyLayoutMotion<T extends { id: string; position: Point }>(
  nodes: T[],
  motion: LayoutMotion
): T[] {
  return nodes.map((node) => {
    const target = motion.to.get(node.id);
    const start = motion.from.get(node.id);
    if (
      !target ||
      !start ||
      target.x !== node.position.x ||
      target.y !== node.position.y ||
      (start.x === target.x && start.y === target.y)
    ) {
      return node;
    }
    return {
      ...node,
      position: {
        x: start.x + (target.x - start.x) * motion.progress,
        y: start.y + (target.y - start.y) * motion.progress,
      },
    };
  });
}
