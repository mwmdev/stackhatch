import { describe, expect, it } from "vitest";
import {
  AI_PROVIDERS,
  DEFAULT_AI_SELECTION,
  formatModelReference,
  parseModelReference,
  providerKeyShapeError,
} from "@/lib/ai/providers";

describe("model references", () => {
  it.each([
    ["openai:gpt-6-luna", { provider: "openai", model: "gpt-6-luna" }],
    // OpenRouter ids carry their own colon for variants such as :free.
    [
      "openrouter:meta-llama/llama-3.3-70b-instruct:free",
      { provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free" },
    ],
    // Stored before providers could be chosen: a bare Anthropic model id.
    ["claude-opus-4-8", { provider: "anthropic", model: "claude-opus-4-8" }],
    ["gemini:", { provider: "gemini", model: AI_PROVIDERS.gemini.defaultModel }],
    ["openai:has space", { provider: "openai", model: AI_PROVIDERS.openai.defaultModel }],
    ["", DEFAULT_AI_SELECTION],
    [null, DEFAULT_AI_SELECTION],
  ] as const)("reads %j", (stored, selection) => {
    expect(parseModelReference(stored)).toEqual(selection);
  });

  it("round-trips every suggested model of every provider", () => {
    for (const provider of Object.values(AI_PROVIDERS)) {
      for (const model of provider.models) {
        const selection = { provider: provider.id, model: model.id };
        expect(parseModelReference(formatModelReference(selection))).toEqual(selection);
      }
    }
  });
});

describe("providerKeyShapeError", () => {
  it.each([
    ["anthropic", "sk-ant-api03-abc"],
    ["openai", "sk-proj-abc"],
    // AI Studio has issued AQ. auth keys since May 2026; restricted AIza keys still work.
    ["gemini", "AQ.Ab8RN6LxExample"],
    ["gemini", "AIzaSyExample"],
    ["openrouter", "sk-or-v1-abc"],
  ] as const)("accepts a %s key", (provider, key) => {
    expect(providerKeyShapeError(provider, key)).toBeNull();
  });

  it.each([
    ["openai", "sk-ant-api03-abc", "That key belongs to Anthropic"],
    ["openai", "sk-or-v1-abc", "That key belongs to OpenRouter"],
    ["anthropic", "AQ.Ab8RN6LxExample", "That key belongs to Google Gemini"],
  ] as const)("names the provider a %s field was given a key for", (provider, key, message) => {
    expect(providerKeyShapeError(provider, key)).toContain(message);
  });

  it("states the expected prefix for an unrecognised key", () => {
    expect(providerKeyShapeError("gemini", "hello")).toBe(
      "Enter your Google Gemini API key. It starts with AQ."
    );
  });
});
