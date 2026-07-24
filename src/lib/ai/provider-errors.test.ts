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

describe("normalizeProviderError", () => {
  it.each([
    [401, "authentication_error", "bad key", "authentication", false],
    [403, "permission_error", "not allowed", "permission", false],
    [400, "billing_error", "credit balance is too low", "billing", false],
    [400, "invalid_request_error", "bad input", "invalid_request", false],
    [500, "api_error", "provider down", "transient", true],
  ] as const)("maps %s/%s to %s", (status, type, message, code, retryable) => {
    const error = normalizeProviderError(providerFailure(status, type, message));

    expect(error).toMatchObject({
      name: "ProviderError",
      code: code satisfies ProviderErrorCode,
      retryable,
      requestId: "req_provider_123",
    });
  });

  it("exposes rate retry timing and request ID", () => {
    const error = normalizeProviderError(
      providerFailure(429, "rate_limit_error", "slow down", { "Retry-After": "12" }),
      { now: () => 1_000 }
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
      })
    );

    expect(error).toMatchObject({ code: "rate_limited", retryAt: null });
  });

  it("normalizes aborts without making them retryable", () => {
    const error = normalizeProviderError(new DOMException("cancelled", "AbortError"));

    expect(error).toMatchObject({ code: "aborted", retryable: false });
  });

  it("does not retain provider messages, causes, or secrets", () => {
    const secret = "sk-ant-secret-material";
    const error = normalizeProviderError(
      providerFailure(401, "authentication_error", `invalid ${secret}`)
    );

    expect(error).toBeInstanceOf(ProviderError);
    expect(JSON.stringify(error)).not.toContain(secret);
    expect(error.message).not.toContain(secret);
    expect("cause" in error).toBe(false);
  });
});
