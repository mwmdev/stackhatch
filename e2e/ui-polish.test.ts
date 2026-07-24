import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    )
  ).toBe(false);
}

for (const viewport of [
  { name: "mobile", width: 320, height: 640 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test(`${viewport.name} public and app shells remain coherent`, async ({ page }) => {
    await page.setViewportSize(viewport);
    for (const route of ["/", "/app/maps", "/project/new", "/settings", "/support"]) {
      await page.goto(route);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("main")).toHaveCount(1);
      await expectNoHorizontalOverflow(page);
    }
  });
}

test("keyboard users can operate the chooser and destructive confirmation safely", async ({
  page,
}) => {
  await page.goto("/project/new");
  const blank = page.getByRole("button", { name: /Blank map/ });
  await blank.focus();
  await expect(blank).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: /Requirements file/ })).toBeFocused();

  await page.goto("/settings");
  const clear = page.getByRole("button", { name: "Clear all local data" });
  await clear.focus();
  await clear.press("Enter");
  const dialog = page.getByRole("dialog", {
    name: "Clear all StackHatch data from this device?",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel(/CLEAR THIS DEVICE/)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(clear).toBeFocused();
});
