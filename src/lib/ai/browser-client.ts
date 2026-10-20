import Anthropic, { type ClientOptions } from "@anthropic-ai/sdk";
import { createChatCompletionsClient } from "@/lib/ai/chat-completions-client";
import { ProviderError, normalizeProviderError } from "@/lib/ai/provider-errors";
import { AI_PROVIDERS, type AiProviderId } from "@/lib/ai/providers";
import {
  finishProviderStream,
  isUsableApiKey,
  type ProviderMessage,
  type ProviderStreamClient,
  type ProviderStreamRequest,
  type ProviderStreamResult,
} from "@/lib/ai/provider-stream";

export const ANTHROPIC_API_ORIGIN = AI_PROVIDERS.anthropic.origin;

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

/** A request to whichever provider the selected model belongs to. */
export interface BrowserAiRequest extends ProviderStreamRequest {
  provider: AiProviderId;
}

export interface BrowserAiClient {
  stream(request: BrowserAiRequest): Promise<ProviderStreamResult>;
}

export interface BrowserAiClientOptions {
  fetch?: typeof globalThis.fetch;
  anthropicClientFactory?: AnthropicBrowserClientFactory;
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

export function createBrowserAnthropicClient(
  options: BrowserAnthropicClientOptions = {}
): ProviderStreamClient {
  const clientFactory = options.clientFactory ?? defaultClientFactory;

  return {
    async stream(request): Promise<ProviderStreamResult> {
      if (!isUsableApiKey(request.apiKey)) {
        throw new ProviderError(
          "authentication",
          "Enter your Anthropic API key before starting this request."
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
        let stopReason: string | null = null;
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
            request.onText?.(text, delta.text);
          } else if (event.type === "message_delta" && typeof delta?.stop_reason === "string") {
            stopReason = delta.stop_reason;
          }
        }
        requestId = stream.request_id ?? requestId;

        return finishProviderStream("Anthropic", request, {
          text,
          truncated: stopReason === "max_tokens",
          requestId,
        });
      } catch (error) {
        // The SDK reports a user abort mid-stream as an unnamed APIUserAbortError,
        // which would otherwise read as a provider failure.
        if (request.signal?.aborted && !(error instanceof ProviderError)) {
          throw new ProviderError("aborted", "The Anthropic request was cancelled.", {
            requestId: stream?.request_id ?? requestId,
          });
        }
        throw normalizeProviderError(error, {
          providerName: "Anthropic",
          requestId: stream?.request_id ?? requestId,
        });
      } finally {
        request.signal?.removeEventListener("abort", abortStream);
      }
    },
  };
}

/** Routes each request to the client for its provider's protocol. */
export function createBrowserAiClient(options: BrowserAiClientOptions = {}): BrowserAiClient {
  const anthropic = createBrowserAnthropicClient({
    fetch: options.fetch,
    clientFactory: options.anthropicClientFactory,
  });
  return {
    stream({ provider, ...request }) {
      const definition = AI_PROVIDERS[provider];
      return definition.protocol === "anthropic-messages"
        ? anthropic.stream(request)
        : createChatCompletionsClient(definition, { fetch: options.fetch }).stream(request);
    },
  };
}
