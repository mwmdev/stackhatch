import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createBlankMap, useAnthropicKey } from "./helpers/sse-mock";

test("a full backup excludes credentials and restores cleared browser data", async ({ page }) => {
  const projectId = await createBlankMap(page);
  await useAnthropicKey(page, { remember: true, returnTo: `/project/#${projectId}` });
  await page.goto("/settings");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Back up all data" }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  expect(backupPath).not.toBeNull();
  const backup = await readFile(backupPath!, "utf8");
  expect(JSON.parse(backup)).toMatchObject({
    format: "stackhatch-backup",
    exportKind: "vault",
  });
  expect(backup).not.toContain("sk-ant-");

  await page.getByRole("button", { name: "Clear all local data" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Clear all StackHatch data from this device?",
  });
  await dialog.getByLabel(/CLEAR THIS DEVICE/).fill("CLEAR THIS DEVICE");
  await dialog.getByRole("button", { name: "Permanently clear this device" }).click();
  await page.waitForURL("/");

  await page.goto("/app/maps");
  await expect(page.getByText("Untitled Project")).toHaveCount(0);
  await page.goto("/settings");
  await expect(page.getByTestId("key-status-absent")).toBeVisible();
  await page.getByLabel("Choose StackHatch backup").setInputFiles({
    name: "stackhatch-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(backup),
  });
  await expect(page.getByRole("region", { name: "Backup preview" })).toContainText(
    "Untitled Project"
  );
  const restoredReload = page.waitForEvent("load");
  await page.getByRole("button", { name: "Restore backup" }).click();
  await restoredReload;

  await page.goto("/app/maps");
  await expect(page.getByText("Untitled Project")).toBeVisible();
});

test("a template map can be exported and saved as a personal template", async ({ page }) => {
  await page.goto("/project/new");
  await page.getByRole("button", { name: /Template/ }).click();
  await page.getByRole("button", { name: /Web app foundation/ }).click();
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#.+/);

  await page.getByRole("button", { name: "Export map" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/Web app foundation.*\.json$/);

  await page.getByRole("button", { name: "More project actions" }).click();
  await page.getByRole("button", { name: "Save as Template" }).click();
  await page.getByLabel("Template Name *").fill("My private starter");
  await page.getByRole("button", { name: "Save Template" }).click();
  await expect(page.getByText("Template saved successfully!")).toBeVisible();

  await page.goto("/project/new");
  await page.getByRole("button", { name: /Template/ }).click();
  await expect(page.getByRole("button", { name: /My private starter/ })).toBeVisible();
});
