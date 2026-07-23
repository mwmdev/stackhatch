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

async function keepEditorReady(page: Page) {
  await page.route("**/api/projects/*/messages", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "personal-tools-ready-message",
          role: "assistant",
          content: "The architecture is ready.",
          createdAt: Date.now(),
        },
      ]),
    });
  });
}

test.describe("personal workspace tools", () => {
  test("the retired private Notes endpoints return normal 404 responses", async ({ page }) => {
    const project = await createCanvasProject(page, `Retired Notes API ${Date.now()}`);

    const getResponse = await page.request.get(`/api/projects/${project.id}/notes`);
    const postResponse = await page.request.post(`/api/projects/${project.id}/notes`, {
      data: { content: "This endpoint no longer exists." },
    });
    const deleteResponse = await page.request.delete(
      `/api/projects/${project.id}/notes/retired-note`
    );

    expect(getResponse.status()).toBe(404);
    expect(postResponse.status()).toBe(404);
    expect(deleteResponse.status()).toBe(404);
  });

  test("a Note node can be created, edited, colored, and persists after reload", async ({
    page,
  }) => {
    await keepEditorReady(page);
    const project = await createCanvasProject(page, `Note node E2E ${Date.now()}`);
    await page.goto(`/project/${project.id}`);

    await page.getByTestId("add-node-button").click();
    await page.getByTestId("category-note").click();
    await page.getByTestId("subtype-note").click();

    await expect(page.getByTestId("node-detail-panel")).toBeVisible();
    await page.getByLabel("Node name").fill("Boundary decision");
    await page.getByLabel("Note", { exact: true }).fill("Keep this boundary explicit.");
    await page.getByLabel("Note color Mint").click();

    await expect
      .poll(async () => {
        const response = await page.request.get(`/api/projects/${project.id}`);
        const body = await response.json();
        const note = body.canvasState.nodes.find(
          (node: { category: string }) => node.category === "note"
        );
        return note
          ? { name: note.name, description: note.description, noteColor: note.noteColor }
          : null;
      })
      .toEqual({
        name: "Boundary decision",
        description: "Keep this boundary explicit.",
        noteColor: "mint",
      });

    await page.reload();
    const persistedNote = page
      .locator('[data-testid^="stack-node-"]')
      .filter({ hasText: "Boundary decision" });
    await expect(persistedNote).toBeVisible();
    await expect(persistedNote).toContainText("Keep this boundary explicit.");
    await persistedNote.click();
    await expect(page.getByLabel("Node name")).toHaveValue("Boundary decision");
    await expect(page.getByLabel("Note", { exact: true })).toHaveValue(
      "Keep this boundary explicit."
    );
    await expect(page.getByLabel("Note color Mint")).toHaveAttribute("aria-pressed", "true");
  });

  test("a saved personal template creates a reusable map", async ({ page }) => {
    await keepEditorReady(page);
    const source = await createCanvasProject(page, `Template source ${Date.now()}`);
    const templateName = `Onboarding map ${Date.now()}`;
    await page.goto(`/project/${source.id}`);

    await page.getByRole("button", { name: "More project actions" }).click();
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

    await page.goto("/project/new?mode=template");
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
});
