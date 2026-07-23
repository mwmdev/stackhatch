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

    await page.goto("/project/new?mode=requirements");

    const setupPrompt = page.getByText("Connect Anthropic first").locator("..");
    await expect(setupPrompt).toBeVisible();
    await expect(setupPrompt.getByRole("link", { name: "Add Anthropic key" })).toHaveAttribute(
      "href",
      "/settings?setup=anthropic&returnTo=%2Fproject%2Fnew%3Fmode%3Drequirements"
    );

    await page.getByRole("button", { name: "Choose another source" }).click();
    const blankSource = page.getByRole("button", { name: /Blank map/ });
    await expect(blankSource).toContainText("No AI key");
    await blankSource.click();

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
      await expect(
        page.getByRole("status").filter({ hasText: "Anthropic API key saved" })
      ).toBeVisible();

      const modelSelect = page.getByLabel("Model");
      const currentModel = await modelSelect.inputValue();
      const supportedModels = await modelSelect
        .locator("option")
        .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
      const selectedModel = supportedModels.find((model) => model !== currentModel);
      expect(selectedModel).toBeTruthy();

      await modelSelect.selectOption(selectedModel!);
      await expect(
        page.getByRole("status").filter({ hasText: "Claude model saved" })
      ).toBeVisible();
      await expect(modelSelect).toHaveValue(selectedModel!);

      const response = await page.request.get("/api/settings");
      expect(response.status()).toBe(200);
      const responseText = await response.text();
      expect(responseText).not.toContain(FAKE_ANTHROPIC_KEY);

      const settings = JSON.parse(responseText) as Record<string, unknown>;
      expect(settings.hasAnthropicKey).toBe(true);
      expect(settings.model).toBe(selectedModel);
      expect(settings.customSubtypes).toEqual(expect.any(Object));
      expect(Object.keys(settings)).not.toContain("apiKey");
      expect(Object.keys(settings)).not.toContain("anthropicApiKey");
      expect(Object.keys(settings)).not.toContain("role");
      expect(Object.keys(settings)).not.toContain("isAdmin");
    } finally {
      await clearAnthropicKey(page);
    }
  });

  test("custom node subtypes are saved as personal settings without an administrator surface", async ({
    page,
  }) => {
    const originalResponse = await page.request.get("/api/settings");
    expect(originalResponse.status()).toBe(200);
    const original = (await originalResponse.json()) as {
      customSubtypes?: Record<string, Array<Record<string, string>>>;
    };
    const originalCatalog = original.customSubtypes ?? {};
    const catalog = {
      ...originalCatalog,
      external: [
        ...(originalCatalog.external ?? []).filter((entry) => entry.slug !== "playwright-vendor"),
        { slug: "playwright-vendor", displayName: "Playwright Vendor", icon: "Box" },
      ],
    };

    try {
      const saveResponse = await page.request.patch("/api/settings", {
        data: { customSubtypes: catalog },
      });
      expect(saveResponse.status()).toBe(200);
      await expect
        .poll(async () => {
          const response = await page.request.get("/api/settings");
          if (!response.ok()) return undefined;
          const settings = (await response.json()) as {
            customSubtypes?: Record<string, Array<Record<string, string>>>;
          };
          return settings.customSubtypes?.external?.find(
            (entry) => entry.slug === "playwright-vendor"
          )?.displayName;
        })
        .toBe("Playwright Vendor");

      await page.goto("/settings");
      await expect(page.getByRole("heading", { name: "Node subtypes" })).toBeVisible();
      await expect(page.locator('input[value="Playwright Vendor"]')).toBeVisible();
      await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
    } finally {
      const restoreResponse = await page.request.patch("/api/settings", {
        data: { customSubtypes: originalCatalog },
      });
      expect(restoreResponse.status()).toBe(200);
    }
  });

  test("the personal dashboard has no team or invitation surface", async ({ page }) => {
    await page.goto("/app");

    await expect(page.getByRole("heading", { name: "Teams" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /create team/i })).toHaveCount(0);
    await expect(page.getByLabel("Team name")).toHaveCount(0);

    const teamsResponse = await page.request.get("/api/teams");
    expect(teamsResponse.status()).toBe(404);
    const invitesResponse = await page.request.get("/api/invites/retired-token");
    expect(invitesResponse.status()).toBe(404);
  });
});
