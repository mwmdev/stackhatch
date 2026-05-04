export const DEFAULT_AI_MODEL = "claude-sonnet-4-20250514";

export const AI_MODELS = [
  { id: DEFAULT_AI_MODEL, name: "Sonnet 4" },
  { id: "claude-opus-4-20250514", name: "Opus 4" },
  { id: "claude-opus-4-1-20250805", name: "Opus 4.1" },
] as const;

export type AiModelId = (typeof AI_MODELS)[number]["id"];

export const AI_MODEL_IDS = AI_MODELS.map((model) => model.id) as [AiModelId, ...AiModelId[]];

export function isSupportedAiModel(value: string | undefined): value is AiModelId {
  return AI_MODEL_IDS.includes(value as AiModelId);
}

export function normalizeAiModel(value: string | undefined): AiModelId {
  return isSupportedAiModel(value) ? value : DEFAULT_AI_MODEL;
}
