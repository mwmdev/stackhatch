import { expect, test } from "@playwright/test";

test.describe("four project starts", () => {
  test("a bare new-project URL opens the editor-style chooser", async ({ page }) => {
    await page.goto("/project/new");

    await expect(page).toHaveURL(/\/project\/new$/);
    await expect(page.getByRole("heading", { level: 1, name: "Start a new map" })).toBeVisible();
  });

  test("requirements setup preserves the exact continuation", async ({ page }) => {
    const cleared = await page.request.patch("/api/settings", { data: { clearApiKey: true } });
    expect(cleared.ok()).toBe(true);

    await page.goto("/project/new?mode=requirements");

    await expect(
      page.getByRole("heading", { level: 1, name: "Upload requirements" })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Add Anthropic key" })).toHaveAttribute(
      "href",
      "/settings?setup=anthropic&returnTo=%2Fproject%2Fnew%3Fmode%3Drequirements"
    );
  });

  test("a requirements file creates a map and keeps its first heading", async ({ page }) => {
    const configured = await page.request.patch("/api/settings", {
      data: { apiKey: "sk-ant-playwright-placeholder-key", model: "claude-sonnet-5" },
    });
    expect(configured.ok()).toBe(true);
    let submitted: Record<string, unknown> | null = null;
    await page.route("**/api/projects", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      submitted = JSON.parse(route.request().postData() || "{}");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: "requirements-e2e-project" }),
      });
    });

    await page.goto("/project/new?mode=requirements");
    await page.getByLabel("Choose .md or .txt file").setInputFiles({
      name: "platform.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Platform map\n\nKeep the service boundary visible."),
    });

    await page.waitForURL("/project/requirements-e2e-project");
    expect(submitted).toEqual({
      name: "Platform map",
      description: "# Platform map\n\nKeep the service boundary visible.",
    });
  });

  test("repository mode preloads and validates the requested repository", async ({ page }) => {
    const configured = await page.request.patch("/api/settings", {
      data: { apiKey: "sk-ant-playwright-placeholder-key", model: "claude-sonnet-5" },
    });
    expect(configured.ok()).toBe(true);

    await page.goto("/project/new?mode=repository&repo=acme%2Fapi");

    const repository = page.getByRole("textbox", { name: "Public GitHub repository" });
    await expect(repository).toHaveValue("acme/api");
    await repository.fill("not a repository");
    await page.getByRole("button", { name: "Map repository" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Enter a public GitHub repository" })
    ).toContainText("public GitHub repository");
  });

  test("a valid repository creates a map with its normalized URL", async ({ page }) => {
    const configured = await page.request.patch("/api/settings", {
      data: { apiKey: "sk-ant-playwright-placeholder-key", model: "claude-sonnet-5" },
    });
    expect(configured.ok()).toBe(true);
    let submitted: Record<string, unknown> | null = null;
    await page.route("**/api/projects", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      submitted = JSON.parse(route.request().postData() || "{}");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: "repository-e2e-project" }),
      });
    });

    await page.goto("/project/new?mode=repository");
    await page
      .getByRole("textbox", { name: "Public GitHub repository" })
      .fill("https://github.com/acme/platform.git");
    await page.getByRole("button", { name: "Map repository" }).click();

    await page.waitForURL("/project/repository-e2e-project");
    expect(submitted).toEqual({
      name: "platform",
      repoUrl: "https://github.com/acme/platform",
    });
  });

  test("blank map creates one project directly from the editor chooser", async ({ page }) => {
    await page.route("**/api/projects", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ id: "blank-e2e-project", name: "Untitled Project" }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/project/new");
    await page.getByRole("button", { name: /Blank map/ }).click();

    await page.waitForURL("/project/blank-e2e-project");
  });
});
