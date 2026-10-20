import { expect, test } from "@playwright/test";
import {
  ANTHROPIC_ORIGIN,
  TEST_ANTHROPIC_KEY,
  createBlankMap,
  mockAnthropic,
  openChat,
  sendChatMessage,
  trackExternalRequests,
  useProviderKey,
} from "./helpers/sse-mock";

test("missing credentials preserve the draft and inline setup sends it once", async ({ page }) => {
  const external = trackExternalRequests(page);
  await createBlankMap(page);
  await openChat(page);
  await sendChatMessage(page, "What should I build?");
  // No key means no request, with or without a confirmation step in the way.

  const keyPrompt = page.getByRole("alert").filter({ has: page.getByLabel("Anthropic API key") });
  await expect(keyPrompt).toBeVisible();
  await expect(page.getByPlaceholder("Ask anything…")).toHaveValue("What should I build?");
  expect(external).toEqual([]);
  const anthropic = await mockAnthropic(page, ["A local-first map."]);
  await page.getByLabel("Anthropic API key").fill(TEST_ANTHROPIC_KEY);
  await page.getByRole("button", { name: "Use key" }).click();
  await expect(page.getByText("A local-first map.")).toBeVisible();
  expect(anthropic).toHaveLength(1);
});

test("an Anthropic failure keeps the local map and offers a reviewed retry", async ({ page }) => {
  const projectId = await createBlankMap(page);
  await useProviderKey(page, { remember: true, returnTo: `/project/#${projectId}` });
  await mockAnthropic(page, ["ignored"], { status: 500 });
  await page.goto(`/project/#${projectId}`);
  await openChat(page);

  await sendChatMessage(page, "What should I build?");
  await expect(
    page.getByRole("alert").filter({ hasText: "Anthropic could not complete the request" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Review and retry" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: /Untitled map/ })).toBeVisible();
});

test("hostile model text is inert and cannot expand the egress boundary", async ({ page }) => {
  const external = trackExternalRequests(page);
  const projectId = await createBlankMap(page);
  await useProviderKey(page, { remember: true, returnTo: `/project/#${projectId}` });
  await mockAnthropic(page, [
    '<script>window.__stackhatchPwned=true</script><img src="https://evil.example/pixel"> Safe text.',
  ]);
  await page.goto(`/project/#${projectId}`);
  await openChat(page);
  await sendChatMessage(page, "What should I build?");
  await expect(page.getByText("Safe text.")).toBeVisible();

  expect(await page.evaluate(() => "__stackhatchPwned" in window)).toBe(false);
  expect(new Set(external.map((request) => new URL(request.url()).origin))).toEqual(
    new Set([ANTHROPIC_ORIGIN])
  );
});

test("an unknown local identifier has a recoverable device-local empty state", async ({ page }) => {
  await page.goto("/project/#missing-local-map");
  await expect(page.getByRole("heading", { name: "Map unavailable" })).toBeVisible();
  await expect(page.getByText("Map not found on this device.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Create a new map" })).toBeVisible();
});
