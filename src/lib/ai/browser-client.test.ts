import { describe, expect, it, vi } from "vitest";
import {
  ANTHROPIC_API_ORIGIN,
  createBrowserAnthropicClient,
  type AnthropicBrowserSdkClient,
  type AnthropicBrowserSdkStream,
} from "@/lib/ai/browser-client";

function textStream(
  deltas: string[],
  options: { requestId?: string; failure?: unknown } = {}
): AnthropicBrowserSdkStream {
  return {
    request_id: options.requestId ?? "req_stream_123",
    abort: vi.fn(),
    async *[Symbol.asyncIterator]() {
      for (const text of deltas) {
        yield {
          type: "content_block_delta",
          delta: { type: "text_delta", text },
        };
      }
      if (options.failure) throw options.failure;
    },
  };
}

function sdkClient(stream: AnthropicBrowserSdkStream): AnthropicBrowserSdkClient {
  return {
    messages: {
      stream: vi.fn(() => stream),
    },
  };
}

describe("createBrowserAnthropicClient", () => {
  it("constructs the SDK with exact origin and browser opt-in only at dispatch", async () => {
    const stream = textStream(["hello"]);
    const factory = vi.fn(() => sdkClient(stream));
    const client = createBrowserAnthropicClient({ clientFactory: factory });

    expect(factory).not.toHaveBeenCalled();
    await client.stream({
      apiKey: "sk-ant-test",
      model: "claude-sonnet-5",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "sk-ant-test",
        baseURL: ANTHROPIC_API_ORIGIN,
        dangerouslyAllowBrowser: true,
      })
    );
  });

  it("sends the key only in x-api-key to the exact Anthropic origin", async () => {
    const apiKey = "sk-ant-request-surface";
    const logSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const request = input instanceof Request ? input : new Request(input);
      expect(new URL(request.url).origin).toBe(ANTHROPIC_API_ORIGIN);
      expect(request.credentials).toBe("omit");
      expect(request.redirect).toBe("manual");
      expect(request.referrerPolicy).toBe("no-referrer");
      expect(request.headers.get("x-api-key")).toBe(apiKey);
      expect(request.headers.get("authorization")).toBeNull();
      expect(await request.clone().text()).not.toContain(apiKey);

      const events = [
        {
          type: "message_start",
          message: {
            id: "msg_test",
            type: "message",
            role: "assistant",
            model: "claude-sonnet-5",
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 0 },
          },
        },
        {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "", citations: null },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "hello" },
        },
        { type: "content_block_stop", index: 0 },
        {
          type: "message_delta",
          delta: { stop_reason: "end_turn", stop_sequence: null },
          usage: { output_tokens: 1 },
        },
        { type: "message_stop" },
      ]
        .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
        .join("");

      return new Response(events, {
        headers: {
          "Content-Type": "text/event-stream",
          "request-id": "req_surface",
        },
      });
    });
    const client = createBrowserAnthropicClient({ fetch: fetchMock });

    await expect(
      client.stream({
        apiKey,
        model: "claude-sonnet-5",
        messages: [{ role: "user", content: "hello" }],
      })
    ).resolves.toMatchObject({ text: "hello", requestId: "req_surface" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("refuses credential-bearing URLs before dispatch", async () => {
    const apiKey = "sk-ant-url-secret";
    const fetchMock = vi.fn();
    const client = createBrowserAnthropicClient({
      fetch: fetchMock,
      clientFactory: (options) => ({
        messages: {
          stream: () => ({
            abort: vi.fn(),
            async *[Symbol.asyncIterator]() {
              await options.fetch?.(`${ANTHROPIC_API_ORIGIN}/v1/messages?key=${apiKey}`, {
                method: "POST",
                headers: { "x-api-key": apiKey },
                body: "{}",
              });
            },
          }),
        },
      }),
    });

    await expect(
      client.stream({
        apiKey,
        model: "claude-sonnet-5",
        messages: [{ role: "user", content: "hello" }],
      })
    ).rejects.toMatchObject({ code: "transient" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accumulates streamed text and returns validated architecture with request ID", async () => {
    const output = 'Done\n<stack>{"nodes":[],"edges":[]}</stack>';
    const onText = vi.fn();
    const client = createBrowserAnthropicClient({
      clientFactory: () =>
        sdkClient(textStream(["Done\n<stack>", '{"nodes":[],"edges":[]}', "</stack>"])),
    });

    await expect(
      client.stream({
        apiKey: "sk-ant-test",
        model: "claude-sonnet-5",
        messages: [{ role: "user", content: "map it" }],
        requireArchitecture: true,
        onText,
      })
    ).resolves.toMatchObject({
      text: output,
      message: "Done",
      architecture: { nodes: [], edges: [] },
      requestId: "req_stream_123",
    });
    expect(onText).toHaveBeenNthCalledWith(1, "Done\n<stack>", "Done\n<stack>");
    expect(onText).toHaveBeenLastCalledWith(output, "</stack>");
  });

  it("aborts the SDK stream and returns no partial result", async () => {
    const controller = new AbortController();
    const stream: AnthropicBrowserSdkStream = {
      request_id: "req_abort",
      abort: vi.fn(),
      async *[Symbol.asyncIterator]() {
        yield { type: "content_block_delta", delta: { type: "text_delta", text: "partial" } };
        controller.abort();
        yield { type: "content_block_delta", delta: { type: "text_delta", text: "ignored" } };
      },
    };
    const client = createBrowserAnthropicClient({ clientFactory: () => sdkClient(stream) });

    await expect(
      client.stream({
        apiKey: "sk-ant-test",
        model: "claude-sonnet-5",
        messages: [{ role: "user", content: "map it" }],
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ code: "aborted", requestId: "req_abort" });
    expect(stream.abort).toHaveBeenCalledOnce();
  });

  it("normalizes mid-stream errors without returning accumulated output", async () => {
    const secret = "sk-ant-super-secret";
    const failure = Object.assign(new Error(`failure ${secret}`), {
      status: 500,
      requestID: "req_failure",
      error: { type: "api_error", message: `failure ${secret}` },
    });
    const client = createBrowserAnthropicClient({
      clientFactory: () => sdkClient(textStream(["partial"], { failure })),
    });

    const promise = client.stream({
      apiKey: secret,
      model: "claude-sonnet-5",
      messages: [{ role: "user", content: "map it" }],
    });

    await expect(promise).rejects.toMatchObject({
      code: "transient",
      requestId: "req_failure",
    });
    await expect(promise).rejects.not.toHaveProperty("text");
    await expect(promise).rejects.not.toHaveProperty("message", expect.stringContaining(secret));
  });

  it("rejects invalid architecture output with the stream request ID", async () => {
    const client = createBrowserAnthropicClient({
      clientFactory: () => sdkClient(textStream(["not a stack"], { requestId: "req_invalid" })),
    });

    await expect(
      client.stream({
        apiKey: "sk-ant-test",
        model: "claude-sonnet-5",
        messages: [{ role: "user", content: "map it" }],
        requireArchitecture: true,
      })
    ).rejects.toMatchObject({
      code: "invalid_output",
      requestId: "req_invalid",
    });
  });
});
