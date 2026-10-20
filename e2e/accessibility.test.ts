import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createBlankMap, useProviderKey } from "./helpers/sse-mock";

/**
 * The audit that prompted these tests found contrast and keyboard defects that
 * had survived three visual passes, so the rules are checked mechanically now.
 * Both themes run: the palettes are tuned independently.
 */
const RULES = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function scan(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(RULES).analyze();
  return violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => node.target.join(" ")),
  }));
}

async function setTheme(page: Page, theme: "light" | "dark") {
  // next-themes reads this before hydration, so it must be set before the load.
  await page.addInitScript((value) => window.localStorage.setItem("theme", value), theme);
}

for (const theme of ["light", "dark"] as const) {
  for (const route of ["/", "/app/maps", "/project/new", "/settings", "/support", "/privacy"]) {
    test(`${route} has no accessibility violations in ${theme} mode`, async ({ page }) => {
      await setTheme(page, theme);
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      expect(await scan(page)).toEqual([]);
    });
  }

  test(`the editor has no accessibility violations in ${theme} mode`, async ({ page }) => {
    await setTheme(page, theme);
    const projectId = await createBlankMap(page);
    expect(projectId).toBeTruthy();
    await page.waitForSelector("[data-testid='editor-project-bar']");
    expect(await scan(page)).toEqual([]);
  });

  test(`the repository start with the GitHub token open has no accessibility violations in ${theme} mode`, async ({
    page,
  }) => {
    await setTheme(page, theme);
    await useProviderKey(page, { remember: true });
    await page.goto("/project/new");
    await page.getByRole("button", { name: "Private repository? Add a GitHub token" }).click();
    await expect(page.getByLabel("GitHub token")).toBeVisible();
    expect(await scan(page)).toEqual([]);
  });
}
