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

const shellViewports = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
} as const;

const shellVariants = [
  { theme: "light" as const, viewportName: "mobile" as const },
  { theme: "dark" as const, viewportName: "mobile" as const },
  { theme: "light" as const, viewportName: "desktop" as const },
  { theme: "dark" as const, viewportName: "desktop" as const },
];

test.describe("system-wide UI polish", () => {
  test("shared shell navigation bars span the full viewport", async ({ page }) => {
    await page.setViewportSize(shellViewports.desktop);
    await useTheme(page, "light");

    for (const route of ["/support", "/app/maps", "/settings", "/admin"]) {
      await page.goto(route);
      await page.locator(".page-shell__bar").waitFor();

      const layout = await page.evaluate(() => {
        function measure(selector: string) {
          const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
          return {
            left: rect?.left ?? -1,
            right: rect?.right ?? -1,
            width: rect?.width ?? 0,
          };
        }

        return {
          bar: measure(".page-shell__bar"),
          main: measure(".page-shell__main"),
          footer: measure(".page-shell__footer"),
          viewportWidth: window.innerWidth,
        };
      });

      expect(layout.bar.left, `${route} header left edge`).toBeCloseTo(0, 0);
      expect(layout.bar.right, `${route} header right edge`).toBeCloseTo(layout.viewportWidth, 0);

      if (route === "/support") {
        for (const [region, regionBounds] of Object.entries({
          main: layout.main,
          footer: layout.footer,
        })) {
          expect(regionBounds.width, `${region} width`).toBeLessThan(layout.viewportWidth);
          expect(regionBounds.left, `${region} left inset`).toBeGreaterThan(0);
          expect(regionBounds.right, `${region} right inset`).toBeLessThan(layout.viewportWidth);
          expect(regionBounds.left, `${region} centered`).toBeCloseTo(
            layout.viewportWidth - regionBounds.right,
            0
          );
        }
      }
    }
  });

  for (const { route, title, theme, viewportName } of [
    {
      route: "/login",
      title: "Turn what you have into an architecture map.",
      theme: "light" as const,
      viewportName: "mobile" as const,
    },
    {
      route: "/support",
      title: "Get from repository to a map you can reason about.",
      theme: "dark" as const,
      viewportName: "mobile" as const,
    },
    {
      route: "/privacy",
      title: "Privacy Policy",
      theme: "light" as const,
      viewportName: "desktop" as const,
    },
    {
      route: "/terms",
      title: "Terms of Service",
      theme: "dark" as const,
      viewportName: "desktop" as const,
    },
  ]) {
    test(`${route} keeps the public shell readable in ${theme} mode at ${viewportName} width`, async ({
      page,
    }) => {
      await page.setViewportSize(shellViewports[viewportName]);
      await useTheme(page, theme);
      await page.goto(route);

      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByRole("link", { name: "StackHatch home" })).toBeVisible();
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      await expectStablePageFrame(page);
    });
  }

  for (const { route, title, theme, viewportName } of [
    {
      route: "/app/maps",
      title: "All Maps",
      theme: "dark" as const,
      viewportName: "mobile" as const,
    },
    {
      route: "/settings",
      title: "Settings",
      theme: "light" as const,
      viewportName: "mobile" as const,
    },
    {
      route: "/app/maps",
      title: "All Maps",
      theme: "light" as const,
      viewportName: "desktop" as const,
    },
    {
      route: "/settings",
      title: "Settings",
      theme: "dark" as const,
      viewportName: "desktop" as const,
    },
  ]) {
    test(`${title} keeps the comfortable app shell stable in ${theme} mode at ${viewportName} width`, async ({
      page,
    }) => {
      await page.setViewportSize(shellViewports[viewportName]);
      await useTheme(page, theme);
      await page.goto(route);

      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.locator(".app-page-shell")).toHaveAttribute("data-density", "comfortable");
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      if (route === "/app/maps") {
        await expect(page.getByRole("link", { name: "New map" })).toHaveCount(1);
        await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Admin" })).toBeVisible();
      } else {
        await expect(page.getByRole("link", { name: "New map" })).toHaveCount(1);
        await expect(page.getByRole("link", { name: "Settings" })).toHaveAttribute(
          "aria-current",
          "page"
        );
        await expect(page.getByRole("link", { name: "Admin" })).toBeVisible();

        const widths = await page.evaluate(() => {
          const shellContent = document.querySelector<HTMLElement>(".page-shell__content");
          const settingsContent = document.querySelector<HTMLElement>(
            '[data-testid="settings-content"]'
          );
          return {
            shell: shellContent?.getBoundingClientRect().width ?? 0,
            settings: settingsContent?.getBoundingClientRect().width ?? 0,
          };
        });
        expect(widths.settings).toBeCloseTo(widths.shell, 0);
      }
      await expectStablePageFrame(page, route === "/app/maps");
    });
  }

  for (const { theme, viewportName } of shellVariants) {
    test(`admin keeps the dense app shell stable in ${theme} mode at ${viewportName} width`, async ({
      page,
    }) => {
      await page.setViewportSize(shellViewports[viewportName]);
      await useTheme(page, theme);
      await page.goto("/admin");

      await expect(page.getByRole("heading", { level: 1, name: "Admin" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Resume map" })).toBeVisible();
      await expect(page.locator(".app-page-shell")).toHaveAttribute("data-density", "dense");
      await expect(page.getByRole("tab", { name: "Users" })).toBeVisible();
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      await expectStablePageFrame(page, false);
    });
  }

  for (const { theme, viewportName } of shellVariants) {
    test(`new-map chooser stays direct in ${theme} mode at ${viewportName} width`, async ({
      page,
    }) => {
      await page.setViewportSize(shellViewports[viewportName]);
      await useTheme(page, theme);
      await page.goto("/project/new");

      await expect(page.getByRole("heading", { level: 1, name: "Start a new map" })).toBeVisible();
      await expect(page.getByRole("link", { name: "All Maps" })).toHaveCount(1);
      await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
      await expect(page.getByRole("button", { name: /Blank map/ })).toBeVisible();
      await expect(page.getByText(/Use this source/i)).toHaveCount(0);
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      await expectStablePageFrame(page);
    });
  }

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

    const blankSource = page.getByRole("button", { name: /Blank map/ });
    for (
      let attempts = 0;
      attempts < 8 && !(await blankSource.evaluate((node) => node === document.activeElement));
      attempts += 1
    ) {
      await page.keyboard.press("Tab");
    }
    await expect(blankSource).toBeFocused();
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
      { width: 390, height: 844, placement: "dock" },
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

      if (viewport.placement === "dock") {
        const legend = page.getByTestId("edge-legend");
        const legendToggle = page.getByTestId("edge-legend-toggle");
        await expect(legend).toBeVisible();
        await expect(page.getByTestId("edge-legend-panel")).toHaveCount(0);

        const collapsedLegendBounds = await legend.boundingBox();
        const dockBounds = await toolSurface.boundingBox();
        expect(collapsedLegendBounds).not.toBeNull();
        expect(dockBounds).not.toBeNull();
        expect(collapsedLegendBounds?.y ?? viewport.height).toBeGreaterThanOrEqual(0);
        expect(
          (collapsedLegendBounds?.y ?? 0) + (collapsedLegendBounds?.height ?? 0)
        ).toBeLessThanOrEqual(dockBounds?.y ?? 0);

        await legendToggle.click();
        const legendPanel = page.getByTestId("edge-legend-panel");
        await expect(legendPanel).toBeVisible();
        const expandedLegendBounds = await legend.boundingBox();
        const legendPanelBounds = await legendPanel.boundingBox();
        expect(expandedLegendBounds).not.toBeNull();
        expect(legendPanelBounds).not.toBeNull();
        expect(expandedLegendBounds?.x ?? -1).toBeGreaterThanOrEqual(0);
        expect(expandedLegendBounds?.y ?? -1).toBeGreaterThanOrEqual(0);
        expect(
          (expandedLegendBounds?.x ?? 0) + (expandedLegendBounds?.width ?? 0)
        ).toBeLessThanOrEqual(viewport.width);
        expect(
          (expandedLegendBounds?.y ?? 0) + (expandedLegendBounds?.height ?? 0)
        ).toBeLessThanOrEqual(dockBounds?.y ?? 0);
        expect((legendPanelBounds?.x ?? 0) + (legendPanelBounds?.width ?? 0)).toBeLessThanOrEqual(
          viewport.width
        );
        expect((legendPanelBounds?.y ?? 0) + (legendPanelBounds?.height ?? 0)).toBeLessThanOrEqual(
          viewport.height
        );
        await legendToggle.click();
      }

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
