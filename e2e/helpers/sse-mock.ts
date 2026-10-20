import { setTimeout as sleep } from "node:timers/promises";
import { expect, type Page, type Request, type Route } from "@playwright/test";
import { AI_PROVIDERS, type AiProviderId } from "../../src/lib/ai/providers";

// A literal, not the registry value: the egress assertions must catch a wrong origin in the app.
export const ANTHROPIC_ORIGIN = "https://api.anthropic.com";
export const GITHUB_ORIGIN = "https://api.github.com";
export const TEST_ANTHROPIC_KEY = "sk-ant-playwright-local-first";
export const TEST_PROVIDER_KEYS: Record<AiProviderId, string> = {
  anthropic: TEST_ANTHROPIC_KEY,
  openai: "sk-proj-playwright-local-first",
  gemini: "AIza-playwright-local-first",
  openrouter: "sk-or-playwright-local-first",
};
export const TEST_GITHUB_TOKEN = "github_pat_playwright_local_first";

export interface ProviderRequest {
  body: string | null;
  headers: Record<string, string>;
  method: string;
  url: string;
}

const CORS_HEADERS = {
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-origin": "*",
  "access-control-expose-headers": "request-id",
};

function anthropicSse(text: string, requestId: string) {
  const events = [
    {
      type: "message_start",
      message: {
        id: `msg_${requestId}`,
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
      delta: { type: "text_delta", text },
    },
    { type: "content_block_stop", index: 0 },
    {
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: 1 },
    },
    { type: "message_stop" },
  ];

  return events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
}

/** The New map page always offers the blank start. */
export function blankStartButton(page: Page) {
  return page.getByRole("button", { name: "Create blank map" });
}

export async function createBlankMap(page: Page) {
  await page.goto("/project/new");
  await blankStartButton(page).click();
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#.+/);
  await expect(page.getByRole("heading", { level: 1, name: "Untitled map" })).toBeVisible();
  await openChat(page);
  return decodeURIComponent(new URL(page.url()).hash.slice(1));
}

export async function openChat(page: Page) {
  const trigger = page.getByRole("button", { name: "Open chat" });
  const sidebar = page.locator("#editor-chat-sidebar");
  await expect
    .poll(async () => (await sidebar.isVisible()) || (await trigger.isVisible()))
    .toBe(true);
  if (!(await sidebar.isVisible())) await trigger.click();
  await expect(sidebar).toBeVisible();
}

/** Selects `provider` in Settings and gives it a test key, as a user would. */
export async function useProviderKey(
  page: Page,
  options: { provider?: AiProviderId; remember?: boolean; returnTo?: string } = {}
) {
  const provider = options.provider ?? "anthropic";
  const returnTo = options.returnTo ?? "/app/maps";
  await page.goto(`/settings?setup=ai&returnTo=${encodeURIComponent(returnTo)}`);
  const providerSelect = page.getByLabel("Provider", { exact: true });
  if ((await providerSelect.inputValue()) !== provider) {
    await providerSelect.selectOption(provider);
  }
  const name = AI_PROVIDERS[provider].name;
  await page.getByLabel(`${name} API key`).fill(TEST_PROVIDER_KEYS[provider]);
  if (options.remember) {
    await page
      .getByRole("region", { name: `${name} key` })
      .getByRole("checkbox", { name: /Remember on this device/ })
      .check();
  }
  await page.getByRole("button", { name: "Use key" }).click();
  await expect(
    page.getByTestId(options.remember ? "key-status-remembered" : "key-status-session")
  ).toBeVisible();
}

export async function mockAnthropic(
  page: Page,
  outputs: string[],
  options: { status?: number; delayMs?: number } = {}
) {
  const requests: ProviderRequest[] = [];
  let responseIndex = 0;

  await page.route(`${ANTHROPIC_ORIGIN}/**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }

    const body = request.postData();
    requests.push({
      body,
      headers: await request.allHeaders(),
      method: request.method(),
      url: request.url(),
    });

    if (options.delayMs) await sleep(options.delayMs);
    const status = options.status ?? 200;
    if (status !== 200) {
      await route.fulfill({
        status,
        headers: { ...CORS_HEADERS, "content-type": "application/json", "request-id": "req_error" },
        body: JSON.stringify({
          type: "error",
          error: { type: "api_error", message: "Unavailable" },
        }),
      });
      return;
    }

    const output = outputs[Math.min(responseIndex, outputs.length - 1)] ?? "Ready.";
    responseIndex += 1;
    const requestId = `req_playwright_${responseIndex}`;
    await route.fulfill({
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "cache-control": "no-cache",
        "content-type": "text/event-stream",
        "request-id": requestId,
      },
      body: anthropicSse(output, requestId),
    });
  });

  return requests;
}

function chatCompletionsSse(text: string, id: string) {
  const chunks = [
    { id, object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant" } }] },
    { id, object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: text } }] },
    {
      id,
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    },
  ];
  return `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`;
}

/** Fakes an OpenAI-compatible provider's streaming Chat Completions endpoint. */
export async function mockChatCompletions(
  page: Page,
  provider: Exclude<AiProviderId, "anthropic">,
  outputs: string[],
  options: { status?: number; errorBody?: unknown } = {}
) {
  const requests: ProviderRequest[] = [];
  let responseIndex = 0;
  const { origin } = AI_PROVIDERS[provider];

  // Playwright answers intercepted CORS preflights itself, so only the request itself arrives here.
  await page.route(`${origin}/**`, async (route) => {
    const request = route.request();
    requests.push({
      body: request.postData(),
      headers: await request.allHeaders(),
      method: request.method(),
      url: request.url(),
    });

    const status = options.status ?? 200;
    if (status !== 200) {
      await route.fulfill({
        status,
        headers: { ...CORS_HEADERS, "content-type": "application/json" },
        body: JSON.stringify(options.errorBody ?? { error: { message: "Unavailable" } }),
      });
      return;
    }

    const output = outputs[Math.min(responseIndex, outputs.length - 1)] ?? "Ready.";
    responseIndex += 1;
    await route.fulfill({
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "cache-control": "no-cache",
        "content-type": "text/event-stream",
      },
      body: chatCompletionsSse(output, `chatcmpl-playwright-${responseIndex}`),
    });
  });

  return requests;
}

// GitHub lists Authorization explicitly; a wildcard does not cover it.
const GITHUB_CORS_HEADERS = {
  ...CORS_HEADERS,
  "access-control-allow-headers":
    "Authorization, Content-Type, If-None-Match, X-GitHub-Api-Version, Accept",
};

function githubResponse(url: URL) {
  if (url.pathname === "/repos/acme/platform") {
    return {
      description: "A private-by-design example app",
      language: "TypeScript",
      topics: ["architecture"],
      default_branch: "main",
    };
  }
  if (url.pathname === "/repos/acme/billing") {
    return {
      description: "Private billing service",
      language: "TypeScript",
      topics: [],
      default_branch: "main",
      private: true,
      visibility: "private",
    };
  }
  if (url.pathname.endsWith("/languages")) return { TypeScript: 900, CSS: 100 };
  if (url.pathname.endsWith("/commits/main")) {
    return { sha: "abc123def456", commit: { tree: { sha: "tree123" } } };
  }
  if (url.pathname.endsWith("/git/trees/tree123")) {
    return { truncated: false, tree: [] };
  }
  if (url.pathname.endsWith("/readme")) {
    return { encoding: "base64", content: Buffer.from("# Platform").toString("base64") };
  }
  return {};
}

/**
 * Fakes GitHub's REST API. `acme/billing` is private: without the expected
 * token GitHub answers 404, as it does for repositories a caller cannot see.
 */
export async function mockGitHub(page: Page) {
  const requests: ProviderRequest[] = [];
  await page.route(`${GITHUB_ORIGIN}/**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: GITHUB_CORS_HEADERS });
      return;
    }
    const headers = await request.allHeaders();
    requests.push({
      body: request.postData(),
      headers,
      method: request.method(),
      url: request.url(),
    });
    const url = new URL(request.url());
    const hidden =
      url.pathname.startsWith("/repos/acme/billing") &&
      headers.authorization !== `Bearer ${TEST_GITHUB_TOKEN}`;
    await route.fulfill({
      status: hidden ? 404 : 200,
      headers: { ...GITHUB_CORS_HEADERS, "content-type": "application/json" },
      body: JSON.stringify(hidden ? { message: "Not Found" } : githubResponse(url)),
    });
  });
  return requests;
}

export function trackExternalRequests(page: Page) {
  const requests: Request[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return;
    requests.push(request);
  });
  return requests;
}

export async function readIndexedDbStore<T = unknown>(
  page: Page,
  databaseName: string,
  storeName: string
): Promise<T[]> {
  return page.evaluate(
    async ({ databaseName, storeName }) => {
      const databaseExists = (await indexedDB.databases()).some(
        (database) => database.name === databaseName
      );
      if (!databaseExists) return [];

      return new Promise<T[]>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(storeName)) {
            database.close();
            resolve([]);
            return;
          }
          const transaction = database.transaction(storeName, "readonly");
          const all = transaction.objectStore(storeName).getAll();
          all.onerror = () => reject(all.error);
          all.onsuccess = () => resolve(all.result as T[]);
          transaction.oncomplete = () => database.close();
        };
      });
    },
    { databaseName, storeName }
  );
}

export async function assertNoApplicationCookies(page: Page) {
  const cookies = await page.context().cookies();
  expect(cookies).toEqual([]);
}

/** Sends a message through the composer, which is how a blank map starts now. */
export async function sendChatMessage(page: Page, text: string) {
  await page.getByRole("textbox", { name: /Ask anything/ }).fill(text);
  await page.getByRole("button", { name: "Send message" }).click();
}
