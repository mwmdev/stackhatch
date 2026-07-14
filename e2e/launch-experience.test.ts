import { expect, test } from "@playwright/test";

test.describe("launch experience", () => {
  test("preserves a repository from the homepage into sign in", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { level: 1, name: "See how your codebase fits together." })
    ).toBeVisible();

    const repository = page.locator('[data-repository-form="hero"]');
    await repository.getByRole("textbox", { name: "Public GitHub repository" }).fill("not a repo");
    await repository.getByRole("button", { name: "Map this repository" }).click();
    await expect(repository.getByRole("alert")).toContainText("public GitHub repository");

    await repository
      .getByRole("textbox", { name: "Public GitHub repository" })
      .fill("mwmdev/stackhatch");
    await repository.getByRole("button", { name: "Map this repository" }).click();

    await expect(page).toHaveURL(/\/login\?callbackUrl=/);
    const callback = new URL(page.url()).searchParams.get("callbackUrl");
    expect(callback).toBe("/app?repo=mwmdev%2Fstackhatch");
    await expect(
      page.getByRole("heading", { name: "Repository ready: mwmdev/stackhatch" })
    ).toBeVisible();
  });

  test("opens the self-map anonymously without product API requests", async ({ page }) => {
    const apiRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url());
    });

    await page.goto("/demo");
    await expect(
      page.getByRole("heading", { level: 1, name: "StackHatch, mapped by StackHatch." })
    ).toBeVisible();
    await expect(page.getByText("Read-only architecture overview")).toBeVisible();

    const question = page.getByRole("button", { name: "Where is project data stored?" });
    await question.click();
    await expect(question).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(/through Drizzle into SQLite/i)).toBeVisible();

    const authenticationNode = page.getByRole("button", {
      name: "Open component Authentication, Auth.js · GitHub OAuth",
    });
    await authenticationNode.focus();
    await authenticationNode.press("Enter");
    await expect(page.locator(".demo-detail h2")).toHaveText("Authentication");

    const sessionConnection = page.getByRole("button", {
      name: "Inspect connection from Route handlers to Authentication: session checks",
    });
    await sessionConnection.focus();
    await sessionConnection.press("Enter");
    await expect(page.locator(".demo-detail h2")).toHaveText("Route handlers → Authentication");

    expect(apiRequests).toEqual([]);
  });

  test("keeps the dark, reduced-motion launch experience usable at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.goto("/");

    await expect(page.getByRole("link", { name: "Demo" }).first()).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);

    await page.getByRole("link", { name: "Demo" }).first().click();
    await expect(
      page.getByRole("heading", { level: 1, name: "StackHatch, mapped by StackHatch." })
    ).toBeVisible();
    await expect(page.getByText("Read-only architecture overview")).toBeVisible();
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
