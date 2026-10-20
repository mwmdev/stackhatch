import { expect, test } from "@playwright/test";
import {
  assertNoApplicationCookies,
  readIndexedDbStore,
  trackExternalRequests,
} from "./helpers/sse-mock";

test("the public app is accountless, local-first, and quiet on open", async ({ page }) => {
  const external = trackExternalRequests(page);
  await page.goto("/");

  await expect(page).toHaveTitle("StackHatch — Keep your architecture in view");
  await expect(
    page.getByRole("heading", { level: 1, name: "Keep the whole stack in view" })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "No account", exact: true })).toBeVisible();
  expect(external).toEqual([]);
  await assertNoApplicationCookies(page);
});

test("a blank map is written to the browser vault without egress", async ({ page }) => {
  const external = trackExternalRequests(page);
  await page.goto("/project/new");
  await page.getByRole("button", { name: "Create blank map" }).click();
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#.+/);

  const projects = await readIndexedDbStore<{ name: string }>(page, "stackhatch-vault", "projects");
  expect(projects).toHaveLength(1);
  expect(projects[0]?.name).toBe("Untitled map");
  expect(external).toEqual([]);
  await assertNoApplicationCookies(page);
});

test("durable browser storage is requested automatically without a settings action", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let persisted = false;
    Object.defineProperties(navigator.storage, {
      persisted: {
        configurable: true,
        value: async () => persisted,
      },
      persist: {
        configurable: true,
        value: async () => {
          persisted = true;
          sessionStorage.setItem("stackhatch-persistence-requested", "true");
          return true;
        },
      },
    });
  });

  await page.goto("/app/maps");

  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("stackhatch-persistence-requested")))
    .toBe("true");
  await expect(page.getByRole("button", { name: "Back up all maps" })).toBeVisible();
  await expect(page.getByLabel("Choose StackHatch backup")).toBeAttached();
  await page.goto("/settings");
  await expect(page.getByRole("button", { name: "Ask browser to keep data" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Back up all maps" })).toBeVisible();
  await expect(page.getByText("Persistent", { exact: true })).toBeVisible();
});

test("settings waits for an automatic persistence request already in flight", async ({ page }) => {
  await page.addInitScript(() => {
    let persisted = false;
    Object.defineProperties(navigator.storage, {
      persisted: {
        configurable: true,
        value: async () => persisted,
      },
      persist: {
        configurable: true,
        value: async () => {
          sessionStorage.setItem("stackhatch-persistence-requested", "true");
          await new Promise((resolve) => setTimeout(resolve, 150));
          persisted = true;
          return true;
        },
      },
    });
  });

  await page.goto("/settings");

  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("stackhatch-persistence-requested")))
    .toBe("true");
  await expect(page.getByText("Persistent", { exact: true })).toBeVisible();
});

test("the static candidate serves hardened direct routes and a real 404", async ({ page }) => {
  test.skip(
    process.env.PLAYWRIGHT_STATIC !== "1",
    "Static-host policy is checked on the candidate"
  );

  for (const route of [
    "/",
    "/app",
    "/app/",
    "/app/maps",
    "/app/maps/",
    "/project",
    "/project/",
    "/project/new",
    "/project/new/",
    "/settings",
    "/settings/",
    "/support",
    "/support/",
    "/privacy",
    "/privacy/",
    "/terms",
    "/terms/",
  ]) {
    const response = await page.request.get(route);
    expect(response.status(), route).toBe(200);
    expect(response.headers()["content-security-policy"], route).toContain(
      "connect-src 'self' https://api.github.com https://api.anthropic.com https://api.openai.com https://generativelanguage.googleapis.com https://openrouter.ai;"
    );
    expect(response.headers()["server"], route).toBeUndefined();
  }

  const missing = await page.request.get("/not-a-real-stackhatch-route");
  expect(missing.status()).toBe(404);
  expect(missing.headers()["content-security-policy"]).toBeTruthy();
});
