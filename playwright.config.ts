import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_TEST_PORT) || 3099;

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
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
        },
      },
    },
  ],
  webServer: {
    command: `npx next dev --port ${port}`,
    env: {
      ...process.env,
      STACKHATCH_DEV_AUTH: "1",
      STACKHATCH_DEV_ROLE: "admin",
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || "test-secret",
      ANTHROPIC_API_KEY: process.env.E2E_ANTHROPIC_API_KEY || "sk-ant-e2e-placeholder",
    },
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
