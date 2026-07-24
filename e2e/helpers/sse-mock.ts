import { expect, type Page, type Request, type Route } from "@playwright/test";

export const ANTHROPIC_ORIGIN = "https://api.anthropic.com";
export const GITHUB_ORIGIN = "https://api.github.com";
export const TEST_ANTHROPIC_KEY = "sk-ant-playwright-local-first";

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

export async function createBlankMap(page: Page) {
  await page.goto("/project/new");
  await page.getByRole("button", { name: /Blank map/ }).click();
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#.+/);
  await expect(page.getByRole("heading", { level: 1, name: "Untitled Project" })).toBeVisible();
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

export async function useAnthropicKey(
  page: Page,
  options: { remember?: boolean; returnTo?: string } = {}
) {
  const returnTo = options.returnTo ?? "/app/maps";
  await page.goto(`/settings?setup=anthropic&returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel("Anthropic API key").fill(TEST_ANTHROPIC_KEY);
  if (options.remember) {
    await page.getByRole("checkbox", { name: /Remember on this device/ }).check();
  }
  await page.getByRole("button", { name: "Use key" }).click();
  await expect(
    page.getByTestId(options.remember ? "key-status-remembered" : "key-status-session")
  ).toBeVisible();
}

export async function mockAnthropic(
  page: Page,
  outputs: string[],
  options: { status?: number } = {}
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

function githubResponse(url: URL) {
  if (url.pathname === "/repos/acme/platform") {
    return {
      description: "A private-by-design example app",
      language: "TypeScript",
      topics: ["architecture"],
      default_branch: "main",
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

export async function mockGitHub(page: Page) {
  const requests: ProviderRequest[] = [];
  await page.route(`${GITHUB_ORIGIN}/**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }
    requests.push({
      body: request.postData(),
      headers: await request.allHeaders(),
      method: request.method(),
      url: request.url(),
    });
    await route.fulfill({
      status: 200,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
      body: JSON.stringify(githubResponse(new URL(request.url()))),
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
    async ({ databaseName, storeName }) =>
      new Promise<T[]>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(storeName, "readonly");
          const all = transaction.objectStore(storeName).getAll();
          all.onerror = () => reject(all.error);
          all.onsuccess = () => resolve(all.result as T[]);
          transaction.oncomplete = () => database.close();
        };
      }),
    { databaseName, storeName }
  );
}

export async function assertNoApplicationCookies(page: Page) {
  const cookies = await page.context().cookies();
  expect(cookies).toEqual([]);
}
