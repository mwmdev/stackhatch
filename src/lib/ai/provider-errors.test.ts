import { describe, expect, it } from "vitest";
import {
  ProviderError,
  normalizeProviderError,
  type ProviderErrorCode,
} from "@/lib/ai/provider-errors";

function providerFailure(
  status: number,
  type: string,
  message: string,
  headers: HeadersInit = {}
): Error {
  return Object.assign(new Error(message), {
    status,
    requestID: "req_provider_123",
    error: { type, message },
    headers: new Headers(headers),
  });
}

/** The body shape OpenAI-compatible APIs return: `{ error: { message, type?, code? } }`. */
function chatCompletionsFailure(status: number, error: Record<string, unknown>): Error {
  return Object.assign(new Error("The provider returned an error."), {
    status,
    error: { error },
    headers: new Headers(),
  });
}

const anthropic = { providerName: "Anthropic" };

describe("normalizeProviderError", () => {
  it.each([
    [401, "authentication_error", "bad key", "authentication", false],
    [403, "permission_error", "not allowed", "permission", false],
    [400, "billing_error", "credit balance is too low", "billing", false],
    [400, "invalid_request_error", "bad input", "invalid_request", false],
    [500, "api_error", "provider down", "transient", true],
  ] as const)("maps %s/%s to %s", (status, type, message, code, retryable) => {
    const error = normalizeProviderError(providerFailure(status, type, message), anthropic);

    expect(error).toMatchObject({
      name: "ProviderError",
      code: code satisfies ProviderErrorCode,
      retryable,
      requestId: "req_provider_123",
    });
  });

  it.each([
    [
      "Gemini's 400 for a bad key",
      400,
      { code: 400, message: "Please pass a valid API key" },
      "authentication",
    ],
    [
      "Gemini's 400 for a bad auth key",
      400,
      { code: 400, message: "Invalid Auth key.", status: "INVALID_ARGUMENT" },
      "authentication",
    ],
    [
      "Gemini's per-minute 429, which mentions billing",
      429,
      {
        code: 429,
        message:
          "You exceeded your current quota, please check your plan and billing details. Please retry in 20.7s.",
        status: "RESOURCE_EXHAUSTED",
      },
      "rate_limited",
    ],
    [
      "a 403 whose message names the API key",
      403,
      {
        type: "permission_error",
        message: "Your API key does not have permission to use the specified resource.",
      },
      "permission",
    ],
    [
      "OpenRouter's 402 for missing credits",
      402,
      { code: 402, message: "Insufficient credits" },
      "billing",
    ],
    [
      "OpenAI's exhausted quota",
      429,
      {
        type: "insufficient_quota",
        message: "You exceeded your current quota, please check your plan and billing details.",
      },
      "billing",
    ],
    [
      "an unknown model",
      404,
      {
        type: "invalid_request_error",
        code: "model_not_found",
        message: "The model does not exist",
      },
      "invalid_request",
    ],
  ] as const)("classifies %s as %s", (_case, status, body, code) => {
    const error = normalizeProviderError(chatCompletionsFailure(status, body), {
      providerName: "OpenAI",
    });

    expect(error.code).toBe(code);
  });

  it("names the provider that failed in what the user reads", () => {
    const error = normalizeProviderError(chatCompletionsFailure(401, { message: "bad key" }), {
      providerName: "Google Gemini",
    });

    expect(error.message).toBe("Google Gemini rejected the API key. Check it and try again.");
  });

  it("exposes rate retry timing and request ID", () => {
    const error = normalizeProviderError(
      providerFailure(429, "rate_limit_error", "slow down", { "Retry-After": "12" }),
      { ...anthropic, now: () => 1_000 }
    );

    expect(error).toMatchObject({
      code: "rate_limited",
      retryable: true,
      retryAt: 13_000,
      requestId: "req_provider_123",
    });
  });

  it("drops out-of-range rate-limit timestamps", () => {
    const error = normalizeProviderError(
      providerFailure(429, "rate_limit_error", "slow down", {
        "Retry-After": "999999999999999999999999999999",
      }),
      anthropic
    );

    expect(error).toMatchObject({ code: "rate_limited", retryAt: null });
  });

  it("normalizes aborts without making them retryable", () => {
    const error = normalizeProviderError(new DOMException("cancelled", "AbortError"), anthropic);

    expect(error).toMatchObject({ code: "aborted", retryable: false });
  });

  it("keeps the provider's error type, not its message, in the generic failure", () => {
    const error = normalizeProviderError(
      providerFailure(500, "api_error", "internal detail"),
      anthropic
    );

    expect(error.message).toBe("Anthropic could not complete the request (api_error). Try again.");
  });

  it("does not retain provider messages, causes, or secrets", () => {
    const secret = "sk-ant-secret-material";
    const error = normalizeProviderError(
      providerFailure(401, "authentication_error", `invalid ${secret}`),
      anthropic
    );

    expect(error).toBeInstanceOf(ProviderError);
    expect(JSON.stringify(error)).not.toContain(secret);
    expect(error.message).not.toContain(secret);
    expect("cause" in error).toBe(false);
  });
});
