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
  await expect(page.getByText(/No account, no product analytics/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No account. Maps stay on this device." })
  ).toBeVisible();
  expect(external).toEqual([]);
  await assertNoApplicationCookies(page);
});

test("a blank map is written to the browser vault without egress", async ({ page }) => {
  const external = trackExternalRequests(page);
  await page.goto("/project/new");
  await page.getByRole("button", { name: /Blank map/ }).click();
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#.+/);

  const projects = await readIndexedDbStore<{ name: string }>(page, "stackhatch-vault", "projects");
  expect(projects).toHaveLength(1);
  expect(projects[0]?.name).toBe("Untitled Project");
  expect(external).toEqual([]);
  await assertNoApplicationCookies(page);
});

test("the static candidate serves hardened direct routes and a real 404", async ({ page }) => {
  test.skip(
    process.env.PLAYWRIGHT_STATIC !== "1",
    "Static-host policy is checked on the candidate"
  );

  for (const route of [
    "/",
    "/app",
    "/app/maps",
    "/project",
    "/project/new",
    "/settings",
    "/support",
    "/privacy",
    "/terms",
  ]) {
    const response = await page.request.get(route);
    expect(response.status(), route).toBe(200);
    expect(response.headers()["content-security-policy"], route).toContain(
      "connect-src 'self' https://api.github.com https://api.anthropic.com"
    );
    expect(response.headers()["server"], route).toBeUndefined();
  }

  const missing = await page.request.get("/not-a-real-stackhatch-route");
  expect(missing.status()).toBe(404);
  expect(missing.headers()["content-security-policy"]).toBeTruthy();
});
