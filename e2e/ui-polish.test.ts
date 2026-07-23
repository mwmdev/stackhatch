import { expect, test, type Locator, type Page } from "@playwright/test";
import { createProjectAndNavigate, fulfillSSE, textSSE } from "./helpers/sse-mock";

const persistedCanvas = {
  nodes: [
    {
      id: "web-client",
      category: "client",
      subtype: "web-app",
      name: "Web Client",
      technology: "Next.js",
      description: "Renders the product experience.",
      reasoning: "Keeps the client boundary explicit.",
      locked: false,
    },
    {
      id: "api-gateway",
      category: "api",
      subtype: "rest-api",
      name: "API Gateway",
      technology: "TypeScript",
      description: "Routes application requests.",
      reasoning: "Centralizes the public API boundary.",
      locked: false,
    },
  ],
  edges: [
    {
      id: "client-to-api",
      source: "web-client",
      target: "api-gateway",
      connectionType: "http",
      label: "HTTPS",
    },
  ],
  positions: {
    "web-client": { x: 80, y: 120 },
    "api-gateway": { x: 420, y: 120 },
  },
  alternatives: {
    "web-client": [
      {
        name: "Svelte Client",
        technology: "SvelteKit",
        description: "A smaller client alternative.",
        reasoning: "Useful when bundle size is the primary constraint.",
        category: "client",
        subtype: "web-app",
      },
    ],
  },
};

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

async function expectInsideViewport(locator: Locator) {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  const viewport = locator.page().viewportSize();
  expect(viewport).not.toBeNull();
  expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect(bounds?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(viewport?.width ?? 0);
  expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(viewport?.height ?? 0);
}

async function expectAccountDisclosure(page: Page, settingsActive = false) {
  const trigger = page.getByRole("button", { name: "Account", exact: true });
  const panel = page.getByTestId("account-popover");
  const settings = panel.getByRole("link", { name: "Settings" });
  const signOut = panel.getByRole("button", { name: "Sign out" });

  await trigger.press("Enter");
  await expect(panel).toBeVisible();
  if (settingsActive) await expect(settings).toHaveAttribute("aria-current", "page");
  else await expect(settings).not.toHaveAttribute("aria-current", "page");

  await page.keyboard.press("Tab");
  await expect(settings).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(signOut).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(settings).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.press("Space");
  await expect(panel).toBeVisible();
  const theme = page.getByRole("button", { name: "Theme: change appearance" }).first();
  await theme.click();
  await expect(panel).toBeHidden();
  await expect(theme).toBeFocused();
}

async function createPersistedProject(page: Page, name: string, repoUrl?: string) {
  const response = await page.request.post("/api/projects", {
    data: {
      name,
      canvasState: JSON.stringify(persistedCanvas),
      ...(repoUrl ? { repoUrl } : {}),
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string };
}

async function mockCompletedChatInit(page: Page) {
  await page.route("**/api/projects/*/chat/init", async (route) => {
    await fulfillSSE(route, textSSE("What are you building?"));
  });
}

async function mockExistingChatHistory(page: Page) {
  await page.route("**/api/projects/*/messages", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "playwright-ready-message",
          role: "assistant",
          content: "The architecture is ready.",
          createdAt: Date.now(),
        },
      ]),
    });
  });
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
  test("retired administrator routes stay absent", async ({ page }) => {
    const pageResponse = await page.goto("/admin");
    const usersResponse = await page.request.get("/api/admin/users");
    const impersonationResponse = await page.request.post("/api/admin/impersonation", {
      data: { userId: "ignored" },
    });

    expect(pageResponse?.status()).toBe(404);
    expect(usersResponse.status()).toBe(404);
    expect(impersonationResponse.status()).toBe(404);
  });

  test("account deletion truthfully reports the development-auth boundary", async ({ page }) => {
    await page.goto("/settings");

    const trigger = page.getByRole("button", { name: "Delete account" });
    await expect(trigger).toBeDisabled();
    await expect(page.getByRole("status")).toContainText(
      "Account deletion is unavailable while development authentication is enabled."
    );
  });

  test("shared shell navigation bars span the full viewport", async ({ page }) => {
    await page.setViewportSize(shellViewports.desktop);
    await useTheme(page, "light");

    for (const route of ["/support", "/app/maps", "/settings"]) {
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
      route: "/",
      title: "Keep the whole stack in view",
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
      await expect(
        page.getByRole("banner").getByRole("link", { name: "StackHatch home" })
      ).toBeVisible();
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
        await expect(page.getByRole("button", { name: "Account", exact: true })).toBeVisible();
        await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
        await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
      } else {
        await expect(page.getByRole("link", { name: "New map" })).toHaveCount(1);
        await expect(page.getByRole("link", { name: "All Maps" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Account", exact: true })).toBeVisible();
        await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
        await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);

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
      await expectStablePageFrame(page);
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
      await expect(page.getByRole("button", { name: "Account", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
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
    await expect(page.getByRole("button", { name: "Account", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
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

  test("Account is a native keyboard disclosure on every authenticated surface", async ({
    page,
  }) => {
    await page.setViewportSize(shellViewports.desktop);
    await useTheme(page, "light");

    for (const surface of [
      { route: "/app/maps", title: "All Maps", settingsActive: false },
      { route: "/project/new", title: "Start a new map", settingsActive: false },
      { route: "/settings", title: "Settings", settingsActive: true },
    ]) {
      await page.goto(surface.route);
      await expect(page.getByRole("heading", { level: 1, name: surface.title })).toBeVisible();
      await expectAccountDisclosure(page, surface.settingsActive);
    }

    await mockCompletedChatInit(page);
    await createProjectAndNavigate(page, `Account disclosure ${Date.now()}`);
    await expectAccountDisclosure(page);
  });

  test("Account Settings navigation and sign-out initiation remain ordinary actions", async ({
    page,
  }) => {
    await page.goto("/app/maps");
    await page.getByRole("button", { name: "Account", exact: true }).press("Enter");
    await page.getByTestId("account-popover").getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();

    await page.goto("/app/maps");
    const signOutRequest = page.waitForRequest(
      (request) => request.url().endsWith("/api/auth/signout") && request.method() === "POST"
    );
    await page.getByRole("button", { name: "Account", exact: true }).press("Space");
    await page.getByTestId("account-popover").getByRole("button", { name: "Sign out" }).click();
    await signOutRequest;
    await expect(page).toHaveURL(/\/$/);
  });

  test("long account identity stays inside compact 320px and 390px viewports", async ({
    page,
  }, testInfo) => {
    await page.route("**/api/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          name: "Alexandria-Cassandra With An Exceptionally Long Display Name",
          email: "alexandria-cassandra.with-a-long-address@architecture-observatory.example",
        }),
      });
    });

    for (const viewport of [
      { width: 320, height: 720 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/app/maps");
      await page.getByRole("button", { name: "Account", exact: true }).press("Space");
      const panel = page.getByTestId("account-popover");
      await expect(panel).toContainText("Alexandria-Cassandra");
      await expect(panel).toContainText("architecture-observatory.example");
      await expectInsideViewport(panel);
      await expectStablePageFrame(page);

      if (viewport.width === 390) {
        await page.screenshot({ path: testInfo.outputPath("account-compact-390.png") });
      }
      await page.keyboard.press("Escape");
    }
  });

  test("compact editor Account, More, and Export stay keyboard-reachable in one row", async ({
    page,
  }, testInfo) => {
    await mockExistingChatHistory(page);
    const project = await createPersistedProject(
      page,
      `A deliberately long architecture map name ${Date.now()}`,
      "https://github.com/stackhatch/example-architecture"
    );
    await useTheme(page, "dark");

    for (const viewport of [
      { width: 320, height: 720 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`/project/${project.id}`);
      await expect(page.getByTestId("stack-node-web-client")).toBeVisible();

      const bar = page.getByTestId("editor-project-bar");
      await expect(bar).toHaveAttribute("data-layout", "single-row");
      const barGeometry = await bar.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const visibleControlCenters = Array.from(element.querySelectorAll<HTMLElement>("a, button"))
          .map((control) => control.getBoundingClientRect())
          .filter((control) => control.width > 0 && control.height > 0)
          .map((control) => control.top + control.height / 2);
        return {
          height: bounds.height,
          left: bounds.left,
          right: bounds.right,
          centerSpread: Math.max(...visibleControlCenters) - Math.min(...visibleControlCenters),
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        };
      });
      expect(barGeometry.left).toBeGreaterThanOrEqual(0);
      expect(barGeometry.right).toBeLessThanOrEqual(viewport.width);
      expect(barGeometry.height).toBeLessThanOrEqual(60);
      expect(barGeometry.centerSpread).toBeLessThanOrEqual(1);
      expect(barGeometry.scrollWidth).toBe(barGeometry.clientWidth);

      await expect(bar.getByRole("link", { name: "All maps" })).toBeVisible();
      await expect(bar.getByRole("button", { name: "Export map" })).toBeVisible();
      await expect(bar.getByRole("button", { name: "More project actions" })).toBeVisible();
      await expect(bar.getByRole("button", { name: "Account" })).toBeVisible();
      await expect(page.getByTestId("wide-new-map")).toBeHidden();
      await expect(bar.locator('[data-stack-illustration="true"]')).toBeHidden();

      const moreTrigger = bar.getByRole("button", { name: "More project actions" });
      const morePanel = page.getByTestId("editor-more-popover");
      await moreTrigger.press("Space");
      await expect(morePanel).toBeVisible();
      await expectInsideViewport(morePanel);
      await page.keyboard.press("Escape");
      await expect(morePanel).toBeHidden();
      await expect(moreTrigger).toBeFocused();

      await moreTrigger.press("Enter");
      await expect(morePanel).toBeVisible();
      await page.keyboard.press("Tab");
      await expect(morePanel.getByRole("link", { name: "New Map" })).toBeFocused();

      const rowTheme = morePanel.getByRole("button", { name: /^Theme:/ });
      await rowTheme.click();
      await expect(morePanel).toBeVisible();
      await expect(rowTheme.getByRole("status")).toHaveText(/Theme changed to/);
      await page.keyboard.press("Escape");
      await expect(morePanel).toBeHidden();
      await expect(moreTrigger).toBeFocused();

      await moreTrigger.click();
      await expect(morePanel).toBeVisible();
      const accountTrigger = bar.getByRole("button", { name: "Account", exact: true });
      await accountTrigger.click();
      await expect(morePanel).toBeHidden();
      await expect(accountTrigger).toBeFocused();
      await expect(page.getByTestId("account-popover")).toBeVisible();
      await page.keyboard.press("Escape");

      const exportTrigger = bar.getByRole("button", { name: "Export map" });
      const exportPanel = page.getByTestId("export-dropdown");
      await exportTrigger.press("Space");
      await expect(exportPanel).toBeVisible();
      await expectInsideViewport(exportPanel);
      await page.keyboard.press("Escape");
      await expect(exportPanel).toBeHidden();
      await expect(exportTrigger).toBeFocused();

      await exportTrigger.press("Enter");
      await expect(exportPanel).toBeVisible();
      await page.keyboard.press("Tab");
      await expect(exportPanel.getByRole("button", { name: "Export PNG" })).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(exportTrigger).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(exportPanel).toBeHidden();
      await expect(exportTrigger).toBeFocused();

      if (viewport.width === 390) {
        await moreTrigger.click();
        await page.screenshot({ path: testInfo.outputPath("editor-compact-390.png") });
        await page.keyboard.press("Escape");
      }
    }
  });

  test("the last accepted editor revision survives reload with full map provenance", async ({
    page,
  }) => {
    await mockExistingChatHistory(page);
    const repoUrl = "https://github.com/stackhatch/persistence-proof";
    const project = await createPersistedProject(page, `Persistence proof ${Date.now()}`, repoUrl);
    await page.goto(`/project/${project.id}`);

    await expect(page.getByTestId("project-identity")).toHaveAttribute(
      "aria-label",
      new RegExp(repoUrl.replaceAll("/", "\\/"))
    );
    await page.getByTestId("stack-node-web-client").click();
    await page.getByLabel("Node name").fill("Accepted Web Client");

    let acceptedCanvas: typeof persistedCanvas | undefined;
    await expect
      .poll(async () => {
        const response = await page.request.get(`/api/projects/${project.id}`);
        const body = (await response.json()) as {
          canvasState: typeof persistedCanvas;
          repoUrl: string;
        };
        acceptedCanvas = body.canvasState;
        return {
          name: body.canvasState.nodes.find((node) => node.id === "web-client")?.name,
          repoUrl: body.repoUrl,
        };
      })
      .toEqual({ name: "Accepted Web Client", repoUrl });

    await page.reload();
    await expect(page.getByTestId("stack-node-web-client")).toContainText("Accepted Web Client");
    await expect(page.getByTestId("project-provenance")).toContainText("Repository map");
    const reopened = (await (await page.request.get(`/api/projects/${project.id}`)).json()) as {
      canvasState: typeof persistedCanvas;
    };
    expect(reopened.canvasState).toEqual(acceptedCanvas);
    expect(reopened.canvasState.edges).toEqual(persistedCanvas.edges);
    expect(reopened.canvasState.positions).toEqual(persistedCanvas.positions);
    expect(reopened.canvasState.alternatives).toEqual(persistedCanvas.alternatives);
  });

  test("dirty editor sign-out waits for the accepted save before Auth.js", async ({ page }) => {
    await mockExistingChatHistory(page);
    const project = await createPersistedProject(page, `Ordered sign-out ${Date.now()}`);
    const sequence: string[] = [];
    let releaseSave = () => {};
    let markSaveStarted = () => {};
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    const saveStarted = new Promise<void>((resolve) => {
      markSaveStarted = resolve;
    });

    await page.route(`**/api/projects/${project.id}`, async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.continue();
        return;
      }
      sequence.push("save");
      markSaveStarted();
      await saveGate;
      await route.continue();
    });
    page.on("request", (request) => {
      if (request.url().endsWith("/api/auth/signout")) sequence.push("sign-out");
    });

    await page.goto(`/project/${project.id}`);
    await page.getByTestId("stack-node-web-client").click();
    await page.getByLabel("Node name").fill("Save before leaving");
    await saveStarted;

    await page.getByRole("button", { name: "Account", exact: true }).click();
    await page.getByTestId("account-popover").getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByTestId("account-popover").getByRole("status")).toHaveText(
      "Saving changes…"
    );
    expect(sequence).toEqual(["save"]);

    const signOutRequest = page.waitForRequest((request) =>
      request.url().endsWith("/api/auth/signout")
    );
    releaseSave();
    await signOutRequest;
    expect(sequence).toEqual(["save", "sign-out"]);
    await expect(page).toHaveURL(/\/$/);
  });

  test("an active architecture stream explains why editor sign-out is unavailable", async ({
    page,
  }) => {
    let releaseStream = () => {};
    const streamGate = new Promise<void>((resolve) => {
      releaseStream = resolve;
    });
    let signOutRequests = 0;
    page.on("request", (request) => {
      if (request.url().endsWith("/api/auth/signout")) signOutRequests += 1;
    });
    await page.route("**/api/projects/*/chat/init", async (route) => {
      await streamGate;
      await fulfillSSE(route, textSSE("What are you building?"));
    });

    try {
      await createProjectAndNavigate(page, `Blocked sign-out ${Date.now()}`);
      const trigger = page.getByRole("button", { name: "Account", exact: true });
      await trigger.press("Enter");
      const panel = page.getByTestId("account-popover");
      await expect(panel).toBeVisible();
      await expect(panel).toContainText("Architecture update in progress");
      const signOut = panel.locator("button", { hasText: "Sign out" });
      await expect(signOut).toHaveAttribute("aria-disabled", "true");
      await expect(signOut).toHaveAccessibleDescription("Architecture update in progress");
      await signOut.dispatchEvent("click");
      expect(signOutRequests).toBe(0);
    } finally {
      releaseStream();
    }
  });

  test("the editor dock becomes a rail without clipping controls or menus", async ({ page }) => {
    await mockCompletedChatInit(page);
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
