#!/usr/bin/env node
/**
 * Records the computed styles that the token utilities drive, for every element
 * on a set of routes, in both themes. Used to prove a refactor of those
 * utilities changes nothing a user can see.
 *
 * Usage: node scripts/computed-style-snapshot.mjs <baseUrl> <outFile>
 */
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const [baseUrl, outFile] = process.argv.slice(2);
if (!baseUrl || !outFile) {
  console.error("usage: computed-style-snapshot.mjs <baseUrl> <outFile>");
  process.exit(1);
}

const ROUTES = ["/", "/app/maps", "/project/new", "/settings", "/support", "/privacy", "/terms"];
const PROPERTIES = [
  "color",
  "backgroundColor",
  "borderTopColor",
  "borderBottomColor",
  "borderLeftColor",
  "borderRightColor",
  "borderTopLeftRadius",
  "borderBottomRightRadius",
  "boxShadow",
  "fontSize",
  "fontWeight",
  "outlineColor",
];

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
});
const snapshot = {};

for (const colorScheme of ["light", "dark"]) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme });
  const page = await context.newPage();
  for (const route of ROUTES) {
    await page.goto(baseUrl + route, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(900);
    snapshot[`${colorScheme}${route}`] = await page.evaluate((properties) => {
      const rows = [];
      // Index by DOM position so the comparison survives class-name churn.
      const walk = (node, path) => {
        const style = getComputedStyle(node);
        rows.push([path, ...properties.map((p) => style[p])].join("|"));
        [...node.children].forEach((child, i) => walk(child, `${path}/${i}`));
      };
      walk(document.body, "b");
      return rows;
    }, PROPERTIES);
  }
  await context.close();
}

await browser.close();
writeFileSync(outFile, JSON.stringify(snapshot, null, 1));
const total = Object.values(snapshot).reduce((sum, rows) => sum + rows.length, 0);
console.log(`captured ${total} elements across ${Object.keys(snapshot).length} route/theme pairs`);
