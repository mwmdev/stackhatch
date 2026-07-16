import { describe, expect, it } from "vitest";
import { CURATED_STARTER_TEMPLATES } from "./starter-templates";

describe("CURATED_STARTER_TEMPLATES", () => {
  it("provides three unique, valid architecture maps", () => {
    expect(CURATED_STARTER_TEMPLATES).toHaveLength(3);
    expect(new Set(CURATED_STARTER_TEMPLATES.map((template) => template.id)).size).toBe(3);

    for (const template of CURATED_STARTER_TEMPLATES) {
      expect(template.id).toMatch(/^curated-/);
      expect(template.name).not.toBe("");
      expect(template.description).not.toBe("");

      const canvas = JSON.parse(template.canvasState) as {
        nodes: Array<{ id: string }>;
        edges: Array<{ source: string; target: string }>;
      };
      const nodeIds = new Set(canvas.nodes.map((node) => node.id));

      expect(canvas.nodes.length).toBeGreaterThanOrEqual(3);
      expect(canvas.edges.length).toBeGreaterThanOrEqual(2);
      for (const edge of canvas.edges) {
        expect(nodeIds.has(edge.source)).toBe(true);
        expect(nodeIds.has(edge.target)).toBe(true);
      }
    }
  });
});
