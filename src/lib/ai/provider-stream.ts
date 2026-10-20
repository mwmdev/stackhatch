import type { ProviderMessage } from "@/lib/ai/context-builder";
import { parseAIResponse, type ParsedAIResponse } from "@/lib/ai/output-parser";
import { ProviderError } from "@/lib/ai/provider-errors";

export type { ProviderMessage } from "@/lib/ai/context-builder";

/** One streamed request to a provider whose origin the client already fixes. */
export interface ProviderStreamRequest {
  apiKey: string;
  model: string;
  messages: ProviderMessage[];
  system?: string;
  maxTokens?: number;
  signal?: AbortSignal;
  requireArchitecture?: boolean;
  allowNoteNodes?: boolean;
  onText?: (text: string, delta: string) => void;
}

export interface ProviderStreamResult extends ParsedAIResponse {
  text: string;
  requestId: string | null;
}

export interface ProviderStreamClient {
  stream(request: ProviderStreamRequest): Promise<ProviderStreamResult>;
}

export function isUsableApiKey(apiKey: string): boolean {
  return apiKey.trim().length > 0 && apiKey.length <= 512;
}

/** Parses the streamed text and enforces a map when the request requires one. */
export function finishProviderStream(
  providerName: string,
  request: ProviderStreamRequest,
  stream: { text: string; truncated: boolean; requestId: string | null }
): ProviderStreamResult {
  const parsed = parseAIResponse(stream.text, { allowNoteNodes: request.allowNoteNodes });
  if (request.requireArchitecture && !parsed.architecture) {
    throw new ProviderError(
      "invalid_output",
      stream.truncated
        ? `${providerName}'s response was cut off before the map was complete. The previous map was preserved.`
        : `${providerName} returned an invalid architecture. The previous map was preserved.`,
      { requestId: stream.requestId }
    );
  }
  return {
    text: stream.text,
    message: parsed.message,
    architecture: parsed.architecture,
    requestId: stream.requestId,
  };
}
