import { describe, expect, it } from "vitest";
import { CANVAS_EVIDENCE_LIMITS } from "@/lib/canvas-limits";
import { applyEvidencePolicy } from "@/lib/node-evidence";
import type { StackArchitecture, StackNode } from "@/types/stack";

function node(id: string, evidence?: string[]): StackNode {
  return {
    id,
    category: "api",
    subtype: "rest-api",
    name: id,
    technology: "",
    description: "",
    reasoning: "",
    locked: false,
    ...(evidence ? { evidence } : {}),
  };
}

function map(...nodes: StackNode[]): StackArchitecture {
  return { nodes, edges: [] };
}

describe("applyEvidencePolicy", () => {
  it("lets a scan cite only the files it listed", () => {
    const citable = new Set(["src/api.ts", "package.json"]);
    const result = applyEvidencePolicy(
      map(
        node("api", ["./src/api.ts", "src/invented.ts", "src/api.ts", "../outside.ts"]),
        node("db", ["src/invented.ts"])
      ),
      map(node("api", ["old/path.ts"])),
      citable
    );

    expect(result.nodes.map((item) => item.evidence)).toEqual([["src/api.ts"], undefined]);
    expect(Object.hasOwn(result.nodes[1], "evidence")).toBe(false);
  });

  it("caps the paths one node may cite", () => {
    const paths = Array.from({ length: 20 }, (_, index) => `src/file-${index}.ts`);
    const result = applyEvidencePolicy(map(node("api", paths)), null, new Set(paths));

    expect(result.nodes[0].evidence).toEqual(paths.slice(0, CANVAS_EVIDENCE_LIMITS.pathsPerNode));
  });

  it("keeps a node's paths through a chat edit that omits them and rejects invented ones", () => {
    const current = map(node("api", ["src/api.ts"]), node("db", ["prisma/schema.prisma"]));
    const result = applyEvidencePolicy(
      map(
        node("api"),
        node("db", ["prisma/schema.prisma", "src/made-up.ts"]),
        node("worker", ["src/api.ts", "src/worker.ts"])
      ),
      current,
      null
    );

    expect(result.nodes.map((item) => item.evidence)).toEqual([
      ["src/api.ts"],
      ["prisma/schema.prisma"],
      ["src/api.ts"],
    ]);
  });
});
