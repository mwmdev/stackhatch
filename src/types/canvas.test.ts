import { describe, it, expect } from "vitest";
import {
  toReactFlowNodes,
  toReactFlowEdges,
  fromReactFlowNodes,
  fromReactFlowEdges,
} from "./canvas";
import type { StackNode, StackEdge } from "./stack";

const sampleNodes: StackNode[] = [
  {
    id: "node-1",
    category: "client",
    subtype: "web-app",
    name: "React Frontend",
    technology: "React 19",
    description: "Main web application",
    reasoning: "Modern SPA framework",
    locked: false,
  },
  {
    id: "node-2",
    category: "data",
    subtype: "sql-db",
    name: "PostgreSQL Database",
    technology: "PostgreSQL 16",
    description: "Primary data store",
    reasoning: "Reliable relational DB",
    locked: true,
  },
];

const sampleEdges: StackEdge[] = [
  {
    id: "edge-1",
    source: "node-1",
    target: "node-2",
    connectionType: "http",
    label: "REST API calls",
  },
  {
    id: "edge-2",
    source: "node-1",
    target: "node-2",
    connectionType: "websocket",
    label: "Real-time updates",
  },
];

describe("toReactFlowNodes", () => {
  it("converts domain nodes to React Flow format", () => {
    const rfNodes = toReactFlowNodes(sampleNodes);
    expect(rfNodes).toHaveLength(2);
    expect(rfNodes[0]).toEqual({
      id: "node-1",
      type: "stackNode",
      position: { x: 0, y: 0 },
      data: {
        category: "client",
        subtype: "web-app",
        name: "React Frontend",
        technology: "React 19",
        description: "Main web application",
        reasoning: "Modern SPA framework",
        locked: false,
      },
    });
  });

  it("uses provided positions", () => {
    const positions = new Map([
      ["node-1", { x: 100, y: 200 }],
      ["node-2", { x: 300, y: 400 }],
    ]);
    const rfNodes = toReactFlowNodes(sampleNodes, positions);
    expect(rfNodes[0].position).toEqual({ x: 100, y: 200 });
    expect(rfNodes[1].position).toEqual({ x: 300, y: 400 });
  });

  it("defaults to (0,0) when position not in map", () => {
    const positions = new Map([["node-1", { x: 50, y: 50 }]]);
    const rfNodes = toReactFlowNodes(sampleNodes, positions);
    expect(rfNodes[1].position).toEqual({ x: 0, y: 0 });
  });

  it("returns empty array for empty input", () => {
    expect(toReactFlowNodes([])).toEqual([]);
  });

  it("preserves note color data", () => {
    const [rfNode] = toReactFlowNodes([
      {
        id: "note-1",
        category: "note",
        subtype: "note",
        name: "Decision note",
        technology: "",
        description: "Keep this visible.",
        reasoning: "",
        locked: false,
        noteColor: "lilac",
      },
    ]);

    expect(rfNode.data.noteColor).toBe("lilac");
    expect(fromReactFlowNodes([rfNode])[0].noteColor).toBe("lilac");
  });
});

describe("toReactFlowEdges", () => {
  it("converts domain edges to React Flow format", () => {
    const rfEdges = toReactFlowEdges(sampleEdges);
    expect(rfEdges).toHaveLength(2);
    expect(rfEdges[0]).toEqual({
      id: "edge-1",
      type: "stackEdge",
      source: "node-1",
      target: "node-2",
      data: {
        connectionType: "http",
        label: "REST API calls",
      },
    });
  });

  it("returns empty array for empty input", () => {
    expect(toReactFlowEdges([])).toEqual([]);
  });
});

describe("fromReactFlowNodes", () => {
  it("converts React Flow nodes back to domain format", () => {
    const rfNodes = toReactFlowNodes(sampleNodes);
    const domainNodes = fromReactFlowNodes(rfNodes);
    expect(domainNodes).toEqual(sampleNodes);
  });
});

describe("fromReactFlowEdges", () => {
  it("converts React Flow edges back to domain format", () => {
    const rfEdges = toReactFlowEdges(sampleEdges);
    const domainEdges = fromReactFlowEdges(rfEdges);
    expect(domainEdges).toEqual(sampleEdges);
  });
});

describe("round-trip conversions", () => {
  it("nodes survive StackNode → ReactFlowNode → StackNode", () => {
    const rfNodes = toReactFlowNodes(sampleNodes);
    const roundTripped = fromReactFlowNodes(rfNodes);
    expect(roundTripped).toEqual(sampleNodes);
  });

  it("edges survive StackEdge → ReactFlowEdge → StackEdge", () => {
    const rfEdges = toReactFlowEdges(sampleEdges);
    const roundTripped = fromReactFlowEdges(rfEdges);
    expect(roundTripped).toEqual(sampleEdges);
  });

  it("preserves all connection types through round-trip", () => {
    const allTypes: StackEdge[] = [
      { id: "e1", source: "a", target: "b", connectionType: "http", label: "HTTP" },
      { id: "e2", source: "a", target: "b", connectionType: "websocket", label: "WS" },
      { id: "e3", source: "a", target: "b", connectionType: "grpc", label: "gRPC" },
      { id: "e4", source: "a", target: "b", connectionType: "tcp", label: "TCP" },
      { id: "e5", source: "a", target: "b", connectionType: "pub-sub", label: "PS" },
      { id: "e6", source: "a", target: "b", connectionType: "file-io", label: "FIO" },
    ];
    const roundTripped = fromReactFlowEdges(toReactFlowEdges(allTypes));
    expect(roundTripped).toEqual(allTypes);
  });

  it("preserves all node categories through round-trip", () => {
    const allCategories: StackNode[] = [
      { id: "n1", category: "client", subtype: "web-app", name: "A", technology: "", description: "", reasoning: "", locked: false },
      { id: "n2", category: "api", subtype: "rest-api", name: "B", technology: "", description: "", reasoning: "", locked: false },
      { id: "n3", category: "services", subtype: "auth", name: "C", technology: "", description: "", reasoning: "", locked: true },
      { id: "n4", category: "data", subtype: "sql-db", name: "D", technology: "", description: "", reasoning: "", locked: false },
      { id: "n5", category: "infrastructure", subtype: "cdn", name: "E", technology: "", description: "", reasoning: "", locked: true },
      { id: "n6", category: "external", subtype: "third-party-api", name: "F", technology: "", description: "", reasoning: "", locked: false },
      { id: "n7", category: "note", subtype: "note", name: "G", technology: "", description: "", reasoning: "", locked: false, noteColor: "sky" },
    ];
    const roundTripped = fromReactFlowNodes(toReactFlowNodes(allCategories));
    expect(roundTripped).toEqual(allCategories);
  });
});
