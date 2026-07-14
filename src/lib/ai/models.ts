export const DEFAULT_AI_MODEL = "claude-sonnet-5";

export const AI_MODELS = [
  { id: DEFAULT_AI_MODEL, name: "Sonnet 5" },
  { id: "claude-opus-4-8", name: "Opus 4.8" },
  { id: "claude-haiku-4-5-20251001", name: "Haiku 4.5" },
] as const;

export type AiModelId = (typeof AI_MODELS)[number]["id"];

export const AI_MODEL_IDS = AI_MODELS.map((model) => model.id) as [AiModelId, ...AiModelId[]];

export function isSupportedAiModel(value: string | undefined): value is AiModelId {
  return AI_MODEL_IDS.includes(value as AiModelId);
}

export function normalizeAiModel(value: string | undefined): AiModelId {
  return isSupportedAiModel(value) ? value : DEFAULT_AI_MODEL;
}

export function modelSupportsEffort(model: AiModelId) {
  return model !== "claude-haiku-4-5-20251001";
}
