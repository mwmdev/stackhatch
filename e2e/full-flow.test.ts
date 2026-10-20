import { expect, test } from "@playwright/test";
import {
  ANTHROPIC_ORIGIN,
  GITHUB_ORIGIN,
  TEST_ANTHROPIC_KEY,
  createBlankMap,
  mockAnthropic,
  mockGitHub,
  openChat,
  sendChatMessage,
  trackExternalRequests,
  useProviderKey,
} from "./helpers/sse-mock";

test("chat calls Anthropic directly from the browser and persists locally", async ({ page }) => {
  const external = trackExternalRequests(page);
  const projectId = await createBlankMap(page);
  await useProviderKey(page, { remember: true, returnTo: `/project/#${projectId}` });
  const anthropic = await mockAnthropic(page, [
    "What are you building?",
    "A browser-local architecture map is a good fit.",
  ]);
  await page.goto(`/project/#${projectId}`);
  await openChat(page);

  await sendChatMessage(page, "What should I build?");
  await expect(page.getByText("What are you building?")).toBeVisible();

  await sendChatMessage(page, "Keep it private.");
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

test("a repository becomes a map from one action, reading GitHub then Anthropic", async ({
  page,
}) => {
  const external = trackExternalRequests(page);
  await useProviderKey(page, { remember: true });
  const github = await mockGitHub(page);
  const anthropic = await mockAnthropic(page, [
    'Mapped.\n<stack>{"nodes":[{"id":"client","category":"client","subtype":"web-app","name":"Web Client","technology":"React","description":"Browser UI","reasoning":"Local boundary","locked":false}],"edges":[]}</stack>',
  ]);
  await page.goto("/project/new");
  await page.getByLabel("GitHub repository").fill("acme/platform");
  await page.getByRole("button", { name: "Map repository" }).click();
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#.+/);

  // With a key present the map is drawn on arrival: submitting the repository
  // was the action. No interview, no evidence review, no generate step.
  await expect(page.getByText("Web Client").first()).toBeVisible({ timeout: 20_000 });

  // Still two distinct, ordered network events against a bounded endpoint set.
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
  expect(anthropic).toHaveLength(1);
  expect(new Set(external.map((request) => new URL(request.url()).origin))).toEqual(
    new Set([GITHUB_ORIGIN, ANTHROPIC_ORIGIN])
  );

  await expect(page.getByText("Read from GitHub")).toHaveCount(0);
  await expect(page.getByTestId("project-provenance")).toHaveCount(0);

  await page.reload();
  await expect(page.getByText("Web Client").first()).toBeVisible();
  // A map that already has nodes must never regenerate itself on open.
  expect(anthropic).toHaveLength(1);
});

test("a slow Anthropic response still becomes the repository map", async ({ page }) => {
  // Real responses stream for many seconds. Saving the scan's commit changes the
  // editor's auto-start state mid-request, which must not cancel the request.
  await useProviderKey(page, { remember: true });
  await mockGitHub(page);
  const anthropic = await mockAnthropic(
    page,
    [
      'Mapped.\n<stack>{"nodes":[{"id":"client","category":"client","subtype":"web-app","name":"Web Client","technology":"React","description":"Browser UI","reasoning":"Local boundary","locked":false}],"edges":[]}</stack>',
    ],
    { delayMs: 3_000 }
  );
  await page.goto("/project/new");
  await page.getByLabel("GitHub repository").fill("acme/platform");
  await page.getByRole("button", { name: "Map repository" }).click();

  await expect(page.getByText("Web Client").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Anthropic could not complete the request")).toHaveCount(0);
  expect(anthropic).toHaveLength(1);
});

test("without a key the AI starts ask for one in place", async ({ page }) => {
  const external = trackExternalRequests(page);
  await page.goto("/project/new");
  const keyHeading = page.getByRole("heading", { name: "Connect an AI provider" });
  await expect(keyHeading).toBeVisible();
  await expect(page.getByLabel("GitHub repository")).toBeVisible();

  await page.getByLabel("GitHub repository").fill("acme/api");
  await page.getByRole("button", { name: "Map repository" }).click();
  await expect(page.getByText("Add an AI provider key to generate this map.")).toBeVisible();
  await expect(keyHeading).toBeFocused();

  await page.getByLabel("Anthropic API key").fill(TEST_ANTHROPIC_KEY);
  await page.getByRole("button", { name: "Use key" }).click();
  await expect(page.getByText("Anthropic key")).toBeVisible();
  await expect(page).toHaveURL(/\/project\/new$/);
  expect(external).toEqual([]);
});
