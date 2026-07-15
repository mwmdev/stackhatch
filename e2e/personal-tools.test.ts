import { expect, test, type Page } from "@playwright/test";

const canvasState = JSON.stringify({
  nodes: [
    {
      id: "api-gateway",
      category: "api",
      subtype: "rest-api",
      name: "API Gateway",
      technology: "Next.js",
      description: "Routes requests into the application.",
      reasoning: "Keeps the public boundary explicit.",
      locked: false,
    },
  ],
  edges: [],
  positions: { "api-gateway": { x: 160, y: 120 } },
});

async function createCanvasProject(page: Page, name: string) {
  const response = await page.request.post("/api/projects", {
    data: { name, canvasState },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string };
}

test.describe("personal workspace tools", () => {
  test("a private component note persists after reload", async ({ page }) => {
    const project = await createCanvasProject(page, `Notes E2E ${Date.now()}`);
    await page.goto(`/project/${project.id}`);

    const node = page.getByTestId("stack-node-api-gateway");
    await expect(node).toBeVisible();
    await node.click({ button: "right" });
    await page.getByTestId("context-menu-add-note").click();

    await expect(page.getByRole("heading", { name: "Notes on API Gateway" })).toBeVisible();
    await expect(page.getByText("No notes on this component yet.")).toBeVisible();
    await page.getByPlaceholder("Note on API Gateway...").fill("Keep this boundary explicit.");
    await page.getByRole("button", { name: "Save note" }).click();
    await expect(page.getByText("Keep this boundary explicit.")).toBeVisible();
    await expect(node.getByTestId("note-badge")).toHaveText("1");

    await page.reload();
    await expect(node).toBeVisible();
    await node.getByTestId("note-badge").click();
    await expect(page.getByText("Keep this boundary explicit.")).toBeVisible();

    const notesResponse = await page.request.get(`/api/projects/${project.id}/notes`);
    expect(notesResponse.status()).toBe(200);
    expect(await notesResponse.json()).toEqual([
      expect.objectContaining({
        content: "Keep this boundary explicit.",
        nodeId: "api-gateway",
      }),
    ]);
  });

  test("a saved personal template creates a reusable map", async ({ page }) => {
    const source = await createCanvasProject(page, `Template source ${Date.now()}`);
    const templateName = `Onboarding map ${Date.now()}`;
    await page.goto(`/project/${source.id}`);

    await page.getByRole("button", { name: "Save as Template" }).click();
    await page.getByLabel(/Template Name/).fill(templateName);
    await page.getByLabel("Description").fill("A reusable starting point.");
    await page.getByRole("button", { name: "Save Template" }).click();
    await expect(page.getByText("Template saved successfully!")).toBeVisible();

    const templatesResponse = await page.request.get("/api/templates");
    expect(templatesResponse.status()).toBe(200);
    expect(await templatesResponse.json()).toContainEqual(
      expect.objectContaining({ name: templateName, canvasState })
    );

    await page.goto("/app");
    await page.getByRole("link", { name: "Choose a template" }).click();
    await page.waitForURL("/project/new?mode=template");
    await expect(page.getByRole("dialog", { name: "Start from Template" })).toBeVisible();
    await page.getByRole("button", { name: new RegExp(templateName) }).click();

    await page.waitForURL(/\/project\/[a-f0-9-]+$/);

    await expect(
      page.getByRole("heading", { level: 1, name: `${templateName} – Copy` })
    ).toBeVisible();
    await expect(page.getByTestId("stack-node-api-gateway")).toBeVisible();

    const copyId = page.url().split("/project/")[1];
    const projectResponse = await page.request.get(`/api/projects/${copyId}`);
    expect(projectResponse.status()).toBe(200);
    expect((await projectResponse.json()).canvasState.nodes).toEqual([
      expect.objectContaining({ id: "api-gateway", name: "API Gateway" }),
    ]);
  });

  test("the notes panel stays inside a short editor viewport", async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 420 });
    const project = await createCanvasProject(page, `Short viewport ${Date.now()}`);
    await page.goto(`/project/${project.id}`);

    await page.getByRole("button", { name: "Notes" }).click();
    const panel = page.locator("aside");
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();

    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(420);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      )
    ).toBe(false);
  });
});
