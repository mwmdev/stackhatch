import { expect, test, type Page } from "@playwright/test";

const FAKE_ANTHROPIC_KEY = "sk-ant-api03-playwright-tierless-byok-key";

async function clearAnthropicKey(page: Page) {
  const response = await page.request.patch("/api/settings", {
    data: { clearApiKey: true },
  });

  expect(response.status()).toBe(200);
  await expect
    .poll(async () => {
      const settings = await page.request.get("/api/settings");
      if (!settings.ok()) return undefined;
      return (await settings.json()).hasAnthropicKey;
    })
    .toBe(false);
}

async function preventChatFromCallingAnthropic(page: Page) {
  await page.route("**/api/projects/*/chat/init", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Add your Anthropic API key in Settings to use AI features.",
        code: "AI_NOT_CONFIGURED",
      }),
    });
  });
}

test.describe("tierless BYOK experience", () => {
  test("landing page presents StackHatch as free BYOK software without commercial CTAs", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.getByRole("main")).toContainText(/free to use/i);
    await expect(page.getByRole("main")).toContainText(/your Anthropic API key|BYOK/i);
    await expect(page.locator('a[href="/pricing"]')).toHaveCount(0);
    await expect(page.getByRole("link", { name: /pricing|compare plans|upgrade/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /pricing|compare plans|upgrade/i })).toHaveCount(
      0
    );
  });

  test("a user without a key gets setup guidance but can still create a blank project", async ({
    page,
  }) => {
    await clearAnthropicKey(page);
    await preventChatFromCallingAnthropic(page);

    await page.goto("/app");

    const setupPrompt = page.getByTestId("byok-setup-prompt");
    await expect(setupPrompt).toBeVisible();
    await expect(setupPrompt).toContainText("Connect Anthropic to use AI");
    await expect(setupPrompt.getByRole("link", { name: "Add API key" })).toHaveAttribute(
      "href",
      "/settings?setup=anthropic"
    );

    const manualCard = page.getByRole("heading", { name: "Start fresh" }).locator("..");
    await expect(manualCard).toContainText("No API key is required");
    await page.getByRole("button", { name: "Start from scratch" }).click();

    await page.waitForURL(/\/project\/[a-f0-9-]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Untitled Project");
    await expect(page.getByText("Ask an architecture question or add a component")).toBeVisible();

    await page.getByTestId("add-node-button").click();
    await page.getByTestId("category-data").click();
    await page.getByTestId("subtype-sql-db").click();
    await expect(page.getByText("SQL Database").first()).toBeVisible();

    const projectId = page.url().split("/project/")[1];
    await expect
      .poll(async () => {
        const response = await page.request.get(`/api/projects/${projectId}`);
        if (!response.ok()) return 0;
        return (await response.json()).canvasState?.nodes?.length ?? 0;
      })
      .toBe(1);
    await page.reload();
    await expect(page.getByText("SQL Database").first()).toBeVisible();
  });

  test("Settings stores a fake key and a supported per-user model without returning the key", async ({
    page,
  }) => {
    await clearAnthropicKey(page);

    try {
      await page.goto("/settings?setup=anthropic");

      await expect(page.getByTestId("key-status-missing")).toBeVisible();
      const keyInput = page.getByLabel("API Key");
      await keyInput.fill(FAKE_ANTHROPIC_KEY);
      await page.getByRole("button", { name: "Save key" }).click();

      await expect(page.getByTestId("key-status-set")).toBeVisible();
      await expect(keyInput).toHaveValue("");
      await expect(page.getByRole("status")).toContainText("Anthropic API key saved");

      const modelSelect = page.getByLabel("Model");
      const currentModel = await modelSelect.inputValue();
      const supportedModels = await modelSelect
        .locator("option")
        .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
      const selectedModel = supportedModels.find((model) => model !== currentModel);
      expect(selectedModel).toBeTruthy();

      await modelSelect.selectOption(selectedModel!);
      await expect(page.getByRole("status")).toContainText("Claude model saved");
      await expect(modelSelect).toHaveValue(selectedModel!);

      const response = await page.request.get("/api/settings");
      expect(response.status()).toBe(200);
      const responseText = await response.text();
      expect(responseText).not.toContain(FAKE_ANTHROPIC_KEY);

      const settings = JSON.parse(responseText) as Record<string, unknown>;
      expect(settings.hasAnthropicKey).toBe(true);
      expect(settings.model).toBe(selectedModel);
      expect(Object.keys(settings)).not.toContain("apiKey");
      expect(Object.keys(settings)).not.toContain("anthropicApiKey");
    } finally {
      await clearAnthropicKey(page);
    }
  });

  test("a user creates a tierless team and a project in its preselected workspace", async ({
    page,
  }) => {
    await clearAnthropicKey(page);
    await preventChatFromCallingAnthropic(page);
    const teamName = `Tierless E2E ${Date.now()}`;

    await page.goto("/app");
    await page.getByLabel("Team name").fill(teamName);
    await page.getByRole("button", { name: "Create team" }).click();
    await page.waitForURL(/\/team\/[a-f0-9-]+$/);

    const teamId = page.url().split("/team/")[1];
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(teamName);
    await expect(page.getByRole("main")).not.toContainText(
      /seats? used|upgrade|subscription|billing|Team \((?:5|15)\)/i
    );

    await page.getByRole("link", { name: "New project" }).click();
    await page.waitForURL(`/project/new?teamId=${teamId}`);

    const workspace = page.getByLabel("Workspace");
    await expect(workspace).toHaveValue(teamId);
    await expect(workspace.locator("option:checked")).toHaveText(teamName);

    const projectName = `Team project ${Date.now()}`;
    await page.getByLabel(/Project Name/).fill(projectName);
    await page.getByRole("button", { name: "Create Project" }).click();
    await page.waitForURL(/\/project\/[a-f0-9-]+$/);

    const projectId = page.url().split("/project/")[1];
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(projectName);
    const projectResponse = await page.request.get(`/api/projects/${projectId}`);
    expect(projectResponse.status()).toBe(200);
    expect(await projectResponse.json()).toMatchObject({
      id: projectId,
      name: projectName,
      teamId,
    });
  });

  test("a team owner can create, copy, and open a working invite link", async ({ page }) => {
    const teamName = `Invite E2E ${Date.now()}`;
    const inviteEmail = `invite-${Date.now()}@example.com`;

    await page.goto("/app");
    await page.getByLabel("Team name").fill(teamName);
    await page.getByRole("button", { name: "Create team" }).click();
    await page.waitForURL(/\/team\/[a-f0-9-]+$/);

    await page.getByPlaceholder("colleague@example.com").fill(inviteEmail);
    await page.getByRole("button", { name: "Create Invite Link" }).click();

    const inviteLink = page.getByLabel(`Invite link for ${inviteEmail}`);
    await expect(inviteLink).toBeVisible();
    const inviteUrl = await inviteLink.inputValue();
    expect(inviteUrl).toMatch(/\/invite\/[a-f0-9]{64}$/);

    await page.goto(inviteUrl);
    await expect(page.getByRole("heading", { name: "Team Invite" })).toBeVisible();
    await expect(page.getByText(teamName)).toBeVisible();
    await page.getByRole("button", { name: "Accept Invite" }).click();
    await expect(page.getByRole("heading", { name: "You're in!" })).toBeVisible();
  });
});
