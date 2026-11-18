import { describe, it, expect } from "vitest";
import { Position } from "reactflow";
import { getEdgeAnchors } from "./edge-anchors";

const box = (x: number, y: number) => ({ x, y, width: 200, height: 100 });

describe("getEdgeAnchors", () => {
  it("keeps top-to-bottom routing for a target in a lower row, even far to the side", () => {
    const anchors = getEdgeAnchors(box(0, 0), box(900, 200));
    expect(anchors).toMatchObject({
      sourcePosition: Position.Bottom,
      sourceX: 100,
      sourceY: 100,
      targetPosition: Position.Top,
      targetX: 1000,
      targetY: 200,
    });
  });

  it("routes upward to a target in a higher row", () => {
    const anchors = getEdgeAnchors(box(0, 300), box(0, 0));
    expect(anchors.sourcePosition).toBe(Position.Top);
    expect(anchors.targetPosition).toBe(Position.Bottom);
    expect(anchors.sourceY).toBe(300);
    expect(anchors.targetY).toBe(100);
  });

  it("connects side to side when nodes share a row", () => {
    const right = getEdgeAnchors(box(0, 0), box(300, 20));
    expect(right).toMatchObject({
      sourcePosition: Position.Right,
      sourceX: 200,
      sourceY: 50,
      targetPosition: Position.Left,
      targetX: 300,
      targetY: 70,
    });
    const left = getEdgeAnchors(box(300, 0), box(0, 0));
    expect(left.sourcePosition).toBe(Position.Left);
    expect(left.targetPosition).toBe(Position.Right);
  });

  it("treats a vertical gap under the threshold as the same row", () => {
    expect(getEdgeAnchors(box(0, 0), box(300, 131)).sourcePosition).toBe(Position.Right);
    expect(getEdgeAnchors(box(0, 0), box(300, 132)).sourcePosition).toBe(Position.Bottom);
  });

  it("falls back to vertical routing for overlapping nodes", () => {
    const anchors = getEdgeAnchors(box(0, 0), box(50, 40));
    expect(anchors.sourcePosition).toBe(Position.Bottom);
    expect(anchors.targetPosition).toBe(Position.Top);
  });

  it("routes diagonal neighbours side to side in the Flow layout", () => {
    expect(getEdgeAnchors(box(0, 0), box(320, 200), "flow")).toMatchObject({
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
    expect(getEdgeAnchors(box(0, 0), box(320, 200), "tiers")).toMatchObject({
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    });
  });

  it("routes stacked nodes top to bottom in the Flow layout", () => {
    expect(getEdgeAnchors(box(0, 0), box(0, 300), "flow")).toMatchObject({
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    });
  });

  it("follows the dominant axis in the Hub and Groups layouts", () => {
    for (const layout of ["hub", "groups"] as const) {
      expect(getEdgeAnchors(box(0, 0), box(900, 200), layout)).toMatchObject({
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });
      expect(getEdgeAnchors(box(0, 0), box(100, 400), layout)).toMatchObject({
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      });
    }
  });
});
