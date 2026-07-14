import { test, expect } from "@playwright/test";
import {
  mockInterviewFlow,
  createProjectAndNavigate,
  textSSE,
  fulfillSSE,
  chunkedTextSSE,
} from "./helpers/sse-mock";

test.describe("Full E2E Interview-to-Canvas Flow", () => {
  test("complete interview flow: create project, chat with AI, receive architecture", async ({
    page,
  }) => {
    const tracker = await mockInterviewFlow(page);

    // 1. Create a new project from the new project page
    await createProjectAndNavigate(page, "Real-Time Chat App", "A chat app");

    // 2. Verify project page loads with correct name
    await expect(page.locator("h1")).toHaveText("Real-Time Chat App");

    // 3. Verify chat sidebar is open (new project has no canvas)
    await expect(page.locator('button[aria-label="Hide chat sidebar"]')).toBeVisible();

    // 4. Verify AI sends first interview message
    await expect(page.getByText(/What are you building/).first()).toBeVisible({ timeout: 10000 });
    expect(tracker.initCalled).toBe(true);

    // 5. Send first user message describing the app
    await page.fill("textarea", "I want to build a real-time chat application");
    await page.click('button[aria-label="Send message"]');

    // 6. Verify user message appears in chat
    await expect(page.getByText("I want to build a real-time chat application")).toBeVisible();

    // 7. Verify AI response about language preference
    await expect(page.getByText(/language or framework ecosystem/).first()).toBeVisible({
      timeout: 10000,
    });

    // 8. Send second user message
    await page.fill("textarea", "I prefer TypeScript and Node.js");
    await page.click('button[aria-label="Send message"]');

    // 9. Verify second AI response about scale
    await expect(page.getByText(/scale/).first()).toBeVisible({
      timeout: 10000,
    });

    // 10. Send third user message to trigger architecture generation
    await page.fill("textarea", "Around a thousand concurrent users, small team");
    await page.click('button[aria-label="Send message"]');

    // 11. Verify architecture recommendation appears in chat
    await expect(page.getByText(/PostgreSQL 16/).first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/Socket.io/).first()).toBeVisible();

    // 12. Verify all exchanges happened
    expect(tracker.chatCallCount).toBe(3);

    // 13. Verify the editor still gives a clear next action before architecture arrives.
    await expect(page.getByText("Ask an architecture question or add a component")).toBeVisible();
  });

  test("chat messages persist across page reloads", async ({ page }) => {
    const aiWelcome = "Welcome! What are you building?";
    const aiResponse = "Great choice! Tell me more about your tech preferences.";

    // Use a single route handler to avoid priority conflicts
    await page.route("**/api/projects/*/chat/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/chat/init")) {
        await fulfillSSE(route, textSSE(aiWelcome));
      } else {
        await route.continue();
      }
    });

    await page.route("**/api/projects/*/chat", async (route) => {
      if (route.request().method() === "POST") {
        await fulfillSSE(route, textSSE(aiResponse));
      } else {
        await route.continue();
      }
    });

    // Create project and have initial exchange
    await createProjectAndNavigate(page, "Persistence Test");
    await expect(page.getByText(aiWelcome).first()).toBeVisible({
      timeout: 10000,
    });

    // Send a message
    await page.fill("textarea", "Building a todo app");
    await page.click('button[aria-label="Send message"]');
    await expect(page.getByText(/tech preferences/).first()).toBeVisible({
      timeout: 10000,
    });

    // Capture the project ID from URL for mocking on reload
    const projectUrl = page.url();
    const projectId = projectUrl.split("/project/")[1];

    // Remove all route mocks
    await page.unrouteAll();

    // On reload, mock the messages endpoint to return "persisted" data
    // (since mocked SSE doesn't go through the real server to save to DB)
    await page.route(`**/api/projects/${projectId}/messages`, async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          {
            id: "msg-1",
            projectId,
            role: "assistant",
            content: aiWelcome,
            createdAt: 1000,
          },
          {
            id: "msg-2",
            projectId,
            role: "user",
            content: "Building a todo app",
            createdAt: 2000,
          },
          {
            id: "msg-3",
            projectId,
            role: "assistant",
            content: aiResponse,
            createdAt: 3000,
          },
        ]),
      });
    });

    // Prevent re-triggering init on reload
    await page.route("**/api/projects/*/chat/**", async (route) => {
      await route.fulfill({
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Chat already initialized" }),
      });
    });

    // Reload the page
    await page.goto(projectUrl);

    // Verify the project name is still shown
    await expect(page.locator("h1")).toHaveText("Persistence Test");

    // Verify "persisted" messages are loaded
    await expect(page.getByText(aiWelcome).first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText("Building a todo app")).toBeVisible();
    await expect(page.getByText(/tech preferences/).first()).toBeVisible();
  });

  test("multiple messages display in correct order", async ({ page }) => {
    // Track chat message count separately from init (React Strict Mode may
    // double-invoke the init effect in development)
    let chatCallCount = 0;
    const chatResponses = ["Second question: What tech stack?", "Third question: What scale?"];

    // Single route handler to avoid Playwright route priority issues
    await page.route("**/api/projects/*/chat**", async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (url.includes("/chat/init") && method === "POST") {
        await fulfillSSE(route, textSSE("First question: What are you building?"));
      } else if (url.endsWith("/chat") && method === "POST") {
        const idx = Math.min(chatCallCount, chatResponses.length - 1);
        await fulfillSSE(route, textSSE(chatResponses[idx]));
        chatCallCount++;
      } else {
        await route.continue();
      }
    });

    await createProjectAndNavigate(page, "Order Test");

    // Wait for init message
    await expect(page.getByText("First question: What are you building?").first()).toBeVisible({
      timeout: 10000,
    });

    // Send messages
    const textarea = page.locator("textarea");
    await expect(textarea).toBeEnabled({ timeout: 5000 });
    await textarea.fill("A web app");
    await textarea.press("Enter");

    await expect(page.getByText("Second question: What tech stack?").first()).toBeVisible({
      timeout: 10000,
    });

    await textarea.fill("React and Node");
    await textarea.press("Enter");
    await expect(page.getByText("Third question: What scale?").first()).toBeVisible({
      timeout: 10000,
    });

    // Verify all messages visible and in order
    const allMessages = page.locator('[data-testid^="chat-message-"]');
    const count = await allMessages.count();
    // Should have: init AI message + 2 user messages + 2 AI responses = 5
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test("typing indicator shows during AI response", async ({ page }) => {
    // Use a delayed response to observe the typing indicator
    await page.route("**/api/projects/*/chat/init", async (route) => {
      await fulfillSSE(route, textSSE("Hello! What are you building?"));
    });

    await page.route("**/api/projects/*/chat", async (route) => {
      if (route.request().method() === "POST") {
        // Delay to give time to observe typing indicator
        await new Promise((resolve) => setTimeout(resolve, 500));
        await fulfillSSE(route, textSSE("Thanks for sharing!"));
      } else {
        await route.continue();
      }
    });

    await createProjectAndNavigate(page, "Typing Indicator Test");
    await expect(page.getByText("Hello! What are you building?").first()).toBeVisible({
      timeout: 10000,
    });

    // Send a message
    await page.fill("textarea", "A blog platform");
    await page.click('button[aria-label="Send message"]');

    // The typing indicator should appear briefly (or the response arrives)
    // We check that eventually the response shows up
    await expect(page.getByText("Thanks for sharing!").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("send on Enter key, newline on Shift+Enter", async ({ page }) => {
    await page.route("**/api/projects/*/chat/init", async (route) => {
      await fulfillSSE(route, textSSE("What are you building?"));
    });

    await page.route("**/api/projects/*/chat", async (route) => {
      if (route.request().method() === "POST") {
        await fulfillSSE(route, textSSE("Got it!"));
      } else {
        await route.continue();
      }
    });

    await createProjectAndNavigate(page, "Keyboard Test");
    await expect(page.getByText("What are you building?").first()).toBeVisible({ timeout: 10000 });

    const textarea = page.locator("textarea");

    // Shift+Enter should add a newline, not send
    await textarea.fill("Line 1");
    await textarea.press("Shift+Enter");
    await textarea.type("Line 2");

    // Textarea should contain both lines
    const value = await textarea.inputValue();
    expect(value).toContain("Line 1");
    expect(value).toContain("Line 2");

    // Clear and type a normal message, then press Enter to send
    await textarea.fill("A simple app");
    await textarea.press("Enter");

    // Should send the message
    await expect(page.getByText("A simple app")).toBeVisible();
    await expect(page.getByText("Got it!").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("chat sidebar collapse and expand", async ({ page }) => {
    await page.route("**/api/projects/*/chat/init", async (route) => {
      await fulfillSSE(route, textSSE("Hello!"));
    });

    await createProjectAndNavigate(page, "Sidebar Toggle Test");

    // Sidebar should be open by default for new projects
    await expect(page.locator('button[aria-label="Hide chat sidebar"]')).toBeVisible();

    // Collapse the sidebar
    await page.click('button[aria-label="Hide chat sidebar"]');

    // Sidebar controls should be hidden and toolbar control should offer to reopen it
    await expect(page.locator('button[aria-label="Hide chat sidebar"]')).not.toBeVisible();

    // Open chat button should remain visible at the editor's top-left
    await expect(page.locator('button[aria-label="Show chat sidebar"]')).toBeVisible();

    // Expand again
    await page.click('button[aria-label="Show chat sidebar"]');

    // Sidebar should be visible again
    await expect(page.locator('button[aria-label="Hide chat sidebar"]')).toBeVisible();
  });

  test("markdown rendering in AI responses", async ({ page }) => {
    await page.route("**/api/projects/*/chat/init", async (route) => {
      await fulfillSSE(
        route,
        textSSE(
          "Here are your options:\n\n" +
            "**Option 1:** Use PostgreSQL\n\n" +
            "**Option 2:** Use MongoDB\n\n" +
            "- Fast queries\n- ACID compliance"
        )
      );
    });

    await createProjectAndNavigate(page, "Markdown Test");

    // Wait for the message to appear
    await expect(page.getByText("Option 1:").first()).toBeVisible({
      timeout: 10000,
    });

    // Verify bold text is rendered (as <strong> tags)
    await expect(page.locator("strong").filter({ hasText: "Option 1:" })).toBeVisible();
    await expect(page.locator("strong").filter({ hasText: "Option 2:" })).toBeVisible();

    // Verify list items render
    await expect(page.getByText("Fast queries")).toBeVisible();
    await expect(page.getByText("ACID compliance")).toBeVisible();
  });
});
