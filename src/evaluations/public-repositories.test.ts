import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface EvaluationFixture {
  repository: string;
  commitSha: string;
  expectedMainComponents: string[];
  generatedComponents: string[];
  generatedConnections: string[];
  score: {
    mainComponentCoverage: {
      matched: number;
      expected: number;
      percent: number;
      missing: string[];
    };
    unsupportedComponents: Array<{ id: string; reason: string }>;
    incorrectConnections: Array<{ id: string; reason: string }>;
  };
}

describe("public repository evaluation fixtures", () => {
  it("pins reproducible revisions and records all required manual scores", () => {
    const document = JSON.parse(
      readFileSync(resolve(process.cwd(), "evaluations/public-repositories.json"), "utf8")
    ) as { schemaVersion: number; model: string; fixtures: EvaluationFixture[] };

    expect(document.schemaVersion).toBe(1);
    expect(document.model).toBe("claude-sonnet-5");
    expect(document.fixtures).toHaveLength(2);

    for (const fixture of document.fixtures) {
      expect(fixture.repository).toMatch(/^[\w.-]+\/[\w.-]+$/);
      expect(fixture.commitSha).toMatch(/^[a-f0-9]{40}$/);
      expect(fixture.expectedMainComponents.length).toBeGreaterThan(0);
      expect(fixture.generatedComponents.length).toBeGreaterThan(0);
      expect(fixture.generatedConnections.length).toBeGreaterThan(0);
      expect(fixture.score.mainComponentCoverage.expected).toBe(
        fixture.expectedMainComponents.length
      );
      expect(fixture.score.mainComponentCoverage.matched).toBeLessThanOrEqual(
        fixture.score.mainComponentCoverage.expected
      );
      expect(fixture.score.mainComponentCoverage.percent).toBe(
        Math.round(
          (fixture.score.mainComponentCoverage.matched /
            fixture.score.mainComponentCoverage.expected) *
            100
        )
      );
      for (const finding of [
        ...fixture.score.unsupportedComponents,
        ...fixture.score.incorrectConnections,
      ]) {
        expect(finding.id).not.toBe("");
        expect(finding.reason.length).toBeGreaterThan(20);
      }
    }
  });
});
