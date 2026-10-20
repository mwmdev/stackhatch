import { describe, expect, it } from "vitest";
import { applyLayoutMotion, easeLayoutProgress, type LayoutMotion } from "./layout-motion";

const motion = (progress: number): LayoutMotion => ({
  from: new Map([
    ["a", { x: 0, y: 0 }],
    ["b", { x: 50, y: 50 }],
  ]),
  to: new Map([
    ["a", { x: 100, y: 200 }],
    ["b", { x: 50, y: 50 }],
  ]),
  progress,
});

describe("easeLayoutProgress", () => {
  it("is monotonic, hits both ends and never overshoots", () => {
    expect(easeLayoutProgress(0)).toBe(0);
    expect(easeLayoutProgress(1)).toBe(1);
    let previous = 0;
    for (let step = 1; step <= 100; step += 1) {
      const value = easeLayoutProgress(step / 100);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeLessThanOrEqual(1);
      previous = value;
    }
  });
});

describe("applyLayoutMotion", () => {
  it("interpolates nodes sitting at their destination and keeps identity of the rest", () => {
    const nodes = [
      { id: "a", position: { x: 100, y: 200 } },
      { id: "b", position: { x: 50, y: 50 } },
    ];
    const result = applyLayoutMotion(nodes, motion(0.5));
    expect(result[0].position).toEqual({ x: 50, y: 100 });
    expect(result[1]).toBe(nodes[1]);
    expect(nodes[0].position).toEqual({ x: 100, y: 200 });
  });

  it("starts at the old position and ends at the destination", () => {
    const nodes = [{ id: "a", position: { x: 100, y: 200 } }];
    expect(applyLayoutMotion(nodes, motion(0))[0].position).toEqual({ x: 0, y: 0 });
    expect(applyLayoutMotion(nodes, motion(1))[0].position).toEqual({ x: 100, y: 200 });
  });

  it("never overrides a node something else has since moved", () => {
    const moved = { id: "a", position: { x: 120, y: 200 } };
    expect(applyLayoutMotion([moved], motion(0.5))[0]).toBe(moved);
  });
});
