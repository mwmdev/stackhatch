import Anthropic, { type ClientOptions } from "@anthropic-ai/sdk";
import type { ProviderMessage } from "@/lib/ai/context-builder";
import { parseAIResponse, type ParsedAIResponse } from "@/lib/ai/output-parser";
import { ProviderError, normalizeProviderError } from "@/lib/ai/provider-errors";

export const ANTHROPIC_API_ORIGIN = "https://api.anthropic.com";

export type { ProviderMessage } from "@/lib/ai/context-builder";

interface AnthropicBrowserStreamEvent {
  type: string;
  delta?: unknown;
  [key: string]: unknown;
}

export interface AnthropicBrowserSdkStream extends AsyncIterable<AnthropicBrowserStreamEvent> {
  readonly request_id?: string | null;
  abort(): void;
}

export interface AnthropicBrowserSdkClient {
  messages: {
    stream(
      body: {
        model: string;
        max_tokens: number;
        messages: ProviderMessage[];
        system?: string;
      },
      options?: { signal?: AbortSignal }
    ): AnthropicBrowserSdkStream;
  };
}

export type AnthropicBrowserClientFactory = (options: ClientOptions) => AnthropicBrowserSdkClient;

export interface BrowserAnthropicClientOptions {
  fetch?: typeof globalThis.fetch;
  clientFactory?: AnthropicBrowserClientFactory;
}

export interface BrowserAnthropicRequest {
  apiKey: string;
  model: string;
  messages: ProviderMessage[];
  system?: string;
  maxTokens?: number;
  signal?: AbortSignal;
  requireArchitecture?: boolean;
  allowNoteNodes?: boolean;
}

export interface BrowserAnthropicResult extends ParsedAIResponse {
  text: string;
  requestId: string | null;
}

export interface BrowserAnthropicClient {
  stream(request: BrowserAnthropicRequest): Promise<BrowserAnthropicResult>;
}

function exactOriginFetch(
  apiKey: string,
  fetchImplementation: typeof globalThis.fetch
): typeof globalThis.fetch {
  return async (input, init) => {
    const request = new Request(input, {
      ...init,
      credentials: "omit",
      redirect: "manual",
      referrerPolicy: "no-referrer",
    });
    const url = new URL(request.url);
    if (
      url.origin !== ANTHROPIC_API_ORIGIN ||
      url.pathname !== "/v1/messages" ||
      url.search ||
      url.hash ||
      request.method !== "POST"
    ) {
      throw new Error("Anthropic request origin was refused.");
    }

    for (const [name, value] of request.headers) {
      if (value.includes(apiKey) && name !== "x-api-key") {
        throw new Error("Anthropic credential placement was refused.");
      }
    }
    if (request.headers.get("x-api-key") !== apiKey) {
      throw new Error("Anthropic credential header was missing.");
    }

    if (request.body) {
      const body = typeof init?.body === "string" ? init.body : await request.clone().text();
      if (body.includes(apiKey)) {
        throw new Error("Anthropic credential placement was refused.");
      }
    }

    const response = await fetchImplementation(request);
    const responseOrigin = response.url ? new URL(response.url).origin : ANTHROPIC_API_ORIGIN;
    if (
      response.redirected ||
      (response.status >= 300 && response.status < 400) ||
      responseOrigin !== ANTHROPIC_API_ORIGIN
    ) {
      throw new Error("Anthropic response origin was refused.");
    }
    return response;
  };
}

function defaultClientFactory(options: ClientOptions): AnthropicBrowserSdkClient {
  return new Anthropic(options) as unknown as AnthropicBrowserSdkClient;
}

function validApiKey(apiKey: string): boolean {
  return apiKey.trim().length > 0 && apiKey.length <= 512;
}

export function createBrowserAnthropicClient(
  options: BrowserAnthropicClientOptions = {}
): BrowserAnthropicClient {
  const clientFactory = options.clientFactory ?? defaultClientFactory;

  return {
    async stream(request): Promise<BrowserAnthropicResult> {
      if (!validApiKey(request.apiKey)) {
        throw new ProviderError(
          "authentication",
          "Enter an Anthropic API key before starting this request."
        );
      }
      if (request.signal?.aborted) {
        throw new ProviderError("aborted", "The Anthropic request was cancelled.");
      }

      let stream: AnthropicBrowserSdkStream | null = null;
      let requestId: string | null = null;
      const abortStream = () => stream?.abort();

      try {
        const fetchImplementation = options.fetch ?? globalThis.fetch;
        const client = clientFactory({
          apiKey: request.apiKey,
          authToken: null,
          baseURL: ANTHROPIC_API_ORIGIN,
          dangerouslyAllowBrowser: true,
          fetch: exactOriginFetch(request.apiKey, fetchImplementation),
          maxRetries: 0,
          logLevel: "off",
        });

        stream = client.messages.stream(
          {
            model: request.model,
            max_tokens: request.maxTokens ?? 8_192,
            messages: request.messages,
            ...(request.system ? { system: request.system } : {}),
          },
          { signal: request.signal }
        );
        request.signal?.addEventListener("abort", abortStream, { once: true });
        if (request.signal?.aborted) {
          stream.abort();
          throw new ProviderError("aborted", "The Anthropic request was cancelled.", {
            requestId: stream.request_id ?? null,
          });
        }

        let text = "";
        for await (const event of stream) {
          requestId = stream.request_id ?? requestId;
          if (request.signal?.aborted) {
            throw new ProviderError("aborted", "The Anthropic request was cancelled.", {
              requestId,
            });
          }
          const delta =
            typeof event.delta === "object" && event.delta !== null
              ? (event.delta as Record<string, unknown>)
              : null;
          if (
            event.type === "content_block_delta" &&
            delta?.type === "text_delta" &&
            typeof delta.text === "string"
          ) {
            text += delta.text;
          }
        }
        requestId = stream.request_id ?? requestId;

        const parsed = parseAIResponse(text, {
          allowNoteNodes: request.allowNoteNodes,
        });
        if (request.requireArchitecture && !parsed.architecture) {
          throw new ProviderError(
            "invalid_output",
            "Anthropic returned an invalid architecture. The previous map was preserved.",
            { requestId }
          );
        }

        return {
          text,
          message: parsed.message,
          architecture: parsed.architecture,
          requestId,
        };
      } catch (error) {
        throw normalizeProviderError(error, {
          requestId: stream?.request_id ?? requestId,
        });
      } finally {
        request.signal?.removeEventListener("abort", abortStream);
      }
    },
  };
}
