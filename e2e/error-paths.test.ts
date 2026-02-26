import { test, expect } from "@playwright/test";
import {
  createProjectAndNavigate,
  errorSSE,
  fulfillSSE,
  textSSE,
} from "./helpers/sse-mock";

test.describe("Error Paths", () => {
  test("shows error when API key is not configured", async ({ page }) => {
    // Mock chat init to return the API key error
    await page.route("**/api/projects/*/chat/init", async (route) => {
      await fulfillSSE(
        route,
        errorSSE("API key not configured. Please set it in Settings."),
      );
    });

    await createProjectAndNavigate(page, "No API Key Test");

    // Error message should appear in the chat
    await expect(
      page.getByText("API key not configured").first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("shows error when Anthropic API fails during chat", async ({
    page,
  }) => {
    // Mock init to succeed
    await page.route("**/api/projects/*/chat/init", async (route) => {
      await fulfillSSE(route, textSSE("What are you building?"));
    });

    // Mock chat to return an error
    await page.route("**/api/projects/*/chat", async (route) => {
      if (route.request().method() === "POST") {
        await fulfillSSE(
          route,
          errorSSE("Rate limit exceeded. Please try again later."),
        );
      } else {
        await route.continue();
      }
    });

    await createProjectAndNavigate(page, "API Error Test");
    await expect(
      page.getByText("What are you building?").first(),
    ).toBeVisible({ timeout: 10000 });

    // Send a message
    await page.fill("textarea", "A web app");
    await page.click('button[aria-label="Send message"]');

    // Error should appear
    await expect(page.getByText("Rate limit exceeded").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("shows error for network failure during chat init", async ({
    page,
  }) => {
    // Mock chat init to abort (network error)
    await page.route("**/api/projects/*/chat/init", async (route) => {
      await route.abort("connectionrefused");
    });

    await createProjectAndNavigate(page, "Network Error Test");

    // Should show a connection error
    await expect(
      page.getByText("Failed to start conversation").first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("shows error for network failure during chat message", async ({
    page,
  }) => {
    await page.route("**/api/projects/*/chat/init", async (route) => {
      await fulfillSSE(route, textSSE("What are you building?"));
    });

    await page.route("**/api/projects/*/chat", async (route) => {
      if (route.request().method() === "POST") {
        await route.abort("connectionrefused");
      } else {
        await route.continue();
      }
    });

    await createProjectAndNavigate(page, "Chat Network Error Test");
    await expect(
      page.getByText("What are you building?").first(),
    ).toBeVisible({ timeout: 10000 });

    await page.fill("textarea", "Something");
    await page.click('button[aria-label="Send message"]');

    // Should show send error
    await expect(
      page.getByText("Failed to send message").first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("input is disabled while AI is responding", async ({ page }) => {
    const resolver: { resolve: (() => void) | null } = { resolve: null };

    await page.route("**/api/projects/*/chat/init", async (route) => {
      await fulfillSSE(route, textSSE("What are you building?"));
    });

    await page.route("**/api/projects/*/chat", async (route) => {
      if (route.request().method() === "POST") {
        // Hold the response to observe disabled state
        await new Promise<void>((r) => {
          resolver.resolve = r;
        });
        await fulfillSSE(route, textSSE("Got it!"));
      } else {
        await route.continue();
      }
    });

    await createProjectAndNavigate(page, "Disabled Input Test");
    await expect(
      page.getByText("What are you building?").first(),
    ).toBeVisible({ timeout: 10000 });

    // Send a message
    await page.fill("textarea", "A web app");
    await page.click('button[aria-label="Send message"]');

    // Input should be disabled during streaming
    await expect(page.locator("textarea")).toBeDisabled();

    // Release the response
    resolver.resolve?.();

    // After response, input should be enabled again
    await expect(page.locator("textarea")).toBeEnabled({ timeout: 10000 });
  });

  test("empty message cannot be sent", async ({ page }) => {
    await page.route("**/api/projects/*/chat/init", async (route) => {
      await fulfillSSE(route, textSSE("What are you building?"));
    });

    await createProjectAndNavigate(page, "Empty Message Test");
    await expect(
      page.getByText("What are you building?").first(),
    ).toBeVisible({ timeout: 10000 });

    // Send button should be disabled when input is empty
    await expect(
      page.locator('button[aria-label="Send message"]'),
    ).toBeDisabled();

    // Type spaces only
    await page.fill("textarea", "   ");
    await expect(
      page.locator('button[aria-label="Send message"]'),
    ).toBeDisabled();
  });

  test("project not found shows error", async ({ page }) => {
    await page.goto("/project/nonexistent-id-12345");

    await expect(
      page.getByText("Project not found").first(),
    ).toBeVisible({ timeout: 10000 });

    // Should have a link back to dashboard
    await expect(page.getByText("Back to Dashboard")).toBeVisible();
  });
});
