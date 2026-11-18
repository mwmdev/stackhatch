import { describe, expect, it } from "vitest";
import { containsLikelySecret } from "./secrets";

describe("containsLikelySecret", () => {
  it("flags credential values", () => {
    const samples = [
      ["-----BEGIN RSA", " PRIVATE KEY-----"].join(""),
      "AKIA" + "ABCDEFGHIJKLMNOP",
      "ghp_" + "a".repeat(24),
      "sk-ant-" + "a".repeat(24),
      "sk-proj-" + "a".repeat(24),
      "sk-or-v1-" + "ab".repeat(12),
      "AIza" + "a".repeat(35),
      "AQ." + "a".repeat(40),
      "xoxb-" + "1234567890",
    ];
    for (const sample of samples) expect(containsLikelySecret(`token = "${sample}"`)).toBe(true);
  });

  it("ignores ordinary source", () => {
    expect(containsLikelySecret("const key = process.env.API_KEY;")).toBe(false);
    expect(containsLikelySecret("sk-short")).toBe(false);
  });
});
