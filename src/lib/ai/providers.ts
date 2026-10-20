/**
 * The AI providers StackHatch calls directly from the browser. Every `origin`
 * here must also appear in CONNECT_ORIGINS (scripts/static-policy.mjs); the
 * static policy test fails when the two drift apart.
 */
export const AI_PROVIDER_IDS = ["anthropic", "openai", "gemini", "openrouter"] as const;

export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

/** Anthropic speaks its Messages API; the others speak OpenAI Chat Completions. */
export type AiProviderProtocol = "anthropic-messages" | "chat-completions";

export interface AiModelOption {
  id: string;
  name: string;
}

export interface AiProviderDefinition {
  id: AiProviderId;
  name: string;
  protocol: AiProviderProtocol;
  /** The exact API origin, and the only place this provider's key is sent. */
  origin: string;
  /** Path of the streaming chat endpoint on `origin`. */
  endpointPath: string;
  /** The prefix every key from this provider starts with. */
  keyPrefix: string;
  keyPattern: RegExp;
  keysUrl: string;
  defaultModel: string;
  /** Suggestions only: any model id the provider accepts can be entered. */
  models: readonly AiModelOption[];
}

export const AI_PROVIDERS: Readonly<Record<AiProviderId, AiProviderDefinition>> = {
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    protocol: "anthropic-messages",
    origin: "https://api.anthropic.com",
    endpointPath: "/v1/messages",
    keyPrefix: "sk-ant-",
    keyPattern: /^sk-ant-\S+$/,
    keysUrl: "https://console.anthropic.com/settings/keys",
    defaultModel: "claude-sonnet-5",
    models: [
      { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
      { id: "claude-opus-4-8", name: "Claude Opus 4.8" },
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
    ],
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    protocol: "chat-completions",
    origin: "https://api.openai.com",
    endpointPath: "/v1/chat/completions",
    keyPrefix: "sk-",
    // Anthropic and OpenRouter keys also start with sk-; they are not OpenAI keys.
    keyPattern: /^sk-(?!ant-|or-)\S+$/,
    keysUrl: "https://platform.openai.com/api-keys",
    defaultModel: "gpt-6.1-sol",
    models: [
      { id: "gpt-6.1-sol", name: "GPT-6.1 Sol" },
      { id: "gpt-6-astra", name: "GPT-6 Astra" },
      { id: "gpt-6-luna", name: "GPT-6 Luna" },
    ],
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    protocol: "chat-completions",
    origin: "https://generativelanguage.googleapis.com",
    endpointPath: "/v1beta/openai/chat/completions",
    // AI Studio issues AQ. auth keys; older restricted standard keys start with AIza.
    keyPrefix: "AQ.",
    keyPattern: /^(?:AQ\.|AIza)\S+$/,
    keysUrl: "https://aistudio.google.com/apikey",
    defaultModel: "gemini-3.8-flash",
    models: [
      { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash" },
      { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro (preview)" },
      { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash-Lite" },
    ],
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    protocol: "chat-completions",
    origin: "https://openrouter.ai",
    endpointPath: "/api/v1/chat/completions",
    keyPrefix: "sk-or-",
    keyPattern: /^sk-or-\S+$/,
    keysUrl: "https://openrouter.ai/settings/keys",
    defaultModel: "deepseek/deepseek-v4-pro",
    models: [
      { id: "deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro" },
      { id: "moonshotai/kimi-k3", name: "Kimi K3" },
      { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5" },
      { id: "openai/gpt-6.1-sol", name: "GPT-6.1 Sol" },
      { id: "google/gemini-3.8-flash", name: "Gemini 3.8 Flash" },
    ],
  },
};

/** The provider and model one AI request is sent to. */
export interface AiModelSelection {
  provider: AiProviderId;
  model: string;
}

/** Leaves room for the provider prefix inside the 200-character stored preference. */
export const AI_MODEL_ID_MAX_LENGTH = 160;

export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === "string" && (AI_PROVIDER_IDS as readonly string[]).includes(value);
}

/** A usable model id, or null. Ids are opaque to StackHatch; only the shape is checked. */
export function normalizeModelId(value: string): string | null {
  const model = value.trim();
  return model.length > 0 && model.length <= AI_MODEL_ID_MAX_LENGTH && !/[\s\p{Cc}]/u.test(model)
    ? model
    : null;
}

export function defaultModelSelection(provider: AiProviderId): AiModelSelection {
  return { provider, model: AI_PROVIDERS[provider].defaultModel };
}

export const DEFAULT_AI_SELECTION = defaultModelSelection("anthropic");

/** The stored form of a selection: `provider:model`, e.g. `openrouter:moonshotai/kimi-k3`. */
export function formatModelReference(selection: AiModelSelection): string {
  return `${selection.provider}:${selection.model}`;
}

export const DEFAULT_AI_MODEL_REFERENCE = formatModelReference(DEFAULT_AI_SELECTION);

/**
 * Reads the stored model preference. Before providers could be chosen it held a
 * bare Anthropic model id, so an unprefixed value still means Anthropic.
 */
export function parseModelReference(value: string | null | undefined): AiModelSelection {
  const reference = value?.trim() ?? "";
  const separator = reference.indexOf(":");
  if (separator > 0) {
    const provider = reference.slice(0, separator);
    if (isAiProviderId(provider)) {
      const model = normalizeModelId(reference.slice(separator + 1));
      return model ? { provider, model } : defaultModelSelection(provider);
    }
  }
  const legacyModel = normalizeModelId(reference);
  return legacyModel ? { provider: "anthropic", model: legacyModel } : DEFAULT_AI_SELECTION;
}

/**
 * A local shape check, not a verification that the provider will accept the
 * key. Returns the message to show, or null when the key looks right.
 */
export function providerKeyShapeError(provider: AiProviderId, value: string): string | null {
  const key = value.trim();
  const definition = AI_PROVIDERS[provider];
  if (definition.keyPattern.test(key)) return null;
  const owner = AI_PROVIDER_IDS.find((id) => AI_PROVIDERS[id].keyPattern.test(key));
  if (owner) {
    const ownerName = AI_PROVIDERS[owner].name;
    return `That key belongs to ${ownerName}. Choose ${ownerName} as the provider, or enter your ${definition.name} key.`;
  }
  return `Enter your ${definition.name} API key. It starts with ${definition.keyPrefix}`;
}
