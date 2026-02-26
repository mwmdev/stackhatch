import { describe, it, expect } from "vitest";
import { mergeArchitecture } from "./merge-architecture";
import type { StackArchitecture, StackNode, StackEdge } from "@/types/stack";
import type { NodePosition } from "@/lib/layout";

function makeNode(overrides: Partial<StackNode> & { id: string }): StackNode {
  return {
    category: "services",
    subtype: "custom",
    name: `Node ${overrides.id}`,
    technology: "Test",
    description: "",
    reasoning: "",
    locked: false,
    ...overrides,
  };
}

function makeEdge(
  source: string,
  target: string,
  id?: string,
): StackEdge {
  return {
    id: id ?? `${source}-${target}`,
    source,
    target,
    connectionType: "http",
    label: "HTTP",
  };
}

function makePosition(id: string, x: number, y: number): NodePosition {
  return { id, position: { x, y } };
}

describe("mergeArchitecture", () => {
  it("preserves locked nodes from current state", () => {
    const current: StackArchitecture = {
      nodes: [
        makeNode({ id: "a", locked: true, name: "Locked A" }),
        makeNode({ id: "b", locked: false, name: "Unlocked B" }),
      ],
      edges: [],
    };
    const incoming: StackArchitecture = {
      nodes: [
        makeNode({ id: "c", name: "New C" }),
        makeNode({ id: "d", name: "New D" }),
      ],
      edges: [],
    };
    const positions = [makePosition("a", 100, 200), makePosition("b", 300, 400)];

    const result = mergeArchitecture(current, incoming, positions);

    // Locked node preserved, unlocked node replaced by incoming
    expect(result.architecture.nodes).toHaveLength(3);
    expect(result.architecture.nodes.find((n) => n.id === "a")).toEqual(
      expect.objectContaining({ id: "a", locked: true, name: "Locked A" }),
    );
    expect(result.architecture.nodes.find((n) => n.id === "b")).toBeUndefined();
    expect(result.architecture.nodes.find((n) => n.id === "c")).toBeDefined();
    expect(result.architecture.nodes.find((n) => n.id === "d")).toBeDefined();
  });

  it("returns fixed positions for locked nodes only", () => {
    const current: StackArchitecture = {
      nodes: [
        makeNode({ id: "a", locked: true }),
        makeNode({ id: "b", locked: false }),
      ],
      edges: [],
    };
    const incoming: StackArchitecture = {
      nodes: [makeNode({ id: "c" })],
      edges: [],
    };
    const positions = [makePosition("a", 50, 75), makePosition("b", 200, 300)];

    const result = mergeArchitecture(current, incoming, positions);

    expect(result.fixedPositions.size).toBe(1);
    expect(result.fixedPositions.get("a")).toEqual({ x: 50, y: 75 });
    expect(result.fixedPositions.has("b")).toBe(false);
  });

  it("preserves edges between locked nodes from current state", () => {
    const current: StackArchitecture = {
      nodes: [
        makeNode({ id: "a", locked: true }),
        makeNode({ id: "b", locked: true }),
        makeNode({ id: "c", locked: false }),
      ],
      edges: [
        makeEdge("a", "b", "edge-ab"),
        makeEdge("a", "c", "edge-ac"),
      ],
    };
    const incoming: StackArchitecture = {
      nodes: [makeNode({ id: "d" })],
      edges: [makeEdge("a", "d", "edge-ad")],
    };
    const positions = [
      makePosition("a", 0, 0),
      makePosition("b", 100, 0),
      makePosition("c", 200, 0),
    ];

    const result = mergeArchitecture(current, incoming, positions);

    // Edge between locked a→b preserved
    expect(result.architecture.edges.find((e) => e.id === "edge-ab")).toBeDefined();
    // Edge a→c not preserved (c is unlocked and not in incoming)
    expect(result.architecture.edges.find((e) => e.id === "edge-ac")).toBeUndefined();
    // Edge a→d from incoming added
    expect(result.architecture.edges.find((e) => e.id === "edge-ad")).toBeDefined();
  });

  it("filters incoming edges referencing non-existent nodes", () => {
    const current: StackArchitecture = {
      nodes: [makeNode({ id: "a", locked: true })],
      edges: [],
    };
    const incoming: StackArchitecture = {
      nodes: [makeNode({ id: "b" })],
      edges: [
        makeEdge("a", "b", "valid"),
        makeEdge("a", "z", "invalid"), // z doesn't exist
      ],
    };
    const positions = [makePosition("a", 0, 0)];

    const result = mergeArchitecture(current, incoming, positions);

    expect(result.architecture.edges).toHaveLength(1);
    expect(result.architecture.edges[0].id).toBe("valid");
  });

  it("handles no locked nodes (all replaced)", () => {
    const current: StackArchitecture = {
      nodes: [
        makeNode({ id: "a", locked: false }),
        makeNode({ id: "b", locked: false }),
      ],
      edges: [makeEdge("a", "b")],
    };
    const incoming: StackArchitecture = {
      nodes: [makeNode({ id: "c" }), makeNode({ id: "d" })],
      edges: [makeEdge("c", "d")],
    };
    const positions = [makePosition("a", 0, 0), makePosition("b", 100, 0)];

    const result = mergeArchitecture(current, incoming, positions);

    expect(result.architecture.nodes).toHaveLength(2);
    expect(result.architecture.nodes.map((n) => n.id)).toEqual(["c", "d"]);
    expect(result.fixedPositions.size).toBe(0);
    expect(result.architecture.edges).toHaveLength(1);
    expect(result.architecture.edges[0].source).toBe("c");
  });

  it("handles all nodes locked (AI removes nothing)", () => {
    const current: StackArchitecture = {
      nodes: [
        makeNode({ id: "a", locked: true }),
        makeNode({ id: "b", locked: true }),
      ],
      edges: [makeEdge("a", "b", "edge-ab")],
    };
    const incoming: StackArchitecture = {
      nodes: [], // AI sends no unlocked nodes
      edges: [],
    };
    const positions = [makePosition("a", 10, 20), makePosition("b", 30, 40)];

    const result = mergeArchitecture(current, incoming, positions);

    expect(result.architecture.nodes).toHaveLength(2);
    expect(result.fixedPositions.size).toBe(2);
    expect(result.architecture.edges).toHaveLength(1);
    expect(result.architecture.edges[0].id).toBe("edge-ab");
  });

  it("does not duplicate edges when incoming matches preserved", () => {
    const current: StackArchitecture = {
      nodes: [
        makeNode({ id: "a", locked: true }),
        makeNode({ id: "b", locked: true }),
      ],
      edges: [makeEdge("a", "b", "current-edge")],
    };
    const incoming: StackArchitecture = {
      nodes: [],
      edges: [makeEdge("a", "b", "incoming-edge")], // same source→target
    };
    const positions = [makePosition("a", 0, 0), makePosition("b", 100, 0)];

    const result = mergeArchitecture(current, incoming, positions);

    // Should only have the preserved edge, not the duplicate from incoming
    expect(result.architecture.edges).toHaveLength(1);
    expect(result.architecture.edges[0].id).toBe("current-edge");
  });

  it("incoming node with same id as locked node is excluded (locked takes precedence)", () => {
    const current: StackArchitecture = {
      nodes: [makeNode({ id: "a", locked: true, name: "Original" })],
      edges: [],
    };
    const incoming: StackArchitecture = {
      nodes: [
        makeNode({ id: "a", locked: false, name: "AI Replacement" }),
        makeNode({ id: "b", name: "New" }),
      ],
      edges: [],
    };
    const positions = [makePosition("a", 50, 50)];

    const result = mergeArchitecture(current, incoming, positions);

    expect(result.architecture.nodes).toHaveLength(2);
    const nodeA = result.architecture.nodes.find((n) => n.id === "a")!;
    expect(nodeA.name).toBe("Original");
    expect(nodeA.locked).toBe(true);
  });

  it("handles empty current positions gracefully", () => {
    const current: StackArchitecture = {
      nodes: [makeNode({ id: "a", locked: true })],
      edges: [],
    };
    const incoming: StackArchitecture = {
      nodes: [makeNode({ id: "b" })],
      edges: [],
    };

    const result = mergeArchitecture(current, incoming, []);

    expect(result.architecture.nodes).toHaveLength(2);
    // No fixed position for locked node (no position data available)
    expect(result.fixedPositions.size).toBe(0);
  });
});
