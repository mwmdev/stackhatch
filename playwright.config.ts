import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const port = Number(process.env.PLAYWRIGHT_TEST_PORT) || 3099;
const staticCandidate = process.env.PLAYWRIGHT_STATIC === "1";
const nixChromium = "/run/current-system/sw/bin/chromium";
const chromiumExecutable =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync(nixChromium) ? nixChromium : undefined);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  globalTeardown: staticCandidate ? "./e2e/static-candidate-teardown.ts" : undefined,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          executablePath: chromiumExecutable,
        },
      },
    },
  ],
  webServer: {
    command: staticCandidate
      ? `exec node scripts/run-static-candidate.mjs ${port}`
      : `npm run dev -- --port ${port}`,
    env: {
      ...process.env,
      NEXT_DIST_DIR: process.env.PLAYWRIGHT_NEXT_DIST_DIR || ".next-playwright",
    },
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI && !staticCandidate,
  },
});
