import { expect, test } from "@playwright/test";

test.describe("launch experience", () => {
  test("uses one public application entry without a source form", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { level: 1, name: "Keep the whole stack in view" })
    ).toBeVisible();

    const starts = page.getByRole("link", { name: "Start a map" });
    await expect(starts.first()).toHaveAttribute("href", "/app");
    expect(await starts.count()).toBeGreaterThan(1);
    await expect(page.getByRole("textbox", { name: "Public GitHub repository" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Map repository" })).toHaveCount(0);
  });

  test("explains the outcome before a compact proof-led product story", async ({ page }) => {
    await page.goto("/");

    const heroHeading = page.getByRole("heading", {
      level: 1,
      name: "Keep the whole stack in view",
    });
    const hero = heroHeading.locator("xpath=ancestor::section[1]");

    await expect(
      hero.getByText(/turns repositories and requirements into interactive architecture maps/i)
    ).toBeVisible();
    await expect(hero.getByRole("link", { name: "Start a map" })).toHaveAttribute("href", "/app");
    await expect(hero.getByRole("link", { name: "See what it does" })).toHaveAttribute(
      "href",
      "#features"
    );
    await expect(
      hero.getByRole("img", { name: /synthetic customer portal reference architecture/i })
    ).toHaveAttribute("src", "/screenshots/architecture-overview.webp");
    const regionOrder = await page
      .locator("[data-landing-region]")
      .evaluateAll((regions) =>
        regions.map((region) => region.getAttribute("data-landing-region"))
      );
    expect(regionOrder).toEqual(["hero", "trust", "capabilities", "workflow", "final-cta"]);
  });

  test("uses one real screenshot and no ticker, story stack, or carousel", async ({ page }) => {
    await page.goto("/");

    const screenshotSources = await page
      .locator('img[src^="/screenshots/"]')
      .evaluateAll((images) => images.map((image) => image.getAttribute("src")));

    expect(screenshotSources).toEqual(["/screenshots/architecture-overview.webp"]);
    await expect(page.locator('[data-landing-region="marquee"]')).toHaveCount(0);
    await expect(page.locator('[aria-roledescription="carousel"]')).toHaveCount(0);
    await expect(page.locator(".storyStack, .storyCard")).toHaveCount(0);
  });

  test("keeps the outcome and product proof in the initial 1440x900 viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const heroHeading = page.getByRole("heading", {
      level: 1,
      name: "Keep the whole stack in view",
    });
    const hero = heroHeading.locator("xpath=ancestor::section[1]");
    const heroCopy = page.getByTestId("hero-copy");
    const productProof = hero.getByRole("img", {
      name: /synthetic customer portal reference architecture/i,
    });
    const trustSection = page.locator('[data-landing-region="trust"]');

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
        copy: bounds('[data-testid="hero-copy"]'),
        proof: bounds('[data-testid="hero-proof"] img'),
        trust: bounds('[data-landing-region="trust"]'),
      };
    });

    await expect(heroCopy).toBeVisible();
    await expect(productProof).toBeVisible();
    await expect(trustSection).toBeAttached();
    expect(geometry.viewport).toEqual({ width: 1440, height: 900 });
    expect(geometry.headlineLines).toBe(2);
    expect(geometry.copy.top).toBeGreaterThanOrEqual(0);
    expect(geometry.copy.bottom).toBeLessThanOrEqual(geometry.viewport.height);
    expect(geometry.proof.top).toBeLessThan(geometry.viewport.height);
    expect(
      Math.min(geometry.proof.bottom, geometry.viewport.height) - geometry.proof.top
    ).toBeGreaterThan(240);
    expect(geometry.trust.top).toBeGreaterThanOrEqual(geometry.hero.bottom - 1);
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

  test("keeps the dark, reduced-motion entry usable at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.goto("/");

    await expect(
      page.getByRole("heading", { level: 1, name: "Keep the whole stack in view" })
    ).toBeVisible();
    const hero = page
      .getByRole("heading", { level: 1, name: "Keep the whole stack in view" })
      .locator("xpath=ancestor::section[1]");
    await expect(hero.getByRole("link", { name: "Start a map" })).toBeVisible();
    await expect(page.locator('[data-landing-region="final-cta"]')).toBeAttached();
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
        screenshotCount: document.querySelectorAll('img[src^="/screenshots/"]').length,
        regionOrder: Array.from(
          document.querySelectorAll<HTMLElement>("[data-landing-region]")
        ).map((region) => region.dataset.landingRegion),
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
    expect(layout.screenshotCount).toBe(1);
    expect(layout.regionOrder).toEqual(["hero", "trust", "capabilities", "workflow", "final-cta"]);
  });

  test("keeps the public observatory routes focused and contained on phone and desktop", async ({
    page,
  }) => {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);

      for (const publicRoute of [
        { path: "/login", heading: "Turn what you have into an architecture map." },
        { path: "/support", heading: "Get from repository to a map you can reason about." },
        { path: "/privacy", heading: "Privacy Policy" },
        { path: "/terms", heading: "Terms of Service" },
      ]) {
        await page.goto(publicRoute.path);

        await expect(
          page.getByRole("heading", { level: 1, name: publicRoute.heading })
        ).toBeVisible();
        await expect(page.locator("main")).toHaveCount(1);
        await expect(page.locator('[data-routing-trace="true"]')).toHaveCount(1);
        expect(
          await page.evaluate(() => ({
            viewport: window.innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
          }))
        ).toEqual({ viewport: viewport.width, scrollWidth: viewport.width });
      }
    }
  });
});
