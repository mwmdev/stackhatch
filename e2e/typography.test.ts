import { expect, test } from "@playwright/test";

/**
 * Guards against re-introducing synthesised weights. The UI asked for 500, 600
 * and 800 on families that shipped none of them, so roughly 113 sites rendered
 * a smeared faux-bold — on a body face chosen for legibility.
 */
test.describe("typography", () => {
  for (const route of ["/", "/project/new", "/settings", "/support"]) {
    test(`${route} renders no synthesised font weights`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");

      const unsupported = await page.evaluate(async () => {
        await document.fonts.ready;

        // What the browser actually has a real face for, per family. A variable
        // face reports its range as "min max" and covers every value between,
        // so ranges are kept as ranges rather than sampled at each 100.
        const loaded = new Map<string, [number, number][]>();
        for (const face of document.fonts) {
          const family = face.family.replace(/["']/g, "");
          const [min, max] = face.weight.split(" ").map(Number);
          if (!Number.isFinite(min)) continue;
          const ranges = loaded.get(family) ?? [];
          ranges.push([min, Number.isFinite(max) ? max : min]);
          loaded.set(family, ranges);
        }

        const problems: string[] = [];
        for (const element of document.querySelectorAll<HTMLElement>("*")) {
          if (!element.textContent?.trim()) continue;
          const style = getComputedStyle(element);
          const family = style.fontFamily.split(",")[0].replace(/["']/g, "");
          const weight = Number(style.fontWeight);
          const ranges = loaded.get(family);
          // Fallback and system stacks are outside our control.
          if (!ranges || family.includes("Fallback") || family.startsWith("ui-")) continue;
          const covered = ranges.some(([min, max]) => weight >= min && weight <= max);
          if (!covered) problems.push(`${family} @${weight}`);
        }
        return [...new Set(problems)];
      });

      expect(unsupported).toEqual([]);
    });
  }
});
