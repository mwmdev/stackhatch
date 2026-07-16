import { expect, test, type Page } from "@playwright/test";
import { createProjectAndNavigate, fulfillSSE, textSSE } from "./helpers/sse-mock";

async function useTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
}

async function expectStablePageFrame(page: Page, themeControl = true) {
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveCount(1);
  if (themeControl) {
    await expect(page.getByRole("button", { name: /^Theme:/ })).toBeVisible();
  }

  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.scrollWidth).toBe(layout.clientWidth);
}

test.describe("system-wide UI polish", () => {
  for (const { route, title, theme, viewport } of [
    {
      route: "/support",
      title: "Get from repository to a map you can reason about.",
      theme: "dark" as const,
      viewport: { width: 390, height: 844 },
    },
    {
      route: "/privacy",
      title: "Privacy Policy",
      theme: "light" as const,
      viewport: { width: 1440, height: 900 },
    },
    {
      route: "/terms",
      title: "Terms of Service",
      theme: "dark" as const,
      viewport: { width: 390, height: 844 },
    },
  ]) {
    test(`${route} keeps the public shell readable in ${theme} mode`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await useTheme(page, theme);
      await page.goto(route);

      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByRole("link", { name: "StackHatch home" })).toBeVisible();
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      await expectStablePageFrame(page);
    });
  }

  for (const { theme, viewport } of [
    { theme: "dark" as const, viewport: { width: 390, height: 844 } },
    { theme: "light" as const, viewport: { width: 1440, height: 900 } },
  ]) {
    test(`All Maps keeps one primary action in ${theme} mode`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await useTheme(page, theme);
      await page.goto("/app/maps");

      await expect(page.getByRole("heading", { level: 1, name: "All Maps" })).toBeVisible();
      await expect(page.getByRole("link", { name: "New map" })).toHaveCount(1);
      await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Admin" })).toBeVisible();
      await expect(page.locator(".app-page-shell")).toHaveAttribute("data-density", "comfortable");
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      await expectStablePageFrame(page);
    });
  }

  test("settings and admin retain route-appropriate hierarchy and density", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await useTheme(page, "dark");

    await page.goto("/settings");
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to your maps" })).toBeVisible();
    await expectStablePageFrame(page, false);

    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1, name: "Admin" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Resume map" })).toBeVisible();
    await expect(page.locator(".app-page-shell")).toHaveAttribute("data-density", "dense");
    await expect(page.getByRole("tab", { name: "Users" })).toBeVisible();
    await expectStablePageFrame(page, false);
  });

  test("the new-map chooser remains direct, named, and overflow-free at 320px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await useTheme(page, "dark");
    await page.goto("/project/new");

    await expect(page.getByRole("heading", { level: 1, name: "Start a new map" })).toBeVisible();
    await expect(page.getByRole("link", { name: "All Maps" })).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Blank map/ })).toBeVisible();
    await expect(page.getByText(/Use this source/i)).toHaveCount(0);
    await expectStablePageFrame(page);

    await page.keyboard.press("Tab");
    await expect(page.locator(":focus-visible")).toHaveCount(1);
  });

  test("impersonation remains distinct without covering authenticated chrome", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const created = await page.request.post("/api/admin/users", {
      data: {
        name: `Polish target ${Date.now()}`,
        email: "polish-target@example.test",
        role: "user",
      },
    });
    expect(created.status()).toBe(201);
    const target = (await created.json()) as { id: string };

    const impersonation = await page.request.post("/api/admin/impersonation", {
      data: { userId: target.id },
    });
    expect(impersonation.ok()).toBe(true);

    await page.goto("/project/new");
    const banner = page.getByRole("status", { name: "Impersonation active" });
    await expect(banner).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop impersonating" })).toBeVisible();

    const geometry = await page.evaluate(() => {
      const bannerBounds = document
        .querySelector<HTMLElement>('[aria-label="Impersonation active"]')
        ?.getBoundingClientRect();
      const headerBounds = document
        .querySelector<HTMLElement>("body header")
        ?.getBoundingClientRect();
      return {
        bannerBottom: bannerBounds?.bottom ?? -1,
        headerTop: headerBounds?.top ?? -1,
        reservedHeight: Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--impersonation-banner-height"
          )
        ),
      };
    });
    expect(geometry.reservedHeight).toBeGreaterThan(0);
    expect(geometry.headerTop).toBeGreaterThanOrEqual(geometry.bannerBottom - 1);

    await page.getByRole("button", { name: "Stop impersonating" }).click();
    await expect(banner).toHaveCount(0);
    const removed = await page.request.delete(`/api/admin/users?userId=${target.id}`);
    expect(removed.ok()).toBe(true);
  });

  test("the editor dock becomes a rail without clipping controls or menus", async ({ page }) => {
    await page.route("**/api/projects/*/chat/init", async (route) => {
      await fulfillSSE(route, textSSE("What are you building?"));
    });
    await useTheme(page, "dark");
    await createProjectAndNavigate(page, "UI polish geometry");
    const projectUrl = page.url();

    for (const viewport of [
      { width: 320, height: 720, placement: "dock" },
      { width: 768, height: 900, placement: "rail" },
      { width: 1024, height: 768, placement: "rail" },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(projectUrl);

      const closeChat = page
        .locator("#editor-chat-sidebar")
        .getByRole("button", { name: "Close chat" });
      await expect(closeChat).toBeVisible();
      await closeChat.click();

      const toolSurface = page.getByTestId("editor-tool-surface");
      await expect(toolSurface).toBeVisible();
      for (const name of [
        /chat$/,
        "Add node",
        "Zoom in",
        "Zoom out",
        "Fit map to view",
        "Editor display settings",
      ]) {
        await expect(toolSurface.getByRole("button", { name })).toBeVisible();
      }

      const geometry = await toolSurface.evaluate((surface) => {
        const rect = surface.getBoundingClientRect();
        const controls = Array.from(surface.querySelectorAll<HTMLElement>("button, a")).map(
          (control) => {
            const bounds = control.getBoundingClientRect();
            return { width: bounds.width, height: bounds.height };
          }
        );
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          controls,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          scrollWidth: document.documentElement.scrollWidth,
        };
      });

      expect(geometry.left).toBeGreaterThanOrEqual(0);
      expect(geometry.right).toBeLessThanOrEqual(geometry.viewport.width);
      expect(geometry.top).toBeGreaterThanOrEqual(0);
      expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewport.height);
      expect(geometry.scrollWidth).toBe(geometry.viewport.width);
      expect(
        geometry.controls.every((control) => control.width >= 44 && control.height >= 44)
      ).toBe(true);
      if (viewport.placement === "dock") expect(geometry.width).toBeGreaterThan(geometry.height);
      else expect(geometry.height).toBeGreaterThan(geometry.width);

      await toolSurface.getByRole("button", { name: "Add node" }).click();
      const addMenu = page.getByTestId("add-node-dropdown");
      await expect(addMenu).toBeVisible();
      const addMenuBounds = await addMenu.boundingBox();
      expect(addMenuBounds).not.toBeNull();
      expect(addMenuBounds?.x ?? -1).toBeGreaterThanOrEqual(0);
      expect((addMenuBounds?.x ?? 0) + (addMenuBounds?.width ?? 0)).toBeLessThanOrEqual(
        viewport.width
      );
      await toolSurface.getByRole("button", { name: "Add node" }).click();
    }
  });
});
