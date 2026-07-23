import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const port = Number(process.env.PLAYWRIGHT_TEST_PORT) || 3099;
const testDatabaseUrl =
  process.env.E2E_DATABASE_URL || `file:/tmp/stackhatch-playwright-${process.pid}.db`;
process.env.E2E_DATABASE_URL = testDatabaseUrl;
const nixChromium = "/run/current-system/sw/bin/chromium";
const chromiumExecutable =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync(nixChromium) ? nixChromium : undefined);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
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
    command: `npx next dev --port ${port}`,
    env: {
      ...process.env,
      NEXT_DIST_DIR: process.env.PLAYWRIGHT_NEXT_DIST_DIR || ".next-playwright",
      STACKHATCH_DEV_AUTH: process.env.PLAYWRIGHT_DEV_AUTH || "1",
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || "test-secret",
      STACKHATCH_ENCRYPTION_KEY:
        process.env.STACKHATCH_ENCRYPTION_KEY || "playwright-encryption-key",
      DATABASE_URL: testDatabaseUrl,
    },
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI && process.env.REAL_AUTH_SMOKE !== "1",
  },
});
