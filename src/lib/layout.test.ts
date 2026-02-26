import { describe, it, expect } from "vitest";
import { applyDagreLayout } from "./layout";
import type { StackNode, StackEdge } from "@/types/stack";

function makeNode(
  id: string,
  category: StackNode["category"],
  subtype: StackNode["subtype"] = "web-app",
): StackNode {
  return {
    id,
    category,
    subtype,
    name: `Node ${id}`,
    technology: "",
    description: "",
    reasoning: "",
    locked: false,
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

describe("applyDagreLayout", () => {
  it("returns empty array for empty input", () => {
    expect(applyDagreLayout([], [])).toEqual([]);
  });

  it("positions a single node", () => {
    const nodes = [makeNode("a", "client")];
    const result = applyDagreLayout(nodes, []);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
    expect(typeof result[0].position.x).toBe("number");
    expect(typeof result[0].position.y).toBe("number");
  });

  it("produces non-overlapping positions for multiple nodes", () => {
    const nodes = [
      makeNode("a", "client"),
      makeNode("b", "api", "rest-api"),
      makeNode("c", "data", "sql-db"),
    ];
    const edges = [makeEdge("a", "b"), makeEdge("b", "c")];
    const result = applyDagreLayout(nodes, edges);

    expect(result).toHaveLength(3);

    // Check that no two nodes share the same position
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const dx = Math.abs(result[i].position.x - result[j].position.x);
        const dy = Math.abs(result[i].position.y - result[j].position.y);
        // Nodes are 200x100; they must differ in at least one axis
        expect(dx > 0 || dy > 0).toBe(true);
      }
    }
  });

  it("orders categories top-to-bottom (clients above data)", () => {
    const nodes = [
      makeNode("data1", "data", "sql-db"),
      makeNode("client1", "client"),
      makeNode("api1", "api", "rest-api"),
    ];
    const edges = [makeEdge("client1", "api1"), makeEdge("api1", "data1")];
    const result = applyDagreLayout(nodes, edges);

    const posMap = new Map(result.map((r) => [r.id, r.position]));
    const clientY = posMap.get("client1")!.y;
    const apiY = posMap.get("api1")!.y;
    const dataY = posMap.get("data1")!.y;

    // Client should be above API, API above Data
    expect(clientY).toBeLessThan(apiY);
    expect(apiY).toBeLessThan(dataY);
  });

  it("handles disconnected subgraphs without overlapping", () => {
    const nodes = [
      makeNode("a", "client"),
      makeNode("b", "client"),
      // No edges — two disconnected nodes at same rank
    ];
    const result = applyDagreLayout(nodes, []);

    expect(result).toHaveLength(2);
    // They should be placed side by side (different x or y)
    const [p1, p2] = [result[0].position, result[1].position];
    const dx = Math.abs(p1.x - p2.x);
    const dy = Math.abs(p1.y - p2.y);
    expect(dx > 0 || dy > 0).toBe(true);
  });

  it("handles edges referencing non-existent nodes gracefully", () => {
    const nodes = [makeNode("a", "client")];
    const edges = [makeEdge("a", "nonexistent")];

    // Should not throw
    const result = applyDagreLayout(nodes, edges);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });

  it("uses fixed positions for nodes when provided", () => {
    const nodes = [
      makeNode("a", "client"),
      makeNode("b", "api", "rest-api"),
    ];
    const edges = [makeEdge("a", "b")];
    const fixedPositions = new Map([["a", { x: 500, y: 500 }]]);

    const result = applyDagreLayout(nodes, edges, fixedPositions);
    const posMap = new Map(result.map((r) => [r.id, r.position]));

    // Fixed node should have exact position
    expect(posMap.get("a")).toEqual({ x: 500, y: 500 });
    // Non-fixed node should have Dagre-computed position
    expect(posMap.get("b")).toBeDefined();
    expect(posMap.get("b")!.x).not.toBe(500);
  });

  it("handles circular dependencies without crashing", () => {
    const nodes = [
      makeNode("a", "services", "auth"),
      makeNode("b", "services", "notifications"),
    ];
    const edges = [makeEdge("a", "b"), makeEdge("b", "a")];

    // Should not throw
    const result = applyDagreLayout(nodes, edges);
    expect(result).toHaveLength(2);
  });

  it("positions nodes at same category side by side", () => {
    const nodes = [
      makeNode("a", "client", "web-app"),
      makeNode("b", "client", "mobile-app"),
      makeNode("c", "data", "sql-db"),
    ];
    const edges = [makeEdge("a", "c"), makeEdge("b", "c")];
    const result = applyDagreLayout(nodes, edges);

    const posMap = new Map(result.map((r) => [r.id, r.position]));
    const aY = posMap.get("a")!.y;
    const bY = posMap.get("b")!.y;

    // Both client nodes should be at the same vertical level
    expect(aY).toBe(bY);
  });
});
