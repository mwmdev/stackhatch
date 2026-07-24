import { expect, test } from "@playwright/test";
import {
  ANTHROPIC_ORIGIN,
  GITHUB_ORIGIN,
  TEST_ANTHROPIC_KEY,
  createBlankMap,
  mockAnthropic,
  mockGitHub,
  openChat,
  trackExternalRequests,
  useAnthropicKey,
} from "./helpers/sse-mock";

test("an interview discloses, calls Anthropic directly, and persists locally", async ({ page }) => {
  const external = trackExternalRequests(page);
  const projectId = await createBlankMap(page);
  await useAnthropicKey(page, { remember: true, returnTo: `/project/#${projectId}` });
  const anthropic = await mockAnthropic(page, [
    "What are you building?",
    "A browser-local architecture map is a good fit.",
  ]);
  await page.goto(`/project/#${projectId}`);
  await openChat(page);

  await page.getByRole("button", { name: "Start interview" }).click();
  await expect(page.getByRole("dialog", { name: "Anthropic data disclosure" })).toBeVisible();
  expect(anthropic).toHaveLength(0);
  await page.getByRole("button", { name: "Continue to Anthropic" }).click();
  await expect(page.getByText("What are you building?")).toBeVisible();

  await page.getByRole("textbox", { name: /Ask about this architecture/ }).fill("Keep it private.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("A browser-local architecture map is a good fit.")).toBeVisible();
  expect(anthropic).toHaveLength(2);
  for (const request of anthropic) {
    expect(new URL(request.url).origin).toBe(ANTHROPIC_ORIGIN);
    expect(request.headers["x-api-key"]).toBe(TEST_ANTHROPIC_KEY);
    expect(request.body).not.toContain(TEST_ANTHROPIC_KEY);
    expect(request.url).not.toContain(TEST_ANTHROPIC_KEY);
  }
  expect(new Set(external.map((request) => new URL(request.url()).origin))).toEqual(
    new Set([ANTHROPIC_ORIGIN])
  );

  await page.reload();
  await openChat(page);
  await expect(page.getByText("Keep it private.")).toBeVisible();
  await expect(page.getByText("A browser-local architecture map is a good fit.")).toBeVisible();
});

test("repository evidence and AI generation have separate provider gates", async ({ page }) => {
  const external = trackExternalRequests(page);
  await page.goto("/project/new?mode=repository");
  await page.getByRole("textbox", { name: "Public GitHub repository" }).fill("acme/platform");
  await page.getByRole("button", { name: "Map repository" }).click();
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#.+/);
  const projectUrl = page.url();

  await useAnthropicKey(page, { remember: true, returnTo: projectUrl });
  const github = await mockGitHub(page);
  const anthropic = await mockAnthropic(page, [
    'Mapped.\n<stack>{"nodes":[{"id":"client","category":"client","subtype":"web-app","name":"Web Client","technology":"React","description":"Browser UI","reasoning":"Local boundary","locked":false}],"edges":[]}</stack>',
  ]);
  await page.goto(projectUrl);
  await openChat(page);
  await expect(page.getByPlaceholder("Ask about this architecture…")).toBeVisible();

  await page.getByRole("button", { name: "Review GitHub evidence" }).click();
  await expect(page.getByRole("dialog", { name: "GitHub data disclosure" })).toBeVisible();
  expect(github).toHaveLength(0);
  await page.getByRole("button", { name: "Continue to GitHub" }).click();
  await expect.poll(() => github.length).toBeGreaterThanOrEqual(5);
  expect(
    github.map((request) => {
      const url = new URL(request.url);
      return `${url.pathname}${url.search}`;
    })
  ).toEqual(
    expect.arrayContaining([
      "/repos/acme/platform",
      "/repos/acme/platform/languages",
      "/repos/acme/platform/commits/main",
      "/repos/acme/platform/git/trees/tree123?recursive=1",
      "/repos/acme/platform/readme?ref=main",
    ])
  );
  await expect(page.getByText("GitHub evidence is ready")).toBeVisible();
  expect(github.length).toBeGreaterThanOrEqual(5);
  expect(anthropic).toHaveLength(0);

  await page.getByRole("button", { name: "Generate map with Anthropic" }).click();
  await expect(page.getByRole("dialog", { name: "Anthropic data disclosure" })).toBeVisible();
  expect(anthropic).toHaveLength(0);
  await page.getByRole("button", { name: "Continue to Anthropic" }).click();
  await expect(page.getByText("Web Client").first()).toBeVisible();

  expect(new Set(external.map((request) => new URL(request.url()).origin))).toEqual(
    new Set([GITHUB_ORIGIN, ANTHROPIC_ORIGIN])
  );
  await page.reload();
  await expect(page.getByText("Web Client").first()).toBeVisible();
});
