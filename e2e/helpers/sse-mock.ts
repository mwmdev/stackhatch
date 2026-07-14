import { Page, Route } from "@playwright/test";

/**
 * Build an SSE response body string from a series of events.
 */
export function buildSSEBody(events: Array<{ type: string; content?: string }>): string {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
}

/**
 * Build a simple text-then-done SSE body from a string.
 */
export function textSSE(text: string): string {
  return buildSSEBody([{ type: "text", content: text }, { type: "done" }]);
}

/**
 * Build a multi-chunk text SSE body (simulates streaming).
 */
export function chunkedTextSSE(chunks: string[]): string {
  const events: Array<{ type: string; content?: string }> = chunks.map((c) => ({
    type: "text",
    content: c,
  }));
  events.push({ type: "done" });
  return buildSSEBody(events);
}

/**
 * Build an SSE body that includes architecture data.
 */
export function architectureSSE(textChunks: string[], architecture: object): string {
  const events: Array<{ type: string; content?: string | object }> = [];
  for (const chunk of textChunks) {
    events.push({ type: "text", content: chunk });
  }
  events.push({ type: "architecture", content: architecture });
  events.push({ type: "done" });
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
}

/**
 * Build an SSE error body.
 */
export function errorSSE(message: string): string {
  return buildSSEBody([{ type: "error", content: message }]);
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

/**
 * Fulfill a route with an SSE response.
 */
export async function fulfillSSE(route: Route, body: string, status = 200) {
  await route.fulfill({ status, headers: SSE_HEADERS, body });
}

/**
 * A canned conversation for the full interview-to-architecture flow.
 * Each entry: [user message pattern, AI response SSE body]
 */
export const INTERVIEW_RESPONSES: Array<{
  pattern: RegExp | null; // null = init (no user message)
  response: string;
}> = [
  {
    pattern: null, // chat init
    response: chunkedTextSSE([
      "Welcome! Let's design your application architecture. ",
      "What are you building? Tell me about the type of application ",
      "and the problem it solves.",
    ]),
  },
  {
    pattern: /real-time chat/i,
    response: chunkedTextSSE([
      "A real-time chat application — great choice! ",
      "What language or framework ecosystem do you prefer? ",
      "For example: TypeScript/Node.js, Python, Go, etc.",
    ]),
  },
  {
    pattern: /typescript|node/i,
    response: chunkedTextSSE([
      "TypeScript is an excellent choice for real-time apps. ",
      "What scale are you targeting? How many concurrent users ",
      "do you expect, and what's the team size?",
    ]),
  },
  {
    pattern: /thousand|1000|small|medium/i,
    response: chunkedTextSSE([
      "Got it. Based on what you've told me, here's my recommended architecture:\n\n",
      "**Frontend:** Next.js 14 with TypeScript for the web client\n",
      "**API Layer:** WebSocket server using Socket.io for real-time messaging\n",
      "**Database:** PostgreSQL 16 for message persistence\n",
      "**Cache:** Redis for session management and pub/sub\n\n",
      "This gives you a solid foundation that can scale to thousands of users.",
    ]),
  },
];

/**
 * Set up route mocking for the full interview conversation flow.
 * Returns an object to track which responses were served.
 */
export async function mockInterviewFlow(page: Page) {
  let initCalled = false;
  let chatCallCount = 0;
  const chatMessages: string[] = [];

  // Register chat route first (lower priority in Playwright — later routes win)
  await page.route("**/api/projects/*/chat", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      await route.continue();
      return;
    }

    const body = JSON.parse(request.postData() || "{}");
    const userMessage = body.message || "";
    chatMessages.push(userMessage);
    chatCallCount++;

    // Find matching response
    const matchIdx = INTERVIEW_RESPONSES.findIndex((r) => r.pattern && r.pattern.test(userMessage));

    if (matchIdx >= 0) {
      await fulfillSSE(route, INTERVIEW_RESPONSES[matchIdx].response);
    } else {
      // Default fallback response
      await fulfillSSE(
        route,
        textSSE(
          "Thank you for that information. Could you tell me more about your deployment preferences?"
        )
      );
    }
  });

  // Register init route second (higher priority in Playwright — later routes win)
  await page.route("**/api/projects/*/chat/init", async (route) => {
    initCalled = true;
    const initResponse = INTERVIEW_RESPONSES[0].response;
    await fulfillSSE(route, initResponse);
  });

  return {
    get initCalled() {
      return initCalled;
    },
    get chatCallCount() {
      return chatCallCount;
    },
    get chatMessages() {
      return [...chatMessages];
    },
  };
}

/**
 * Helper to create a project and navigate to its page.
 */
export async function createProjectAndNavigate(page: Page, name: string, description?: string) {
  await page.goto("/project/new");
  const settingsResponse = await page.request.patch("/api/settings", {
    data: {
      apiKey: "sk-ant-playwright-placeholder-key",
      model: "claude-sonnet-5",
    },
  });
  if (!settingsResponse.ok()) {
    throw new Error(`Unable to configure BYOK for E2E: ${settingsResponse.status()}`);
  }
  await page.fill("#name", name);
  if (description) {
    await page.fill("#description", description);
  }
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/project\/[a-f0-9-]+$/);
}
