import { expect, test } from "@playwright/test";
import { AI_PROVIDERS } from "../src/lib/ai/providers";
import {
  TEST_PROVIDER_KEYS,
  createBlankMap,
  mockChatCompletions,
  openChat,
  readIndexedDbStore,
  sendChatMessage,
  trackExternalRequests,
  useProviderKey,
} from "./helpers/sse-mock";

test("chat streams from OpenAI once it is chosen in Settings", async ({ page }) => {
  const external = trackExternalRequests(page);
  const projectId = await createBlankMap(page);
  await useProviderKey(page, {
    provider: "openai",
    remember: true,
    returnTo: `/project/#${projectId}`,
  });
  const openai = await mockChatCompletions(page, "openai", ["A browser-local map fits."]);
  await page.goto(`/project/#${projectId}`);
  await openChat(page);

  await sendChatMessage(page, "What should I build?");
  await expect(page.getByText("A browser-local map fits.")).toBeVisible();

  expect(openai).toHaveLength(1);
  const [request] = openai;
  expect(request.url).toBe("https://api.openai.com/v1/chat/completions");
  expect(request.headers.authorization).toBe(`Bearer ${TEST_PROVIDER_KEYS.openai}`);
  expect(JSON.parse(request.body ?? "{}")).toMatchObject({
    model: AI_PROVIDERS.openai.defaultModel,
    stream: true,
    messages: expect.arrayContaining([
      expect.objectContaining({ role: "system" }),
      { role: "user", content: "What should I build?" },
    ]),
  });
  expect(request.body).not.toContain(TEST_PROVIDER_KEYS.openai);
  expect(new Set(external.map((entry) => new URL(entry.url()).origin))).toEqual(
    new Set([AI_PROVIDERS.openai.origin])
  );

  const preferences = await readIndexedDbStore<{ model: string }>(
    page,
    "stackhatch-vault",
    "preferences"
  );
  expect(preferences.map((record) => record.model)).toEqual([
    `openai:${AI_PROVIDERS.openai.defaultModel}`,
  ]);

  await page.reload();
  await openChat(page);
  await expect(page.getByText("A browser-local map fits.")).toBeVisible();
});

test("the inline key prompt can switch provider and sends the waiting draft there", async ({
  page,
}) => {
  await createBlankMap(page);
  await openChat(page);
  await sendChatMessage(page, "Map a checkout service.");

  const keyPrompt = page.getByRole("alert").filter({ has: page.getByLabel("AI provider") });
  await expect(keyPrompt.getByLabel("Anthropic API key")).toBeVisible();
  await keyPrompt.getByLabel("AI provider").selectOption("openrouter");
  const openrouter = await mockChatCompletions(page, "openrouter", ["Checkout mapped."]);
  await keyPrompt.getByLabel("OpenRouter API key").fill(TEST_PROVIDER_KEYS.openrouter);
  await keyPrompt.getByRole("button", { name: "Use key" }).click();

  await expect(page.getByText("Checkout mapped.")).toBeVisible();
  expect(openrouter).toHaveLength(1);
  expect(openrouter[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
  const body = JSON.parse(openrouter[0].body ?? "{}");
  expect(body.model).toBe(AI_PROVIDERS.openrouter.defaultModel);
  expect(body.messages.at(-1)).toEqual({ role: "user", content: "Map a checkout service." });
  expect(openrouter[0].headers.authorization).toBe(`Bearer ${TEST_PROVIDER_KEYS.openrouter}`);
});

test("a custom model ID saved in Settings is the model the provider receives", async ({ page }) => {
  const projectId = await createBlankMap(page);
  await useProviderKey(page, { provider: "gemini", returnTo: `/project/#${projectId}` });
  await page.getByLabel("Model", { exact: true }).selectOption({ label: "Other model ID…" });
  await page.getByLabel("Model ID").fill("gemini-flash-latest");
  await page.getByRole("button", { name: "Save model" }).click();
  await expect(
    page.getByText("Default model saved on this device.", { exact: true })
  ).toBeVisible();

  const gemini = await mockChatCompletions(page, "gemini", ["Flash answered."]);
  // A session-only key lives in this tab's memory, so stay in the app.
  await page.getByRole("link", { name: /Continue to your project/ }).click();
  await openChat(page);
  await sendChatMessage(page, "Hello");

  await expect(page.getByText("Flash answered.")).toBeVisible();
  expect(gemini[0].url).toBe(
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
  );
  expect(JSON.parse(gemini[0].body ?? "{}")).toMatchObject({ model: "gemini-flash-latest" });
});
