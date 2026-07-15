import { expect, test } from "@playwright/test";

test.describe("launch experience", () => {
  test("preserves a repository from the homepage into sign in", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { level: 1, name: "Start with what you have." })
    ).toBeVisible();

    const repository = page.getByRole("article").filter({ hasText: "Map a repo" });
    await repository.getByRole("textbox", { name: "Public GitHub repository" }).fill("not a repo");
    await repository.getByRole("button", { name: "Map repository" }).click();
    await expect(repository.getByRole("alert")).toContainText("public GitHub repository");

    await repository
      .getByRole("textbox", { name: "Public GitHub repository" })
      .fill("mwmdev/stackhatch");
    await repository.getByRole("button", { name: "Map repository" }).click();

    await expect(page).toHaveURL(/\/login\?callbackUrl=/);
    const callback = new URL(page.url()).searchParams.get("callbackUrl");
    expect(callback).toBe("/project/new?mode=repository&repo=mwmdev%2Fstackhatch");
    await expect(
      page.getByRole("heading", { name: "Repository ready: mwmdev/stackhatch" })
    ).toBeVisible();
  });

  test("presents all four starts as equal entry points", async ({ page }) => {
    await page.goto("/");

    const launchpad = page.getByLabel("Ways to start a StackHatch map");
    await expect(launchpad.getByRole("heading", { name: "Start fresh" })).toBeVisible();
    await expect(launchpad.getByRole("heading", { name: "Upload requirements" })).toBeVisible();
    await expect(launchpad.getByRole("heading", { name: "Map a repo" })).toBeVisible();
    await expect(launchpad.getByRole("heading", { name: "Use a template" })).toBeVisible();
    await expect(page.getByText("One architecture map")).toBeAttached();

    await page.getByRole("button", { name: "Choose a template" }).click();
    await expect(page).toHaveURL(/\/login\?callbackUrl=/);
    const callback = new URL(page.url()).searchParams.get("callbackUrl");
    expect(callback).toBe("/project/new?mode=template");
  });

  test("retires the former demo URL with a real 404", async ({ page }) => {
    const response = await page.request.get("/demo");

    expect(response.status()).toBe(404);
    expect(await response.text()).toBe("");
  });

  test("keeps the dark, reduced-motion launchpad usable at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.goto("/");

    const launchpad = page.getByLabel("Ways to start a StackHatch map");
    for (const heading of ["Start fresh", "Upload requirements", "Map a repo", "Use a template"]) {
      await expect(launchpad.getByRole("heading", { name: heading })).toBeVisible();
    }
    await expect(page.getByRole("link", { name: /demo/i })).toHaveCount(0);
    await expect(page.locator("html")).toHaveClass(/dark/);

    const layout = await page.evaluate(() => ({
      viewport: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      offenders: Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .map((element) => {
          const bounds = element.getBoundingClientRect();
          return {
            element: `${element.tagName.toLowerCase()}.${element.className}`,
            left: Math.round(bounds.left),
            right: Math.round(bounds.right),
          };
        })
        .filter((element) => element.left < -1 || element.right > window.innerWidth + 1)
        .slice(0, 8),
    }));
    expect(layout.scrollWidth, JSON.stringify(layout.offenders)).toBe(layout.viewport);
  });
});
