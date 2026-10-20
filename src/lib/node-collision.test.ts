import { describe, expect, it } from "vitest";
import type { Node, NodeChange } from "reactflow";
import {
  applyNonOverlappingNodeChanges,
  findNearestOpenPosition,
  nodesOverlap,
  resolveNodeOverlaps,
} from "./node-collision";

interface TestNodeData {
  label: string;
}

function makeNode(id: string, x: number, y: number, width = 200, height = 100): Node<TestNodeData> {
  return {
    id,
    position: { x, y },
    width,
    height,
    data: { label: id },
  };
}

describe("node collision handling", () => {
  it("finds the nearest free position when a new node starts on an occupied point", () => {
    const existing = makeNode("existing", 100, 100);
    const incoming = makeNode("incoming", 100, 100);

    const position = findNearestOpenPosition(incoming, [existing], incoming.position);
    const positioned = { ...incoming, position };

    expect(position).not.toEqual(incoming.position);
    expect(nodesOverlap(positioned, existing)).toBe(false);
  });

  it("separates existing nodes after their rendered dimensions are measured", () => {
    const nodes = [
      makeNode("first", 0, 0, 320, 100),
      makeNode("second", 280, 0, 320, 100),
      makeNode("third", 560, 0, 320, 100),
    ];

    const resolved = resolveNodeOverlaps(nodes);

    for (let index = 0; index < resolved.length; index += 1) {
      for (let comparison = index + 1; comparison < resolved.length; comparison += 1) {
        expect(nodesOverlap(resolved[index], resolved[comparison])).toBe(false);
      }
    }
  });

  it("rejects a drag position that intersects another node", () => {
    const nodes = [makeNode("first", 0, 0), makeNode("second", 300, 0)];
    const changes: NodeChange[] = [
      {
        id: "second",
        type: "position",
        position: { x: 100, y: 0 },
        positionAbsolute: { x: 100, y: 0 },
        dragging: false,
      },
    ];

    const result = applyNonOverlappingNodeChanges(changes, nodes);

    expect(result[1].position).toEqual({ x: 300, y: 0 });
    expect(result[1].dragging).toBe(false);
  });

  it("preserves state identity while a blocked drag remains active", () => {
    const nodes = [makeNode("first", 0, 0), { ...makeNode("second", 300, 0), dragging: true }];
    const changes: NodeChange[] = [
      {
        id: "second",
        type: "position",
        position: { x: 100, y: 0 },
        positionAbsolute: { x: 100, y: 0 },
        dragging: true,
      },
    ];

    const result = applyNonOverlappingNodeChanges(changes, nodes);

    expect(result).toBe(nodes);
  });

  it("keeps a dragged selection together when one node hits an obstacle", () => {
    const nodes = [
      makeNode("obstacle", 0, 0),
      { ...makeNode("first-selected", 300, 0), selected: true },
      { ...makeNode("second-selected", 600, 0), selected: true },
    ];
    const changes: NodeChange[] = [
      {
        id: "first-selected",
        type: "position",
        position: { x: 100, y: 0 },
        positionAbsolute: { x: 100, y: 0 },
        dragging: true,
      },
      {
        id: "second-selected",
        type: "position",
        position: { x: 400, y: 0 },
        positionAbsolute: { x: 400, y: 0 },
        dragging: true,
      },
    ];

    const result = applyNonOverlappingNodeChanges(changes, nodes);

    expect(result[1].position).toEqual({ x: 300, y: 0 });
    expect(result[2].position).toEqual({ x: 600, y: 0 });
  });

  it("allows a drag when the proposed node rectangles remain separate", () => {
    const nodes = [makeNode("first", 0, 0), makeNode("second", 300, 0)];
    const changes: NodeChange[] = [
      {
        id: "second",
        type: "position",
        position: { x: 500, y: 0 },
        positionAbsolute: { x: 500, y: 0 },
        dragging: true,
      },
    ];

    const result = applyNonOverlappingNodeChanges(changes, nodes);

    expect(result[1].position).toEqual({ x: 500, y: 0 });
    expect(result[1].dragging).toBe(true);
  });
});
