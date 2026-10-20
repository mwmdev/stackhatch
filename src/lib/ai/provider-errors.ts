export type ProviderErrorCode =
  | "authentication"
  | "billing"
  | "permission"
  | "rate_limited"
  | "invalid_request"
  | "transient"
  | "aborted"
  | "invalid_output";

interface ProviderErrorInit {
  retryable?: boolean;
  requestId?: string | null;
  retryAt?: number | null;
}

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly retryable: boolean;
  readonly requestId: string | null;
  readonly retryAt: number | null;

  constructor(code: ProviderErrorCode, message: string, init: ProviderErrorInit = {}) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.retryable = init.retryable ?? false;
    this.requestId = init.requestId ?? null;
    this.retryAt = init.retryAt ?? null;
  }
}

interface NormalizeProviderErrorOptions {
  /** Shown to the user, e.g. "OpenAI rejected the API key." */
  providerName: string;
  requestId?: string | null;
  now?: () => number;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function errorStatus(error: unknown): number | null {
  const value = record(error)?.status;
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function errorRequestId(error: unknown): string | null {
  const value = record(error);
  const requestId = value?.requestID ?? value?.requestId;
  return typeof requestId === "string" && requestId.length > 0 ? requestId : null;
}

function providerClassificationText(error: unknown): string {
  const top = record(error);
  const body = record(top?.error);
  const nested = record(body?.error);
  return [body?.type, body?.message, nested?.type, nested?.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

function providerErrorType(error: unknown): string | null {
  const body = record(record(error)?.error);
  const candidates = [record(body?.error)?.type, body?.type];
  for (const candidate of candidates) {
    if (
      typeof candidate === "string" &&
      candidate !== "error" &&
      /^[a-z_]{1,64}$/.test(candidate)
    ) {
      return candidate;
    }
  }
  return null;
}

function errorHeaders(error: unknown): Headers {
  const value = record(error)?.headers;
  try {
    if (value instanceof Headers) return value;
    if (value && typeof value === "object") return new Headers(value as HeadersInit);
  } catch {
    // Malformed provider headers are ignored and never reflected to the caller.
  }
  return new Headers();
}

function retryAt(headers: Headers, now: number): number | null {
  const value = headers.get("retry-after")?.trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    const timestamp = now + seconds * 1_000;
    return Number.isSafeInteger(seconds) &&
      Number.isFinite(timestamp) &&
      timestamp >= 0 &&
      timestamp <= 8_640_000_000_000_000
      ? timestamp
      : null;
  }
  const date = Date.parse(value);
  return Number.isFinite(date) && date >= 0 && date <= 8_640_000_000_000_000 ? date : null;
}

function isAbort(error: unknown): boolean {
  const value = record(error);
  return (
    value?.name === "AbortError" ||
    value?.name === "APIUserAbortError" ||
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError")
  );
}

export function normalizeProviderError(
  error: unknown,
  options: NormalizeProviderErrorOptions
): ProviderError {
  if (error instanceof ProviderError) return error;

  const provider = options.providerName;
  const requestId = errorRequestId(error) ?? options.requestId ?? null;
  if (isAbort(error)) {
    return new ProviderError("aborted", `The ${provider} request was cancelled.`, {
      requestId,
    });
  }

  const status = errorStatus(error);
  const classification = providerClassificationText(error);
  const common = { requestId };

  // Gemini words its ordinary per-minute 429 as "check your plan and billing
  // details", so billing wording on a 429 is a rate limit; an exhausted quota
  // is recognised by its type token instead.
  if (
    status === 402 ||
    classification.includes("insufficient_quota") ||
    (status !== 429 &&
      (classification.includes("billing") || classification.includes("credit balance")))
  ) {
    return new ProviderError(
      "billing",
      `${provider} could not run this request because the account needs billing attention.`,
      common
    );
  }
  // Gemini reports a bad key as a 400 whose message names the API or auth key.
  // A 403 can mention the API key too, but means the key lacks permission.
  if (
    status === 401 ||
    classification.includes("authentication") ||
    (status === 400 && (classification.includes("api key") || classification.includes("auth key")))
  ) {
    return new ProviderError(
      "authentication",
      `${provider} rejected the API key. Check it and try again.`,
      common
    );
  }
  if (status === 403 || classification.includes("permission")) {
    return new ProviderError(
      "permission",
      `${provider} did not permit this request for the selected account or model.`,
      common
    );
  }
  if (status === 429 || classification.includes("rate_limit")) {
    const nextAttempt = retryAt(errorHeaders(error), (options.now ?? Date.now)());
    return new ProviderError(
      "rate_limited",
      `${provider} is rate limiting requests. Wait before trying again.`,
      {
        retryable: true,
        requestId,
        retryAt: nextAttempt,
      }
    );
  }
  if (status === 529 || classification.includes("overloaded")) {
    return new ProviderError(
      "transient",
      `${provider} is overloaded right now. Try again in a moment.`,
      { retryable: true, requestId }
    );
  }
  if (
    status === 400 ||
    status === 404 ||
    status === 409 ||
    status === 413 ||
    status === 422 ||
    classification.includes("invalid_request")
  ) {
    return new ProviderError(
      "invalid_request",
      `${provider} rejected the request. Review the selected model and context.`,
      common
    );
  }

  // Only the provider's error type token is kept: it is safe to show and makes
  // a report actionable, unlike provider messages, which can echo input.
  const type = providerErrorType(error);
  return new ProviderError(
    "transient",
    `${provider} could not complete the request${type ? ` (${type})` : ""}. Try again.`,
    { retryable: true, requestId }
  );
}
