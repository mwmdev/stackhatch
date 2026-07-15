import { expect, test } from "@playwright/test";

test.describe("launch experience", () => {
  test("preserves a repository from the homepage into sign in", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { level: 1, name: "Keep the whole system in view." })
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

  test("explains the outcome before presenting all four starts as equal entry points", async ({
    page,
  }) => {
    await page.goto("/");

    const heroHeading = page.getByRole("heading", {
      level: 1,
      name: "Keep the whole system in view.",
    });
    const hero = heroHeading.locator("xpath=ancestor::section[1]");
    const launchpad = page.getByLabel("Ways to start a StackHatch map");

    await expect(
      hero.getByText(/turns repositories and requirements into interactive architecture maps/i)
    ).toBeVisible();
    await expect(hero.getByRole("link", { name: "See StackHatch in action" })).toHaveAttribute(
      "href",
      "#features"
    );
    await expect(hero.getByRole("link", { name: "Start a map", exact: true })).toHaveAttribute(
      "href",
      "#start"
    );
    await expect(hero.getByRole("img", { name: /architecture map of its own/i })).toHaveAttribute(
      "src",
      "/screenshots/architecture-overview.webp"
    );
    expect(
      await hero.evaluate((heroSection) => {
        const launchpadElement = document.querySelector(
          '[aria-label="Ways to start a StackHatch map"]'
        );
        return Boolean(
          launchpadElement &&
          heroSection.compareDocumentPosition(launchpadElement) & Node.DOCUMENT_POSITION_FOLLOWING
        );
      })
    ).toBe(true);

    await expect(page.getByRole("heading", { name: "Start from wherever you are." })).toBeVisible();
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

  test("uses three unique real screenshots across the hero and feature stories", async ({
    page,
  }) => {
    await page.goto("/");

    const screenshotSources = await page
      .locator('img[src^="/screenshots/"]')
      .evaluateAll((images) => images.map((image) => image.getAttribute("src")));

    expect(screenshotSources).toEqual([
      "/screenshots/architecture-overview.webp",
      "/screenshots/ask-and-compare.webp",
      "/screenshots/notes-and-rescan.webp",
    ]);
    expect(new Set(screenshotSources).size).toBe(3);
  });

  test("keeps the outcome and product proof in the initial 1440x900 viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const heroHeading = page.getByRole("heading", {
      level: 1,
      name: "Keep the whole system in view.",
    });
    const hero = heroHeading.locator("xpath=ancestor::section[1]");
    const heroCopy = heroHeading.locator("xpath=ancestor::div[contains(@class, 'hero-intro')]");
    const productProof = hero.getByRole("img", { name: /architecture map of its own/i });
    const startSection = page.locator("#start");

    const geometry = await page.evaluate(() => {
      const bounds = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) throw new Error(`Missing element: ${selector}`);
        const rect = element.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, height: rect.height };
      };

      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        scrollWidth: document.documentElement.scrollWidth,
        hero: bounds(".hero-section"),
        copy: bounds(".hero-intro"),
        proof: bounds(".hero-product-shot img"),
        start: bounds("#start"),
      };
    });

    await expect(heroCopy).toBeVisible();
    await expect(productProof).toBeVisible();
    await expect(startSection).toBeAttached();
    expect(geometry.viewport).toEqual({ width: 1440, height: 900 });
    expect(geometry.copy.top).toBeGreaterThanOrEqual(0);
    expect(geometry.copy.bottom).toBeLessThanOrEqual(geometry.viewport.height);
    expect(geometry.proof.top).toBeLessThan(geometry.viewport.height);
    expect(
      Math.min(geometry.proof.bottom, geometry.viewport.height) - geometry.proof.top
    ).toBeGreaterThan(240);
    expect(geometry.start.top).toBeGreaterThanOrEqual(geometry.hero.bottom - 1);
    expect(geometry.scrollWidth).toBe(geometry.viewport.width);
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

    await expect(
      page.getByRole("heading", { level: 1, name: "Keep the whole system in view." })
    ).toBeVisible();
    const hero = page
      .getByRole("heading", { level: 1, name: "Keep the whole system in view." })
      .locator("xpath=ancestor::section[1]");
    await expect(hero.getByRole("link", { name: "Start a map", exact: true })).toBeVisible();
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
