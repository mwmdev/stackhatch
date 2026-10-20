import { expect, test, type Locator, type Page } from "@playwright/test";
import type { VaultProjectRecord } from "../src/lib/vault/schema";
import {
  blankStartButton,
  createBlankMap,
  mockAnthropic,
  mockGitHub,
  openChat,
  readIndexedDbStore,
  sendChatMessage,
  useProviderKey,
} from "./helpers/sse-mock";

/**
 * Opens the editor on a fresh blank map. Deliberately does not open the chat
 * panel: at 320px the dev overlay sits over that trigger, and these tests are
 * about the editor's own layout.
 */
async function openBlankEditor(page: Page) {
  await page.goto("/project/new");
  await blankStartButton(page).click();
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#.+/);
  await page.waitForSelector("[data-testid='editor-project-bar']");
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    )
  ).toBe(false);
}

function boxesOverlap(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number }
) {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

async function canvasHasOverlap(nodes: Locator) {
  const boxes = await Promise.all(
    Array.from({ length: await nodes.count() }, (_, index) => nodes.nth(index).boundingBox())
  );
  if (boxes.some((box) => box === null)) return null;
  for (let index = 0; index < boxes.length; index += 1) {
    for (let comparison = index + 1; comparison < boxes.length; comparison += 1) {
      if (boxesOverlap(boxes[index]!, boxes[comparison]!)) {
        return true;
      }
    }
  }
  return false;
}

for (const viewport of [
  { name: "mobile", width: 320, height: 640 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test(`${viewport.name} public and app shells remain coherent`, async ({ page }) => {
    await page.setViewportSize(viewport);
    for (const route of ["/", "/app/maps", "/project/new", "/settings", "/support"]) {
      await page.goto(route);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("main")).toHaveCount(1);
      if (route === "/") {
        await expect(
          page.getByRole("button", { name: /^Theme: (Light|Dark|System)\. Change appearance$/ })
        ).toBeVisible();

        const slot = page.getByTestId("hero-proof");
        await slot.scrollIntoViewIfNeeded();
        await expect(slot).toBeVisible();

        const slotBox = await slot.boundingBox();
        expect(slotBox).not.toBeNull();
        expect(slotBox!.width).toBeGreaterThanOrEqual(viewport.width * 0.8);
      }
      if (route === "/support") {
        const primaryNavigation = page.getByRole("navigation", { name: "Primary navigation" });
        await expect(primaryNavigation.getByRole("link", { name: "Start a map" })).toBeVisible();
        if (viewport.name === "desktop") {
          await expect(primaryNavigation.getByRole("link", { name: "Features" })).toBeVisible();
        }
        await expect(page.getByRole("heading", { name: "Understand the evidence" })).toHaveCount(0);
      }
      await expectNoHorizontalOverflow(page);
    }
  });

  test(`${viewport.name} editor remains coherent`, async ({ page }) => {
    // The editor is the most complex screen and was the only one this sweep
    // left out.
    await page.setViewportSize(viewport);
    await openBlankEditor(page);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.getByTestId("project-provenance")).toHaveCount(0);
    await expect(page.getByText("Standalone map")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    if (viewport.name === "mobile") {
      // The phone bar folds new map and the device controls into one menu.
      await page.getByRole("button", { name: "More map actions" }).click();
      const menu = page.getByTestId("editor-overflow-menu");
      await expect(menu.getByRole("link", { name: "New map" })).toBeVisible();
      await expect(
        menu.getByRole("button", { name: /^Theme: (Light|Dark|System)\. Change appearance$/ })
      ).toBeVisible();
      await expect(menu.getByRole("link", { name: "Help" })).toBeVisible();
      await expect(menu.getByRole("link", { name: "Settings" })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });
}

test("landing theme switcher cycles every appearance mode", async ({ page }) => {
  const hydrationFailures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("Hydration failed")) {
      hydrationFailures.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    if (error.message.includes("Hydration failed")) {
      hydrationFailures.push(error.message);
    }
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => window.localStorage.setItem("theme", "light"));
  await page.goto("/");

  const themeToggle = page.getByRole("button", {
    name: /^Theme: (Light|Dark|System)\. Change appearance$/,
  });
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Source" })
    .focus();
  await page.keyboard.press("Tab");
  await expect(themeToggle).toBeFocused();
  await expect(page.locator("html")).toHaveClass(/light/);
  await expect(themeToggle.locator('[data-theme-icon="light"]')).toBeVisible();

  await themeToggle.click();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("theme"))).toBe("dark");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(themeToggle.locator('[data-theme-icon="dark"]')).toBeVisible();

  await themeToggle.click();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("theme"))).toBe("system");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(themeToggle.locator('[data-theme-icon="system"]')).toBeVisible();

  await themeToggle.click();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("theme"))).toBe("light");
  await expect(page.locator("html")).toHaveClass(/light/);
  await expect(themeToggle.locator('[data-theme-icon="light"]')).toBeVisible();
  expect(hydrationFailures).toEqual([]);
});

test("opening settings preserves the active light theme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => window.localStorage.setItem("theme", "dark"));
  await page.goto("/settings");
  await page.getByRole("button", { name: "Theme dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.goto("/app/maps");
  const themeToggle = page.getByRole("button", {
    name: /^Theme: (Light|Dark|System)\. Change appearance$/,
  });
  await themeToggle.click();
  await themeToggle.click();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("theme"))).toBe("light");
  await expect(page.locator("html")).toHaveClass(/light/);

  await page.getByRole("link", { name: "Device settings" }).click();

  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.locator("html")).toHaveClass(/light/);
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("theme"))).toBe("light");
});

test("chat docks flush under the editor bar and becomes a full-width sheet on phones", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await createBlankMap(page);

  const sidebar = page.locator("#editor-chat-sidebar");
  const chatHeader = page.getByTestId("chat-sidebar-header");
  const [sidebarBox, barBox] = await Promise.all([
    sidebar.boundingBox(),
    page.getByTestId("editor-project-bar").boundingBox(),
  ]);

  expect(sidebarBox).not.toBeNull();
  expect(barBox).not.toBeNull();
  expect(sidebarBox!.y).toBeCloseTo(barBox!.y + barBox!.height, 0);
  expect(sidebarBox!.y + sidebarBox!.height).toBeCloseTo(900, 0);
  await expect(chatHeader.getByRole("button", { name: "Close chat" })).toBeVisible();

  await page.setViewportSize({ width: 320, height: 640 });
  await expect(chatHeader).toBeVisible();
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBeCloseTo(320, 0);
  await expectNoHorizontalOverflow(page);
});

test("desktop chat sidebar can be drag resized without affecting mobile layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => window.localStorage.setItem("theme", "dark"));
  await createBlankMap(page);

  const sidebar = page.locator("#editor-chat-sidebar");
  const resizeHandle = page.getByRole("separator", { name: "Resize chat sidebar" });
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBeCloseTo(392, 0);

  const initialBox = await sidebar.boundingBox();
  const handleBox = await resizeHandle.boundingBox();

  expect(initialBox).not.toBeNull();
  expect(handleBox).not.toBeNull();

  const dragBy = async (distance: number) => {
    const box = (await resizeHandle.boundingBox())!;
    const x = box.x + box.width / 2;
    await page.mouse.move(x, box.y + 120);
    await page.mouse.down();
    await page.mouse.move(x + distance, box.y + 120);
    await page.mouse.up();
  };

  // The width follows the drag distance exactly (392 + 80)...
  await dragBy(80);
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBeCloseTo(472, 0);
  await expect(resizeHandle).toHaveAttribute("aria-valuenow", "472");

  // ...and a longer drag stops at the 520 px maximum.
  await dragBy(160);
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBeCloseTo(520, 0);
  await expect(resizeHandle).toHaveAttribute("aria-valuenow", "520");

  await page.reload();
  await page.getByRole("button", { name: "Open chat" }).click();
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBeCloseTo(520, 0);

  // At 800 px the maximum leaves the 56 px rail and a 320 px canvas.
  await page.setViewportSize({ width: 800, height: 900 });
  await expect(resizeHandle).toHaveAttribute("aria-valuemax", "424");
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBeCloseTo(424, 0);
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBeCloseTo(520, 0);

  await page.setViewportSize({ width: 320, height: 640 });
  await expect(resizeHandle).toBeHidden();
  await expectNoHorizontalOverflow(page);
});

for (const sides of [
  { source: "right", target: "left" },
  { source: "bottom", target: "top" },
]) {
  test(`manual ${sides.source}-to-${sides.target} connection sides survive layout and reload`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openBlankEditor(page);
    for (const subtype of ["web-app", "mobile-app"]) {
      await page.getByRole("button", { name: "Add node" }).click();
      await page.getByTestId("category-client").click();
      await page.getByTestId(`subtype-${subtype}`).click();
      await page.getByRole("button", { name: "Close panel" }).click();
    }
    const nodes = page.locator(".react-flow__node");
    const source = nodes.nth(0);
    const target = nodes.nth(1);
    if (sides.source === "right") {
      const targetBox = (await target.boundingBox())!;
      await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(targetBox.x + targetBox.width / 2 + 250, targetBox.y + 280, {
        steps: 8,
      });
      await page.mouse.up();
    }

    const sourceHandle = source.locator(`.react-flow__handle-${sides.source}`);
    const targetHandle = target.locator(`.react-flow__handle-${sides.target}`);
    await sourceHandle.dragTo(targetHandle);
    await page.getByTestId("connection-type-http").click();
    const path = page.locator(".react-flow__edge-path");
    await expect(path).toHaveCount(1);

    const endpointOffsets = async () => {
      const points = await path.evaluate((element) => {
        const curve = element as SVGPathElement;
        const transform = curve.getScreenCTM()!;
        return [curve.getPointAtLength(0), curve.getPointAtLength(curve.getTotalLength())].map(
          (point) => {
            const screen = point.matrixTransform(transform);
            return { x: screen.x, y: screen.y };
          }
        );
      });
      const handles = await Promise.all([sourceHandle.boundingBox(), targetHandle.boundingBox()]);
      return points.flatMap((point, index) => {
        const box = handles[index]!;
        return [
          Math.abs(point.x - box.x - box.width / 2),
          Math.abs(point.y - box.y - box.height / 2),
        ];
      });
    };
    const expectChosenSides = () =>
      expect.poll(async () => Math.max(...(await endpointOffsets()))).toBeLessThan(8);
    await expectChosenSides();
    await page.getByRole("button", { name: "Auto-layout", exact: true }).click();
    await expectChosenSides();

    const projectId = new URL(page.url()).hash.slice(1);
    await expect
      .poll(async () => {
        const projects = await readIndexedDbStore<VaultProjectRecord>(
          page,
          "stackhatch-vault",
          "projects"
        );
        return projects.find((project) => project.id === projectId)?.canvasState?.edges[0];
      })
      .toMatchObject({ sides });
    await page.reload();
    await expect(path).toHaveCount(1);
    await expectChosenSides();
  });
}

async function dragHandleTo(page: Page, handle: Locator, dx: number, dy: number) {
  const box = (await handle.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
  return { x: x + dx, y: y + dy };
}

async function storedEdges(page: Page) {
  const projectId = new URL(page.url()).hash.slice(1);
  const projects = await readIndexedDbStore<VaultProjectRecord>(
    page,
    "stackhatch-vault",
    "projects"
  );
  return projects.find((project) => project.id === projectId)?.canvasState?.edges ?? [];
}

async function openEditorWithOneNode(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openBlankEditor(page);
  await page.getByRole("button", { name: "Add node" }).click();
  await page.getByTestId("category-client").click();
  await page.getByTestId("subtype-web-app").click();
  await page.getByRole("button", { name: "Close panel" }).click();
  const original = page.locator(".react-flow__node").first();
  const originalId = await original.getAttribute("data-id");
  return { original, originalId };
}

test("dropping a connection on empty canvas adds a connected node there", async ({ page }) => {
  const { original, originalId } = await openEditorWithOneNode(page);
  const drop = await dragHandleTo(page, original.locator(".react-flow__handle-bottom"), 0, 260);

  const menu = page.getByTestId("canvas-add-node-menu");
  await expect(menu).toBeVisible();
  // Opens at the drop point, shifted up only as far as needed to stay inside the window.
  // Reduced motion still runs a ~10 µs transition on `top`, so wait for it to settle.
  await expect
    .poll(async () => {
      const box = (await menu.boundingBox())!;
      return {
        atDropX: Math.abs(box.x - drop.x) <= 8,
        notBelowDrop: box.y <= drop.y + 8,
        insideWindow: box.y + box.height <= 900,
      };
    })
    .toEqual({ atDropX: true, notBelowDrop: true, insideWindow: true });
  await page.getByTestId("category-data").click();
  await page.getByTestId("subtype-sql-db").click();

  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await expect(page.locator(".react-flow__edge-path")).toHaveCount(1);
  await expect(page.getByTestId("connection-type-http")).toHaveCount(0);
  await expect(menu).toBeHidden();
  const added = (await page.locator(".react-flow__node").nth(1).boundingBox())!;
  expect(Math.abs(added.x + added.width / 2 - drop.x)).toBeLessThanOrEqual(12);
  expect(Math.abs(added.y - drop.y)).toBeLessThanOrEqual(12);
  const newId = await page
    .locator(".react-flow__node")
    .evaluateAll(
      (nodes, id) =>
        nodes.find((node) => node.getAttribute("data-id") !== id)?.getAttribute("data-id"),
      originalId
    );
  await expect.poll(() => storedEdges(page)).toHaveLength(1);
  expect((await storedEdges(page))[0]).toMatchObject({
    source: originalId,
    target: newId,
    connectionType: "http",
    sides: { source: "bottom", target: "top" },
  });
});

test("dropping from an incoming handle makes the new node the source", async ({ page }) => {
  const { original, originalId } = await openEditorWithOneNode(page);
  await dragHandleTo(page, original.locator(".react-flow__handle-left"), -320, 0);
  await expect(page.getByTestId("canvas-add-node-menu")).toBeVisible();
  await page.getByTestId("category-api").click();
  await page.getByTestId("subtype-rest-api").click();

  await expect(page.locator(".react-flow__edge-path")).toHaveCount(1);
  const newId = await page
    .locator(".react-flow__node")
    .evaluateAll(
      (nodes, id) =>
        nodes.find((node) => node.getAttribute("data-id") !== id)?.getAttribute("data-id"),
      originalId
    );
  await expect.poll(() => storedEdges(page)).toHaveLength(1);
  expect((await storedEdges(page))[0]).toMatchObject({
    source: newId,
    target: originalId,
    connectionType: "http",
    sides: { source: "right", target: "left" },
  });
});

test("right-clicking empty canvas adds a node at the cursor", async ({ page }) => {
  await openEditorWithOneNode(page);
  const pane = (await page.locator(".react-flow__pane").boundingBox())!;
  const click = { x: pane.x + 200, y: pane.y + 150 };
  await page.mouse.click(click.x, click.y, { button: "right" });
  await expect(page.getByTestId("canvas-add-node-menu")).toBeVisible();
  await page.getByTestId("category-client").click();
  await page.getByTestId("subtype-mobile-app").click();

  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await expect(page.locator(".react-flow__edge-path")).toHaveCount(0);
  const added = (await page.locator(".react-flow__node").nth(1).boundingBox())!;
  expect(Math.abs(added.x + added.width / 2 - click.x)).toBeLessThanOrEqual(24);
  expect(Math.abs(added.y + added.height / 2 - click.y)).toBeLessThanOrEqual(24);
});

test("Escape closes the canvas menu without adding anything", async ({ page }) => {
  const { original } = await openEditorWithOneNode(page);
  await dragHandleTo(page, original.locator(".react-flow__handle-bottom"), 0, 260);
  const menu = page.getByTestId("canvas-add-node-menu");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
  await expect(page.locator(".react-flow__edge-path")).toHaveCount(0);

  const pane = (await page.locator(".react-flow__pane").boundingBox())!;
  await page.mouse.click(pane.x + 200, pane.y + 150, { button: "right" });
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
});

test("Auto-layout keeps a locked node in place and fits the destination map", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBlankEditor(page);
  const projectId = new URL(page.url()).hash.slice(1);
  const positions = Object.fromEntries(
    Array.from({ length: 6 }, (_, index) => [
      `node-${index}`,
      { x: (index % 3) * 320, y: Math.floor(index / 3) * 180 },
    ])
  );
  await page.evaluate(
    async ({ projectId, positions }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("stackhatch-vault");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const transaction = db.transaction("projects", "readwrite");
        const store = transaction.objectStore("projects");
        const request = store.get(projectId);
        request.onsuccess = () => {
          const project = request.result as VaultProjectRecord;
          project.canvasState = {
            nodes: Array.from({ length: 6 }, (_, index) => ({
              id: `node-${index}`,
              category: "services",
              subtype: "custom",
              name: `Service ${index}`,
              technology: "TypeScript",
              description: "",
              reasoning: "",
              locked: index === 0,
            })),
            edges: Array.from({ length: 5 }, (_, index) => ({
              id: `edge-${index}`,
              source: `node-${index}`,
              target: `node-${index + 1}`,
              connectionType: "http",
              label: "Request",
            })),
            positions,
          };
          project.revision += 1;
          project.updatedAt = Date.now();
          store.put(project);
        };
        await new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onabort = () => reject(transaction.error);
          transaction.onerror = () => reject(transaction.error);
        });
      } finally {
        db.close();
      }
    },
    { projectId, positions }
  );
  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
  await page.getByRole("button", { name: "Auto-layout", exact: true }).click();

  // Waiting for the durable destination also lets the presentation settle finish.
  const savedPositions = async () => {
    const projects = await readIndexedDbStore<VaultProjectRecord>(
      page,
      "stackhatch-vault",
      "projects"
    );
    return projects.find((project) => project.id === projectId)?.canvasState?.positions;
  };
  await expect.poll(savedPositions).not.toEqual(positions);
  const destination = await savedPositions();
  expect(destination?.["node-0"]).toEqual(positions["node-0"]);
  expect(await canvasHasOverlap(page.locator(".react-flow__node"))).toBe(false);
  await expect
    .poll(() =>
      page.locator(".react-flow__node").evaluateAll((nodes) => {
        const canvas = document.querySelector(".react-flow")!.getBoundingClientRect();
        return nodes.every((node) => {
          const bounds = node.getBoundingClientRect();
          return (
            bounds.left >= canvas.left &&
            bounds.right <= canvas.right &&
            bounds.top >= canvas.top &&
            bounds.bottom <= canvas.bottom
          );
        });
      })
    )
    .toBe(true);
});

for (const gesture of [
  "Zoom in",
  "pan",
  "wheel",
  "fit then zoom",
  "reduced-motion zoom",
] as const) {
  test(`a ${gesture} viewport gesture takes over from Auto-layout`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // D3 captures the frame scheduler on import, so install before loading the app.
    await page.clock.install();
    if (gesture === "reduced-motion zoom") await page.emulateMedia({ reducedMotion: "reduce" });
    await openBlankEditor(page);
    for (const subtype of ["web-app", "mobile-app"]) {
      await page.getByRole("button", { name: "Add node" }).click();
      await page.getByTestId("category-client").click();
      await page.getByTestId(`subtype-${subtype}`).click();
      await page.getByRole("button", { name: "Close panel" }).click();
    }
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 300);
    const viewport = () =>
      page.locator(".react-flow__viewport").evaluate((element) => {
        const matrix = new DOMMatrix(getComputedStyle(element).transform);
        return { x: matrix.e, y: matrix.f, zoom: matrix.a };
      });

    await page.getByRole("button", { name: "Auto-layout", exact: true }).click();
    // Native gestures start before the first frame, when the viewport is known
    // and a queued cleanup cannot masquerade as the user's camera movement.
    if (gesture === "Zoom in" || gesture === "fit then zoom") await page.clock.runFor(48);
    const beforeGesture = await viewport();
    if (gesture === "Zoom in" || gesture === "fit then zoom" || gesture === "reduced-motion zoom") {
      if (gesture === "fit then zoom") {
        await page.getByRole("button", { name: "Fit map to view", exact: true }).click();
      }
      await page.getByRole("button", { name: "Zoom in", exact: true }).click();
      await page.clock.runFor(16);
    } else {
      await page.mouse.move(160, 160);
      if (gesture === "pan") {
        await page.mouse.down();
        await page.mouse.move(240, 210, { steps: 2 });
        await page.mouse.up();
      } else {
        await page.locator(".react-flow__pane").dispatchEvent("wheel", {
          deltaY: -120,
          clientX: 160,
          clientY: 160,
        });
      }
    }
    if (gesture === "pan") {
      await expect.poll(viewport).toEqual({
        x: beforeGesture.x + 80,
        y: beforeGesture.y + 50,
        zoom: beforeGesture.zoom,
      });
    } else if (gesture === "wheel") {
      await expect.poll(async () => (await viewport()).zoom).toBeGreaterThan(beforeGesture.zoom);
    } else {
      await expect.poll(viewport).not.toEqual(beforeGesture);
    }
    const userViewport = await viewport();
    await page.clock.runFor(400);
    expect(await viewport()).toEqual(userViewport);
  });
}

test("canvas nodes cannot be added or dragged on top of one another", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBlankEditor(page);

  for (const subtype of ["web-app", "mobile-app"]) {
    await page.getByRole("button", { name: "Add node" }).click();
    await page.getByTestId("category-client").click();
    await page.getByTestId(`subtype-${subtype}`).click();
    await page.getByRole("button", { name: "Close panel" }).click();
  }

  const nodes = page.locator(".react-flow__node");
  await expect(nodes).toHaveCount(2);
  await expect.poll(() => canvasHasOverlap(nodes)).toBe(false);

  const initialBoxes = await Promise.all([nodes.nth(0).boundingBox(), nodes.nth(1).boundingBox()]);
  const firstBox = initialBoxes[0]!;
  const secondBox = initialBoxes[1]!;

  // Drag into open space, away from the first node, wherever placement put it.
  const away = secondBox.x < firstBox.x ? -1 : 1;
  await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    secondBox.x + secondBox.width / 2 + away * 300,
    secondBox.y + secondBox.height / 2 + 200,
    {
      steps: 10,
    }
  );
  await page.mouse.up();

  await expect
    .poll(async () => (await nodes.nth(1).boundingBox())?.y)
    .toBeGreaterThan(secondBox.y + 150);
  const safeBox = await nodes.nth(1).boundingBox();
  expect(safeBox).not.toBeNull();

  await page.mouse.move(safeBox!.x + safeBox!.width / 2, safeBox!.y + safeBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
  await page.mouse.up();

  await expect.poll(() => canvasHasOverlap(nodes)).toBe(false);
  await expect.poll(async () => (await nodes.nth(1).boundingBox())?.x).toBeCloseTo(safeBox!.x, 0);
  await expect.poll(async () => (await nodes.nth(1).boundingBox())?.y).toBeCloseTo(safeBox!.y, 0);
});

test("generated maps separate wide measured nodes after automatic layout", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const projectId = await createBlankMap(page);
  await useProviderKey(page, { remember: true, returnTo: `/project/#${projectId}` });
  await mockAnthropic(page, [
    [
      "Mapped.",
      '<stack>{"nodes":[',
      '{"id":"canvas","category":"services","subtype":"custom","name":"Canvas & Architecture Persistence","technology":"TypeScript","description":"","reasoning":"","locked":false},',
      '{"id":"export","category":"services","subtype":"custom","name":"Export & Image Generation","technology":"html-to-image","description":"","reasoning":"","locked":false},',
      '{"id":"backup","category":"services","subtype":"custom","name":"Backup & Restore System","technology":"TypeScript + IndexedDB","description":"","reasoning":"","locked":false},',
      '{"id":"context","category":"services","subtype":"custom","name":"AI Context & Prompt Builder","technology":"TypeScript","description":"","reasoning":"","locked":false},',
      '{"id":"repository","category":"services","subtype":"custom","name":"GitHub Repository Analyzer","technology":"Browser API client","description":"","reasoning":"","locked":false}',
      '],"edges":[]}</stack>',
    ].join(""),
  ]);
  await page.goto(`/project/#${projectId}`);
  await openChat(page);
  await sendChatMessage(page, "Map the architecture.");

  const nodes = page.locator(".react-flow__node");
  await expect(nodes).toHaveCount(5, { timeout: 30_000 });
  await expect.poll(() => canvasHasOverlap(nodes)).toBe(false);

  await page.setViewportSize({ width: 320, height: 640 });
  await expect.poll(() => canvasHasOverlap(nodes)).toBe(false);
  await expectNoHorizontalOverflow(page);
});

test("mobile repository maps keep re-scan in the editor bar", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await useProviderKey(page, { remember: true });
  await mockAnthropic(page, ["Repository scan complete."]);
  const github = await mockGitHub(page);
  await page.goto("/project/new");
  await page.getByLabel("GitHub repository").fill("acme/platform");
  await page.getByRole("button", { name: "Map repository" }).click();
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#.+/);

  const rescan = page.getByTestId("rescan-button");
  await expect(rescan).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await rescan.click();
  await expect.poll(() => github.length).toBeGreaterThan(0);
  await expect(
    page.getByRole("alert").filter({ has: page.getByLabel("Anthropic API key") })
  ).toHaveCount(0);
});

test("a map can be renamed and the new name survives a reload", async ({ page }) => {
  // The canvas writer takes the name from an acknowledged snapshot, so a rename
  // that only touched component state would be reverted by the next auto-save.
  await openBlankEditor(page);
  await page.getByRole("button", { name: /Map name, select to rename/ }).click();
  await page.getByRole("textbox", { name: "Map name" }).fill("Renamed platform");
  await page.keyboard.press("Enter");

  // Wait for the debounced write rather than guessing at a delay.
  await expect
    .poll(async () => {
      const projects = await readIndexedDbStore<{ name: string }>(
        page,
        "stackhatch-vault",
        "projects"
      );
      return projects.map((project) => project.name);
    })
    .toContain("Renamed platform");

  await page.reload();
  await expect(
    page.getByRole("button", { name: /Map name, select to rename: Renamed platform/ })
  ).toBeVisible();
});

test("Space opens the Export menu even though the canvas claims Space for panning", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBlankEditor(page);
  const exportTrigger = page.getByRole("button", { name: "Export map" });
  await exportTrigger.focus();
  await page.keyboard.press("Space");
  await expect(exportTrigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("export-dropdown")).toBeVisible();
});

test("a map description can be edited inline and survives a reload", async ({ page }) => {
  const multilineDescription = "Customer-facing platform map\n\nKeep requirements readable";
  await openBlankEditor(page);
  await page.goto("/app/maps");

  await page.getByRole("button", { name: "Edit description for Untitled map" }).click();
  const description = page.getByRole("textbox", {
    name: "Description for Untitled map",
  });
  await expectNoHorizontalOverflow(page);
  await description.fill(multilineDescription);
  await description.press("Enter");

  await expect
    .poll(async () => {
      const projects = await readIndexedDbStore<{ description: string | null }>(
        page,
        "stackhatch-vault",
        "projects"
      );
      return projects.map((project) => project.description);
    })
    .toContain(multilineDescription);

  await page.reload();
  await expect(
    page.getByRole("button", { name: "Edit description for Untitled map" })
  ).toContainText("Customer-facing platform map");

  await page.setViewportSize({ width: 320, height: 640 });
  await page.getByRole("button", { name: "Edit description for Untitled map" }).click();
  const mobileDescription = page.getByRole("textbox", {
    name: "Description for Untitled map",
  });
  await expect(mobileDescription).toBeVisible();
  await expect(mobileDescription).toHaveValue(multilineDescription);
  await expectNoHorizontalOverflow(page);

  await mobileDescription.press("Escape");
  await page.getByRole("button", { name: "Open Untitled map" }).click();
  await expect(page.getByTestId("project-provenance")).toHaveText("Customer-facing platform map");
  await expect(page.getByText("Standalone map")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("assistant messages render lists and tables at desktop and mobile", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const projectId = await createBlankMap(page);
  await useProviderKey(page, { remember: true, returnTo: `/project/#${projectId}` });
  await mockAnthropic(page, [
    [
      "First paragraph.",
      "",
      "Second paragraph.",
      "",
      "- First item",
      "- Second item",
      "",
      "| Component | Technology | Reasoning |",
      "| --- | --- | --- |",
      "| Web App | Next.js 16 | Produces a static export with no server runtime. |",
      "| Local Storage | IndexedDB | Keeps maps available offline on this device. |",
    ].join("\n"),
  ]);
  await page.goto(`/project/#${projectId}`);
  await openChat(page);
  await sendChatMessage(page, "Give me a short checklist.");

  const assistantMessage = page
    .getByTestId("chat-message-assistant")
    .filter({ hasText: "First paragraph." });
  const firstParagraph = assistantMessage.getByText("First paragraph.");
  const list = assistantMessage.getByRole("list");
  const table = assistantMessage.getByRole("table");
  const tableRegion = assistantMessage.getByRole("region", { name: "Scrollable table" });

  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(firstParagraph).toBeVisible();
    await expect(list).toHaveCSS("list-style-type", "disc");
    await expect(table).toBeVisible();
    await expect(table.getByRole("columnheader")).toHaveCount(3);
    await expect(table.getByRole("cell", { name: "Next.js 16" })).toBeVisible();
  }

  await page.setViewportSize({ width: 320, height: 640 });
  await expect(assistantMessage).toBeVisible();
  await expect(list).toBeVisible();
  await expect(tableRegion).toBeVisible();
  await tableRegion.focus();
  await expect(tableRegion).toBeFocused();
  // Cells wrap inside the column, so no column hides behind a scroll.
  expect(await tableRegion.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true
  );
  await expectNoHorizontalOverflow(page);
});

test("keyboard users can operate the chooser and destructive confirmation safely", async ({
  page,
}) => {
  await page.goto("/project/new");
  const keySetup = page.getByRole("group", { name: "Connect an AI provider" });
  const providerSelect = keySetup.getByLabel("AI provider");
  await providerSelect.focus();
  await page.keyboard.press("Tab");
  await expect(keySetup.getByLabel("Anthropic API key")).toBeFocused();

  await useProviderKey(page, { remember: true });
  await page.goto("/project/new");
  const blankStart = page.getByRole("button", { name: "Create blank map" });
  await blankStart.focus();
  await expect(blankStart).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Choose .md or .txt file")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("GitHub repository")).toBeFocused();
  await page.keyboard.press("Tab");
  const tokenDisclosure = page.getByRole("button", {
    name: "Private repository? Add a GitHub token",
  });
  await expect(tokenDisclosure).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(tokenDisclosure).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("GitHub token")).toBeFocused();

  await page.goto("/settings");
  const clear = page.getByRole("button", { name: "Clear all local data" });
  await clear.focus();
  await clear.press("Enter");
  const dialog = page.getByRole("dialog", {
    name: "Clear all StackHatch data from this device?",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel(/CLEAR THIS DEVICE/)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(clear).toBeFocused();
});

test("the landing page holds its layout through the tablet band", async ({ page }) => {
  // 640-1024px previously had no rules of its own and inherited desktop grids
  // down to 760px; .sectionHeading overflowed there and `overflow: clip` hid it.
  for (const width of [1024, 900, 860, 820, 780, 700, 640]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expectNoHorizontalOverflow(page);

    // The hero media slot must grow with the viewport, not shrink. The old
    // proof shot rendered 30% larger on a tablet than on a 1920px desktop.
    const box = await page.getByTestId("hero-proof").boundingBox();
    expect(box, `hero slot missing at ${width}px`).not.toBeNull();
    expect(box!.width, `hero slot too small at ${width}px`).toBeGreaterThan(width * 0.55);
  }
});

test("rail menus close when pressing the canvas, a node or an edge", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBlankEditor(page);
  for (const [category, subtype] of [
    ["client", "web-app"],
    ["data", "sql-db"],
  ]) {
    await page.getByRole("button", { name: "Add node" }).click();
    await page.getByTestId(`category-${category}`).click();
    await page.getByTestId(`subtype-${subtype}`).click();
    await page.getByRole("button", { name: "Close panel" }).click();
  }
  const nodes = page.locator(".react-flow__node");
  await nodes
    .nth(0)
    .locator(".react-flow__handle-bottom")
    .dragTo(nodes.nth(1).locator(".react-flow__handle-top"));
  await page.getByTestId("connection-type-http").click();
  const pane = (await page.locator(".react-flow__pane").boundingBox())!;

  const presses = {
    canvas: () => page.mouse.click(pane.x + 700, pane.y + 100),
    node: () => nodes.nth(0).click(),
    edge: async () => {
      const box = (await page.locator(".react-flow__edge-path").boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    },
  };
  const menus = [
    {
      trigger: page.getByTestId("editor-display-settings-button"),
      id: "editor-display-settings-dropdown",
    },
    { trigger: page.getByTestId("add-node-button"), id: "add-node-dropdown" },
  ];
  for (const { trigger, id } of menus) {
    for (const [name, press] of Object.entries(presses)) {
      await trigger.click();
      await expect(page.getByTestId(id)).toBeVisible();
      await press();
      await expect(page.getByTestId(id), `${id} after ${name} press`).toBeHidden();
    }
  }

  // The canvas menu opened by a right-click closes the same way.
  for (const [name, press] of Object.entries(presses)) {
    await page.mouse.click(pane.x + 150, pane.y + 700, { button: "right" });
    await expect(page.getByTestId("canvas-add-node-menu")).toBeVisible();
    await press();
    await expect(
      page.getByTestId("canvas-add-node-menu"),
      `canvas menu after ${name} press`
    ).toBeHidden();
  }
});
