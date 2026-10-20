import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createBlankMap, mockAnthropic, useProviderKey } from "./helpers/sse-mock";

const GENERATED_STACK =
  'Mapped.\n<stack>{"nodes":[{"id":"api","category":"api","subtype":"rest-api","name":"Platform API","technology":"Hono","description":"Owns the platform boundary","reasoning":"Inferred","locked":false}],"edges":[]}</stack>';

test("a full backup excludes credentials and restores cleared browser data", async ({ page }) => {
  const projectId = await createBlankMap(page);
  await useProviderKey(page, { remember: true, returnTo: `/project/#${projectId}` });
  await page.goto("/app/maps");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Back up all maps" }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  expect(backupPath).not.toBeNull();
  const backup = await readFile(backupPath!, "utf8");
  expect(JSON.parse(backup)).toMatchObject({
    format: "stackhatch-backup",
    exportKind: "vault",
  });
  expect(backup).not.toContain("sk-ant-");

  await page.goto("/settings");
  await page.getByRole("button", { name: "Clear all local data" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Clear all StackHatch data from this device?",
  });
  await dialog.getByLabel(/CLEAR THIS DEVICE/).fill("CLEAR THIS DEVICE");
  await dialog.getByRole("button", { name: "Permanently clear this device" }).click();
  await page.waitForURL("/");

  await page.goto("/app/maps");
  await expect(page.getByText("Untitled map")).toHaveCount(0);
  await page.goto("/settings");
  await expect(page.getByTestId("key-status-absent")).toBeVisible();
  await page.goto("/app/maps");
  await page.getByLabel("Choose StackHatch backup").setInputFiles({
    name: "stackhatch-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(backup),
  });
  await expect(page.getByRole("region", { name: "Backup preview" })).toContainText("Untitled map");
  const restoredReload = page.waitForEvent("load");
  await page.getByRole("button", { name: "Restore backup" }).click();
  await restoredReload;

  await expect(page.getByText("Untitled map")).toBeVisible();
});

test("a requirements map can be exported without exposing template actions", async ({ page }) => {
  await mockAnthropic(page, [GENERATED_STACK]);
  await useProviderKey(page, { remember: true });
  await page.goto("/project/new");
  await page.getByLabel("Choose .md or .txt file").setInputFiles({
    name: "platform.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Platform map\n\nA REST API owns the platform boundary."),
  });
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#.+/);
  await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Export map" }).click();
  await expect(page.getByText("Generate PRD")).toBeVisible();
  await expect(page.getByText("Uses an Anthropic call")).toHaveCount(0);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("Platform map.json");

  await expect(page.getByRole("button", { name: "More project actions" })).toHaveCount(0);
  await expect(page.getByTestId("editor-more-popover")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save as Template" })).toHaveCount(0);
});
