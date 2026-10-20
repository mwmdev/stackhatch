import { ProviderError, normalizeProviderError } from "@/lib/ai/provider-errors";
import {
  finishProviderStream,
  isUsableApiKey,
  type ProviderStreamClient,
  type ProviderStreamResult,
} from "@/lib/ai/provider-stream";
import type { AiProviderDefinition } from "@/lib/ai/providers";

interface ChatCompletionsClientOptions {
  fetch?: typeof globalThis.fetch;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Yields the `data` payload of each server-sent event in the body. */
async function* serverSentEventData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let data: string[] = [];
  let finished = false;
  try {
    while (!finished) {
      const { done, value } = await reader.read();
      finished = done;
      buffer += decoder.decode(value, { stream: !done });
      // A CR that ends this read may be the first half of a CRLF split across
      // reads, so it only terminates a line once more text or the end arrives.
      const lines = buffer.split(done ? /\r\n|\n|\r/ : /\r\n|\n|\r(?!$)/);
      buffer = done ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        if (line === "") {
          if (data.length > 0) yield data.join("\n");
          data = [];
        } else if (line === "data" || line.startsWith("data:")) {
          const payload = line.slice(5);
          data.push(payload.startsWith(" ") ? payload.slice(1) : payload);
        }
        // Comments (": keep-alive") and other fields carry nothing to keep.
      }
    }
    if (data.length > 0) yield data.join("\n");
  } finally {
    if (!finished) await reader.cancel().catch(() => undefined);
  }
}

/** Carries what normalizeProviderError classifies: status, headers and the error body. */
class ProviderResponseFailure extends Error {
  constructor(
    readonly status: number | null,
    readonly error: unknown,
    readonly headers: Headers = new Headers()
  ) {
    super("The provider returned an error.");
    this.name = "ProviderResponseFailure";
  }
}

async function httpFailure(response: Response) {
  let body: unknown = null;
  try {
    const parsed: unknown = JSON.parse(await response.text());
    // Gemini wraps its error object in an array.
    body = Array.isArray(parsed) ? parsed[0] : parsed;
  } catch {
    // A non-JSON error body is classified by its status alone.
  }
  return new ProviderResponseFailure(response.status, body, response.headers);
}

/**
 * Streams from a provider's OpenAI Chat Completions endpoint. The URL is fixed
 * by the provider definition, the key travels only in the Authorization header,
 * and redirects are refused so the key cannot follow one.
 *
 * No output-token cap is sent: reasoning models count hidden reasoning against
 * it, so any fixed cap that bounds a map would also truncate some models. The
 * prompts bound the visible output instead.
 */
export function createChatCompletionsClient(
  provider: AiProviderDefinition,
  options: ChatCompletionsClientOptions = {}
): ProviderStreamClient {
  const endpoint = `${provider.origin}${provider.endpointPath}`;

  return {
    async stream(request): Promise<ProviderStreamResult> {
      const cancelled = (requestId: string | null = null) =>
        new ProviderError("aborted", `The ${provider.name} request was cancelled.`, { requestId });
      if (!isUsableApiKey(request.apiKey)) {
        throw new ProviderError(
          "authentication",
          `Enter your ${provider.name} API key before starting this request.`
        );
      }
      if (request.signal?.aborted) throw cancelled();

      const body = JSON.stringify({
        model: request.model,
        stream: true,
        messages: [
          ...(request.system ? [{ role: "system", content: request.system }] : []),
          ...request.messages,
        ],
      });
      if (body.includes(request.apiKey)) {
        throw new ProviderError(
          "invalid_request",
          `This conversation contains your ${provider.name} API key, so it was not sent. Remove the key and try again.`
        );
      }

      let requestId: string | null = null;
      try {
        const fetchImplementation = options.fetch ?? globalThis.fetch;
        let response: Response;
        try {
          response = await fetchImplementation(endpoint, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${request.apiKey}`,
              "Content-Type": "application/json",
            },
            body,
            signal: request.signal,
            credentials: "omit",
            redirect: "error",
            referrerPolicy: "no-referrer",
            cache: "no-store",
          });
        } catch (error) {
          if (request.signal?.aborted) throw error;
          // Browsers hide why a cross-origin request failed. OpenAI answers a
          // rejected key without CORS headers, so a bad key also lands here.
          throw new ProviderError(
            "transient",
            `${provider.name} could not be reached. Check your connection and API key, then try again.`,
            { retryable: true }
          );
        }
        requestId = response.headers.get("x-request-id") ?? response.headers.get("request-id");
        if (!response.ok) throw await httpFailure(response);
        if (!response.body) {
          throw new ProviderError(
            "transient",
            `${provider.name} returned an empty response. Try again.`,
            { retryable: true, requestId }
          );
        }

        let text = "";
        let finishReason: string | null = null;
        for await (const data of serverSentEventData(response.body)) {
          if (request.signal?.aborted) throw cancelled(requestId);
          if (data === "[DONE]") break;
          let chunk: Record<string, unknown> | null;
          try {
            chunk = asRecord(JSON.parse(data));
          } catch {
            continue;
          }
          if (!chunk) continue;
          // OpenRouter reports a failure that starts after the 200 inside the stream.
          const streamError = asRecord(chunk.error);
          if (streamError) {
            throw new ProviderResponseFailure(
              typeof streamError.code === "number" ? streamError.code : null,
              chunk
            );
          }
          requestId ??= typeof chunk.id === "string" ? chunk.id : null;
          const choice = asRecord(Array.isArray(chunk.choices) ? chunk.choices[0] : null);
          const delta = asRecord(choice?.delta);
          if (typeof delta?.content === "string" && delta.content) {
            text += delta.content;
            request.onText?.(text, delta.content);
          }
          if (typeof choice?.finish_reason === "string") finishReason = choice.finish_reason;
        }

        return finishProviderStream(provider.name, request, {
          text,
          truncated: finishReason === "length",
          requestId,
        });
      } catch (error) {
        if (request.signal?.aborted && !(error instanceof ProviderError))
          throw cancelled(requestId);
        throw normalizeProviderError(error, { providerName: provider.name, requestId });
      }
    },
  };
}
