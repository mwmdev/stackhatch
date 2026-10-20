import { describe, expect, it, vi } from "vitest";
import { createChatCompletionsClient } from "@/lib/ai/chat-completions-client";
import { AI_PROVIDERS } from "@/lib/ai/providers";

const OPENAI_KEY = "sk-proj-chat-completions-test";

/** A streamed body delivered in the given pieces, which may split lines anywhere. */
function streamedBody(pieces: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) controller.enqueue(encoder.encode(piece));
      controller.close();
    },
  });
}

function sse(chunks: Array<Record<string, unknown>>) {
  return [...chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`), "data: [DONE]\n\n"].join(
    ""
  );
}

function delta(content: string, finishReason: string | null = null) {
  return {
    id: "chatcmpl-123",
    object: "chat.completion.chunk",
    choices: [{ index: 0, delta: { content }, finish_reason: finishReason }],
  };
}

function eventStream(pieces: string[], headers: HeadersInit = {}) {
  return new Response(streamedBody(pieces), {
    headers: { "Content-Type": "text/event-stream", ...headers },
  });
}

describe("createChatCompletionsClient", () => {
  it("streams from the provider's fixed endpoint with the key only in Authorization", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      eventStream([
        sse([
          delta("Mapped.\n<stack>"),
          delta('{"nodes":[{"id":"api","category":"api","subtype":"rest-api",'),
          delta(
            '"name":"API","technology":"Hono","description":"d","reasoning":"r","locked":false}],'
          ),
          delta('"edges":[]}</stack>', "stop"),
        ]),
      ])
    );
    const onText = vi.fn();
    const client = createChatCompletionsClient(AI_PROVIDERS.openai, { fetch: fetchMock });

    const result = await client.stream({
      apiKey: OPENAI_KEY,
      model: "gpt-6.1-sol",
      system: "Map systems.",
      messages: [{ role: "user", content: "Map it" }],
      requireArchitecture: true,
      onText,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${OPENAI_KEY}`);
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({
      model: "gpt-6.1-sol",
      stream: true,
      messages: [
        { role: "system", content: "Map systems." },
        { role: "user", content: "Map it" },
      ],
    });
    expect(String(init?.body)).not.toContain(OPENAI_KEY);
    expect(String(url)).not.toContain(OPENAI_KEY);

    expect(result.message).toBe("Mapped.");
    expect(result.architecture?.nodes.map((node) => node.id)).toEqual(["api"]);
    expect(result.requestId).toBe("chatcmpl-123");
    expect(onText).toHaveBeenLastCalledWith(result.text, '"edges":[]}</stack>');
  });

  it("reassembles events split across reads and skips keep-alive comments", async () => {
    const payload = `: OPENROUTER PROCESSING\n\n${sse([delta("Hello"), delta(", world")])}`;
    // Cut the stream into 7-byte reads so lines and \r\n pairs straddle chunks.
    const crlf = payload.replaceAll("\n", "\r\n");
    const pieces = crlf.match(/[\s\S]{1,7}/g) ?? [];
    const client = createChatCompletionsClient(AI_PROVIDERS.openrouter, {
      fetch: async () => eventStream(pieces),
    });

    const result = await client.stream({
      apiKey: "sk-or-test",
      model: "moonshotai/kimi-k3",
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(result.text).toBe("Hello, world");
  });

  it("keeps a multi-line event whole when its CRLF is split between reads", async () => {
    const client = createChatCompletionsClient(AI_PROVIDERS.openai, {
      fetch: async () =>
        eventStream([
          'data: {"choices":[{"delta":\r',
          '\ndata: {"content":"Hi"}}]}\r\n\r\ndata: [DONE]\r\n\r\n',
        ]),
    });

    const result = await client.stream({
      apiKey: OPENAI_KEY,
      model: "gpt-6.1-sol",
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(result.text).toBe("Hi");
  });

  it("reads Gemini's array-wrapped error as a rejected key", async () => {
    const client = createChatCompletionsClient(AI_PROVIDERS.gemini, {
      fetch: async () =>
        new Response(
          JSON.stringify([
            {
              error: {
                code: 400,
                message: "Please pass a valid API key",
                status: "INVALID_ARGUMENT",
              },
            },
          ]),
          { status: 400, headers: { "Content-Type": "application/json" } }
        ),
    });

    await expect(
      client.stream({
        apiKey: "AIza-test",
        model: "gemini-3.8-flash",
        messages: [{ role: "user", content: "Hi" }],
      })
    ).rejects.toMatchObject({
      code: "authentication",
      message: "Google Gemini rejected the API key. Check it and try again.",
    });
  });

  it("reports an unreachable provider as retryable without leaking the cause", async () => {
    const client = createChatCompletionsClient(AI_PROVIDERS.openai, {
      fetch: async () => {
        throw new TypeError(`Failed to fetch ${OPENAI_KEY}`);
      },
    });

    const failure = await client
      .stream({
        apiKey: OPENAI_KEY,
        model: "gpt-6.1-sol",
        messages: [{ role: "user", content: "Hi" }],
      })
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: "transient", retryable: true });
    expect((failure as Error).message).toContain("OpenAI could not be reached");
    expect(JSON.stringify(failure)).not.toContain(OPENAI_KEY);
  });

  it("fails on an error OpenRouter sends after the stream has started", async () => {
    const client = createChatCompletionsClient(AI_PROVIDERS.openrouter, {
      fetch: async () =>
        eventStream([
          `data: ${JSON.stringify(delta("Partial"))}\n\n`,
          `data: ${JSON.stringify({ error: { code: 429, message: "Rate limit exceeded upstream" } })}\n\n`,
        ]),
    });

    await expect(
      client.stream({
        apiKey: "sk-or-test",
        model: "deepseek/deepseek-v4-pro",
        messages: [{ role: "user", content: "Hi" }],
      })
    ).rejects.toMatchObject({ code: "rate_limited", retryable: true });
  });

  it("says a required map was cut off when the provider stopped at its length limit", async () => {
    const client = createChatCompletionsClient(AI_PROVIDERS.openai, {
      fetch: async () => eventStream([sse([delta('Mapped.\n<stack>{"nodes":[', "length")])]),
    });

    await expect(
      client.stream({
        apiKey: OPENAI_KEY,
        model: "gpt-6-luna",
        messages: [{ role: "user", content: "Map it" }],
        requireArchitecture: true,
      })
    ).rejects.toMatchObject({
      code: "invalid_output",
      message: expect.stringContaining("OpenAI's response was cut off"),
    });
  });

  it("stops reading and reports aborted when the user cancels mid-stream", async () => {
    const controller = new AbortController();
    const encoder = new TextEncoder();
    const pending = [delta("Par"), delta("tial")];
    let bodyCancelled = false;
    const client = createChatCompletionsClient(AI_PROVIDERS.openai, {
      fetch: async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            // The body stays open after these chunks, like a live stream, so
            // the client has to cancel it rather than wait for its end.
            pull(stream) {
              const next = pending.shift();
              if (next) stream.enqueue(encoder.encode(`data: ${JSON.stringify(next)}\n\n`));
            },
            cancel() {
              bodyCancelled = true;
            },
          })
        ),
    });
    const onText = vi.fn(() => controller.abort());

    await expect(
      client.stream({
        apiKey: OPENAI_KEY,
        model: "gpt-6.1-sol",
        messages: [{ role: "user", content: "Hi" }],
        signal: controller.signal,
        onText,
      })
    ).rejects.toMatchObject({ code: "aborted" });
    expect(onText.mock.calls).toEqual([["Par", "Par"]]);
    expect(bodyCancelled).toBe(true);
  });

  it("does not send a conversation that contains the key", async () => {
    const fetchMock = vi.fn();
    const client = createChatCompletionsClient(AI_PROVIDERS.openai, { fetch: fetchMock });

    await expect(
      client.stream({
        apiKey: OPENAI_KEY,
        model: "gpt-6.1-sol",
        messages: [{ role: "user", content: `my key is ${OPENAI_KEY}` }],
      })
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
