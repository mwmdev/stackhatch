import { expect, test } from "@playwright/test";

test.describe("launch experience", () => {
  test("uses one public application entry without a source form", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { level: 1, name: "Keep the whole system in view." })
    ).toBeVisible();

    const starts = page.getByRole("link", { name: "Start a map" });
    await expect(starts.first()).toHaveAttribute("href", "/app");
    expect(await starts.count()).toBeGreaterThan(1);
    await expect(page.getByRole("textbox", { name: "Public GitHub repository" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Map repository" })).toHaveCount(0);
  });

  test("explains the outcome before presenting the unified editor entry", async ({ page }) => {
    await page.goto("/");

    const heroHeading = page.getByRole("heading", {
      level: 1,
      name: "Keep the whole system in view.",
    });
    const hero = heroHeading.locator("xpath=ancestor::section[1]");
    const startSection = page.locator("#start");

    await expect(
      hero.getByText(/turns repositories and requirements into interactive architecture maps/i)
    ).toBeVisible();
    await expect(hero.getByRole("link", { name: "Start a map" })).toHaveAttribute("href", "/app");
    await expect(hero.getByRole("link", { name: "See StackHatch in action" })).toHaveAttribute(
      "href",
      "#features"
    );
    await expect(hero.getByRole("img", { name: /architecture map of its own/i })).toHaveAttribute(
      "src",
      "/screenshots/architecture-overview.webp"
    );
    expect(
      await hero.evaluate((heroSection) => {
        const launchpadElement = document.querySelector("#start");
        return Boolean(
          launchpadElement &&
          heroSection.compareDocumentPosition(launchpadElement) & Node.DOCUMENT_POSITION_FOLLOWING
        );
      })
    ).toBe(true);

    await expect(page.getByRole("heading", { name: "Start from wherever you are." })).toBeVisible();
    await expect(
      startSection.getByRole("heading", {
        name: "Open the editor. Pick a source only when you need one.",
      })
    ).toBeVisible();
    await expect(startSection.getByRole("link", { name: "Start a map" })).toHaveAttribute(
      "href",
      "/app"
    );
    for (const heading of ["Start fresh", "Upload requirements", "Map a repo", "Use a template"]) {
      await expect(startSection.getByRole("heading", { name: heading })).toHaveCount(0);
    }
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
      "/screenshots/note-node-and-rescan.webp",
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
    const heroCopy = page.locator('[data-landing-region="hero-copy"]');
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
        headlineLines: new Set(
          Array.from(document.querySelectorAll("#hero-heading span")).flatMap((line) => {
            const range = document.createRange();
            range.selectNodeContents(line);
            return Array.from(range.getClientRects()).map((rect) => Math.round(rect.top));
          })
        ).size,
        hero: bounds('[data-landing-region="hero"]'),
        copy: bounds('[data-landing-region="hero-copy"]'),
        proof: bounds('[data-landing-region="hero-proof"] img'),
        start: bounds("#start"),
      };
    });

    await expect(heroCopy).toBeVisible();
    await expect(productProof).toBeVisible();
    await expect(startSection).toBeAttached();
    expect(geometry.viewport).toEqual({ width: 1440, height: 900 });
    expect(geometry.headlineLines).toBe(2);
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

  test("keeps the editorial headline and canvas within the 1600px and 390px viewports", async ({
    page,
  }) => {
    for (const viewport of [
      { width: 1600, height: 900, expectedLines: 2 },
      { width: 390, height: 844, expectedLines: 3 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/");

      const layout = await page.evaluate(() => {
        const lineTops = Array.from(document.querySelectorAll("#hero-heading span")).flatMap(
          (line) => {
            const range = document.createRange();
            range.selectNodeContents(line);
            return Array.from(range.getClientRects()).map((rect) => Math.round(rect.top));
          }
        );

        return {
          viewportWidth: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          headlineLines: new Set(lineTops).size,
        };
      });

      expect(layout.scrollWidth).toBe(layout.viewportWidth);
      expect(layout.headlineLines).toBe(viewport.expectedLines);
    }
  });

  test("pins the desktop product story while its screenshot transition progresses", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const firstStory = page
      .locator('img[src="/screenshots/ask-and-compare.webp"]')
      .locator("xpath=ancestor::article[1]");
    await firstStory.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 260));
    await page.waitForTimeout(200);
    const before = await firstStory.evaluate((story) => ({
      position: getComputedStyle(story).position,
      top: Math.round(story.getBoundingClientRect().top),
    }));

    await page.evaluate(() => window.scrollBy(0, 320));
    await page.waitForTimeout(200);
    const after = await firstStory.evaluate((story) =>
      Math.round(story.getBoundingClientRect().top)
    );

    expect(before.position).toBe("sticky");
    expect(before.top).toBeGreaterThan(0);
    expect(Math.abs(after - before.top)).toBeLessThanOrEqual(1);
  });

  test("keeps the dark, reduced-motion entry usable at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.goto("/");

    await expect(
      page.getByRole("heading", { level: 1, name: "Keep the whole system in view." })
    ).toBeVisible();
    const hero = page
      .getByRole("heading", { level: 1, name: "Keep the whole system in view." })
      .locator("xpath=ancestor::section[1]");
    await expect(hero.getByRole("link", { name: "Start a map" })).toBeVisible();
    const startSection = page.locator("#start");
    await expect(startSection.getByRole("link", { name: "Start a map" })).toBeVisible();
    await expect(page.getByRole("link", { name: /demo/i })).toHaveCount(0);
    await expect(page.locator("html")).toHaveClass(/dark/);

    const layout = await page.evaluate(() => {
      const lineTops = Array.from(document.querySelectorAll("#hero-heading span")).flatMap(
        (line) => {
          const range = document.createRange();
          range.selectNodeContents(line);
          return Array.from(range.getClientRects()).map((rect) => Math.round(rect.top));
        }
      );

      return {
        viewport: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        headlineLines: new Set(lineTops).size,
        marqueeAnimation: getComputedStyle(
          document.querySelector<HTMLElement>('[data-landing-region="marquee"] > div')!
        ).animationName,
        storyImages: Array.from(
          document.querySelectorAll<HTMLElement>('article img[src^="/screenshots/"]')
        ).map((image) => ({
          transform: getComputedStyle(image).transform,
          cardPosition: getComputedStyle(image.closest("article")!).position,
        })),
        useCaseHeadingPosition: getComputedStyle(
          document.querySelector<HTMLElement>("#use-cases-heading")!.parentElement!
        ).position,
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
      };
    });
    expect(layout.scrollWidth, JSON.stringify(layout.offenders)).toBe(layout.viewport);
    expect(layout.headlineLines).toBeLessThanOrEqual(3);
    expect(layout.marqueeAnimation).toBe("none");
    expect(layout.storyImages).toEqual([
      { transform: "none", cardPosition: "relative" },
      { transform: "none", cardPosition: "relative" },
    ]);
    expect(layout.useCaseHeadingPosition).toBe("static");
  });
});
