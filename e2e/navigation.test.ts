import { expect, test, type Page } from "@playwright/test";
import { createBlankMap } from "./helpers/sse-mock";

async function expectMapOpen(page: Page, projectId: string) {
  await expect.poll(() => new URL(page.url()).hash).toBe(`#${projectId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Untitled map" })).toBeVisible();
  await expect(page.getByText("Map unavailable")).toHaveCount(0);
}

test("switching between maps from All maps opens each map", async ({ page }) => {
  const first = await createBlankMap(page);
  const second = await createBlankMap(page);
  expect(second).not.toBe(first);

  await page.goto("/app/maps");
  await page.getByTestId(`project-card-${first}`).click();
  await expectMapOpen(page, first);

  await page
    .getByRole("link", { name: /All maps/i })
    .first()
    .click();
  await page.getByTestId(`project-card-${second}`).click();
  await expectMapOpen(page, second);

  await page.goBack();
  await page.goBack();
  await expectMapOpen(page, first);
});
