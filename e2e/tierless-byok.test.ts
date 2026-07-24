import { expect, test } from "@playwright/test";
import { assertNoApplicationCookies, TEST_ANTHROPIC_KEY } from "./helpers/sse-mock";

test("session-only is the default and remembering a key is explicit and reversible", async ({
  page,
}) => {
  await page.goto("/settings");
  await expect(page.getByTestId("key-status-absent")).toBeVisible();
  await page.getByLabel("Anthropic API key").fill(TEST_ANTHROPIC_KEY);
  await page.getByRole("button", { name: "Use key" }).click();
  await expect(page.getByTestId("key-status-session")).toBeVisible();

  await page.getByLabel("Anthropic API key").fill(`${TEST_ANTHROPIC_KEY}-remembered`);
  await page.getByRole("checkbox", { name: /Remember on this device/ }).check();
  await page.getByRole("button", { name: "Use key" }).click();
  await expect(page.getByTestId("key-status-remembered")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("key-status-remembered")).toBeVisible();

  await page.getByRole("button", { name: "Forget key" }).click();
  await expect(page.getByTestId("key-status-absent")).toBeVisible();
});

test("there is no account, plan, team, or admin product surface", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/No account, no product analytics/)).toBeVisible();
  await assertNoApplicationCookies(page);

  for (const route of ["/login", "/account", "/pricing", "/team", "/admin"]) {
    expect((await page.request.get(route)).status(), route).toBe(404);
  }
});
