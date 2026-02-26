import { test, expect } from "@playwright/test";

test.describe("New Project Flow", () => {
  test("validates name is required", async ({ page }) => {
    await page.goto("/project/new");

    // Click submit without entering a name
    await page.click('button[type="submit"]');

    // Should show validation error
    await expect(page.getByText("Project name is required")).toBeVisible();
  });

  test("creates project and redirects to project page", async ({ page }) => {
    // Mock the chat init to avoid needing a real API key
    await page.route("**/api/projects/*/chat/init", async (route) => {
      const body = [
        `data: ${JSON.stringify({ type: "text", content: "Welcome! Let's design your application architecture. " })}\n\n`,
        `data: ${JSON.stringify({ type: "text", content: "What are you building? Tell me about the type of application and the problem it solves." })}\n\n`,
        `data: ${JSON.stringify({ type: "done" })}\n\n`,
      ].join("");

      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
        body,
      });
    });

    await page.goto("/project/new");

    // Fill in project name
    await page.fill("#name", "Test Architecture");
    await page.fill("#description", "A test project for E2E");

    // Submit form
    await page.click('button[type="submit"]');

    // Should redirect to project page
    await page.waitForURL(/\/project\/[a-f0-9-]+$/);

    // Project name should be visible in toolbar
    await expect(page.locator("h1")).toHaveText("Test Architecture");
  });

  test("AI sends first interview message for new projects", async ({
    page,
  }) => {
    const aiMessage =
      "Welcome! Let's design your application architecture. What are you building?";

    // Mock the chat init
    await page.route("**/api/projects/*/chat/init", async (route) => {
      const chunks = [
        `data: ${JSON.stringify({ type: "text", content: aiMessage })}\n\n`,
        `data: ${JSON.stringify({ type: "done" })}\n\n`,
      ];

      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
        body: chunks.join(""),
      });
    });

    // Mock messages endpoint to return empty (new project)
    await page.route("**/api/projects/*/messages", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([]),
      });
    });

    // First create a project
    await page.goto("/project/new");
    await page.fill("#name", "AI Test Project");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/project\/[a-f0-9-]+$/);

    // Chat sidebar should be open by default (no canvas state)
    await expect(page.getByText("Architecture Assistant")).toBeVisible();

    // AI message should appear (use first() as React may render it in both stream and final state)
    await expect(page.getByText(aiMessage).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("chat sidebar is open by default on new projects", async ({ page }) => {
    // Mock chat init
    await page.route("**/api/projects/*/chat/init", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
        body: `data: ${JSON.stringify({ type: "text", content: "Hello!" })}\n\ndata: ${JSON.stringify({ type: "done" })}\n\n`,
      });
    });

    await page.goto("/project/new");
    await page.fill("#name", "Sidebar Test");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/project\/[a-f0-9-]+$/);

    // Sidebar should be visible with the header
    await expect(page.getByText("Architecture Assistant")).toBeVisible();

    // Empty canvas message should be visible
    await expect(
      page.getByText("Start a conversation to generate your architecture"),
    ).toBeVisible();
  });
});
