import { describe, it, expect } from "vitest";
import { applyMapLayout, nextMapLayout } from "./layout";
import { MAP_LAYOUTS } from "@/types/stack";
import type { MapLayout, StackNode, StackEdge } from "@/types/stack";

function makeNode(
  id: string,
  category: StackNode["category"],
  subtype: StackNode["subtype"] = "web-app",
  name = `Node ${id}`
): StackNode {
  return {
    id,
    category,
    subtype,
    name,
    technology: "",
    description: "",
    reasoning: "",
    locked: false,
  };
}

function makeEdge(source: string, target: string, id?: string): StackEdge {
  return {
    id: id ?? `${source}-${target}`,
    source,
    target,
    connectionType: "http",
    label: "",
  };
}

function positionsById(layout: MapLayout, nodes: StackNode[], edges: StackEdge[] = []) {
  return new Map(applyMapLayout(layout, nodes, edges).map((p) => [p.id, p.position]));
}

const overlaps = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  a.x < b.x + 200 && b.x < a.x + 200 && a.y < b.y + 100 && b.y < a.y + 100;

const mixedMap = (): { nodes: StackNode[]; edges: StackEdge[] } => ({
  nodes: [
    makeNode("web", "client"),
    makeNode("mobile", "client"),
    makeNode("cdn", "infrastructure", "cdn"),
    makeNode("api", "api", "rest-api"),
    makeNode("auth", "services", "auth-service"),
    makeNode("orders", "services", "worker"),
    makeNode("billing", "services", "worker"),
    makeNode("pg", "data", "sql-database"),
    makeNode("redis", "data", "cache"),
    makeNode("stripe", "external", "payment"),
    makeNode("n1", "note"),
    makeNode("n2", "note"),
  ],
  edges: [
    makeEdge("web", "cdn"),
    makeEdge("mobile", "cdn"),
    makeEdge("cdn", "api"),
    makeEdge("api", "auth"),
    makeEdge("api", "orders"),
    makeEdge("api", "billing"),
    makeEdge("orders", "pg"),
    makeEdge("auth", "redis"),
    makeEdge("billing", "stripe"),
  ],
});

describe("nextMapLayout", () => {
  it("cycles tiers → flow → hub → groups → tiers, starting from tiers", () => {
    expect(nextMapLayout(undefined)).toBe("tiers");
    expect(nextMapLayout("tiers")).toBe("flow");
    expect(nextMapLayout("flow")).toBe("hub");
    expect(nextMapLayout("hub")).toBe("groups");
    expect(nextMapLayout("groups")).toBe("tiers");
  });
});

describe("applyMapLayout", () => {
  it("returns empty array for empty input", () => {
    for (const layout of MAP_LAYOUTS) expect(applyMapLayout(layout, [], [])).toEqual([]);
  });

  it("positions a single node in every layout", () => {
    for (const layout of MAP_LAYOUTS) {
      const result = applyMapLayout(layout, [makeNode("a", "client")], []);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("a");
      expect(Number.isFinite(result[0].position.x)).toBe(true);
      expect(Number.isFinite(result[0].position.y)).toBe(true);
    }
  });

  it("returns one position per node in input order", () => {
    const { nodes, edges } = mixedMap();
    for (const layout of MAP_LAYOUTS) {
      expect(applyMapLayout(layout, nodes, edges).map((p) => p.id)).toEqual(nodes.map((n) => n.id));
    }
  });

  it("ignores edges that reference missing nodes, notes and self-loops", () => {
    const nodes = [makeNode("a", "client"), makeNode("b", "api"), makeNode("n", "note")];
    const edges = [makeEdge("a", "ghost"), makeEdge("a", "n"), makeEdge("b", "b")];
    for (const layout of MAP_LAYOUTS) {
      expect(applyMapLayout(layout, nodes, edges)).toHaveLength(3);
    }
  });

  it("does not crash on cycles", () => {
    const nodes = [makeNode("a", "api"), makeNode("b", "services"), makeNode("c", "data")];
    const edges = [makeEdge("a", "b"), makeEdge("b", "c"), makeEdge("c", "a")];
    for (const layout of MAP_LAYOUTS) {
      expect(() => applyMapLayout(layout, nodes, edges)).not.toThrow();
    }
  });

  it("orders tiers by type, not by edge direction", () => {
    const nodes = [
      makeNode("data1", "data", "sql-database"),
      makeNode("client1", "client"),
      makeNode("ext1", "external", "payment"),
      makeNode("api1", "api", "rest-api"),
    ];
    const edges = [makeEdge("data1", "client1")];
    const tiers = positionsById("tiers", nodes, edges);
    expect(tiers.get("client1")!.y).toBeLessThan(tiers.get("api1")!.y);
    expect(tiers.get("api1")!.y).toBeLessThan(tiers.get("data1")!.y);
    expect(tiers.get("data1")!.y).toBeLessThan(tiers.get("ext1")!.y);

    const flow = positionsById("flow", nodes, edges);
    expect(flow.get("client1")!.x).toBeLessThan(flow.get("api1")!.x);
    expect(flow.get("api1")!.x).toBeLessThan(flow.get("data1")!.x);
    expect(flow.get("data1")!.x).toBeLessThan(flow.get("ext1")!.x);
  });

  it("places infrastructure between client and api", () => {
    const nodes = [
      makeNode("api", "api", "rest-api"),
      makeNode("cdn", "infrastructure", "cdn"),
      makeNode("web", "client"),
    ];
    const tiers = positionsById("tiers", nodes);
    expect(tiers.get("web")!.y).toBeLessThan(tiers.get("cdn")!.y);
    expect(tiers.get("cdn")!.y).toBeLessThan(tiers.get("api")!.y);
  });

  it("wraps a tier of eight nodes into two lines of four", () => {
    const nodes = Array.from({ length: 8 }, (_, i) => makeNode(`s${i}`, "services", "worker"));
    const rows = new Map<number, number>();
    for (const { y } of positionsById("tiers", nodes).values()) {
      rows.set(y, (rows.get(y) ?? 0) + 1);
    }
    expect([...rows.values()]).toEqual([4, 4]);
  });

  describe("hub", () => {
    const nodes = [
      makeNode("hub", "api", "rest-api"),
      makeNode("s1", "services", "worker"),
      makeNode("s2", "services", "worker"),
      makeNode("c1", "client"),
      makeNode("d1", "data", "sql-database"),
      makeNode("d2", "data", "sql-database"),
    ];
    const edges = [
      makeEdge("hub", "s1"),
      makeEdge("hub", "s2"),
      makeEdge("hub", "c1"),
      makeEdge("hub", "d1"),
      makeEdge("s1", "d2"),
    ];

    it("centres the busiest node with the client directly above and outer rings farther out", () => {
      const pos = positionsById("hub", nodes, edges);
      const centre = pos.get("hub")!;
      expect(centre).toEqual({ x: -100, y: -50 });
      expect(pos.get("c1")!.x).toBeCloseTo(centre.x);
      expect(pos.get("c1")!.y).toBeLessThan(centre.y);
      const distance = (id: string) =>
        Math.hypot(pos.get(id)!.x - centre.x, pos.get(id)!.y - centre.y);
      for (const id of ["s1", "s2", "c1", "d1"]) {
        expect(distance("d2")).toBeGreaterThan(distance(id));
      }
    });

    it("spreads unconnected nodes at one distance from the centre", () => {
      const pos = positionsById("hub", nodes);
      const centre = pos.get("hub")!;
      const distances = nodes
        .filter((n) => n.id !== "hub")
        .map((n) => Math.hypot(pos.get(n.id)!.x - centre.x, pos.get(n.id)!.y - centre.y));
      for (const d of distances) expect(d).toBeCloseTo(distances[0]);
    });
  });

  describe("groups", () => {
    it("sorts each type block alphabetically, row-major", () => {
      const nodes = [
        makeNode("z", "services", "worker", "Zeta"),
        makeNode("a", "services", "worker", "alpha"),
        makeNode("m", "services", "worker", "Mid"),
      ];
      const pos = positionsById("groups", nodes);
      const a = pos.get("a")!;
      const m = pos.get("m")!;
      const z = pos.get("z")!;
      // Three nodes use two columns: alpha, Mid on the first row, Zeta below.
      expect(m.x).toBeGreaterThan(a.x);
      expect(m.y).toBe(a.y);
      expect(z.x).toBe(a.x);
      expect(z.y).toBeGreaterThan(a.y);
    });

    it("puts client left of api in one row and starts a second row for services", () => {
      const nodes = [
        makeNode("svc", "services", "worker"),
        makeNode("api", "api", "rest-api"),
        makeNode("cdn", "infrastructure", "cdn"),
        makeNode("web", "client"),
      ];
      const pos = positionsById("groups", nodes);
      expect(pos.get("web")!.x).toBeLessThan(pos.get("api")!.x);
      expect(pos.get("web")!.y).toBe(pos.get("api")!.y);
      expect(pos.get("svc")!.y).toBeGreaterThan(pos.get("api")!.y);
    });
  });

  it("puts notes in a column right of every other node in every layout", () => {
    const { nodes, edges } = mixedMap();
    for (const layout of MAP_LAYOUTS) {
      const pos = positionsById(layout, nodes, edges);
      const rightmost = Math.max(
        ...nodes.filter((n) => n.category !== "note").map((n) => pos.get(n.id)!.x + 200)
      );
      for (const note of nodes.filter((n) => n.category === "note")) {
        expect(pos.get(note.id)!.x).toBeGreaterThan(rightmost);
      }
    }
  });

  it("never overlaps node slots", () => {
    const { nodes, edges } = mixedMap();
    for (const layout of MAP_LAYOUTS) {
      const slots = [...positionsById(layout, nodes, edges).values()];
      for (let i = 0; i < slots.length; i += 1) {
        for (let j = i + 1; j < slots.length; j += 1) {
          expect(overlaps(slots[i], slots[j]), `${layout} ${i}/${j}`).toBe(false);
        }
      }
    }
  });

  it("keeps fixed positions and lays the rest out around them", () => {
    const nodes = [makeNode("a", "client"), makeNode("b", "api", "rest-api")];
    const result = applyMapLayout(
      "tiers",
      nodes,
      [makeEdge("a", "b")],
      new Map([["a", { x: 500, y: 500 }]])
    );
    expect(result.find((p) => p.id === "a")!.position).toEqual({ x: 500, y: 500 });
    expect(result.find((p) => p.id === "b")!.position).toEqual({ x: 500, y: 700 });
  });
});
