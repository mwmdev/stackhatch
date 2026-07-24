import { expect, test } from "@playwright/test";
import {
  ANTHROPIC_ORIGIN,
  createBlankMap,
  mockAnthropic,
  openChat,
  trackExternalRequests,
  useAnthropicKey,
} from "./helpers/sse-mock";

test("missing credentials never dispatch a provider request", async ({ page }) => {
  const external = trackExternalRequests(page);
  await createBlankMap(page);
  await page.getByRole("button", { name: "Start interview" }).click();
  await expect(page.getByRole("dialog", { name: "Anthropic data disclosure" })).toBeVisible();
  expect(external).toEqual([]);
  await page.getByRole("button", { name: "Continue to Anthropic" }).click();

  await expect(page.getByText("Add your Anthropic key")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open device settings" })).toBeVisible();
  expect(external).toEqual([]);
});

test("an Anthropic failure keeps the local map and offers a reviewed retry", async ({ page }) => {
  const projectId = await createBlankMap(page);
  await useAnthropicKey(page, { remember: true, returnTo: `/project/#${projectId}` });
  await mockAnthropic(page, ["ignored"], { status: 500 });
  await page.goto(`/project/#${projectId}`);
  await openChat(page);

  await page.getByRole("button", { name: "Start interview" }).click();
  await page.getByRole("button", { name: "Continue to Anthropic" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review and retry" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Untitled Project" })).toBeVisible();
});

test("hostile model text is inert and cannot expand the egress boundary", async ({ page }) => {
  const external = trackExternalRequests(page);
  const projectId = await createBlankMap(page);
  await useAnthropicKey(page, { remember: true, returnTo: `/project/#${projectId}` });
  await mockAnthropic(page, [
    '<script>window.__stackhatchPwned=true</script><img src="https://evil.example/pixel"> Safe text.',
  ]);
  await page.goto(`/project/#${projectId}`);
  await openChat(page);
  await page.getByRole("button", { name: "Start interview" }).click();
  await page.getByRole("button", { name: "Continue to Anthropic" }).click();
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
