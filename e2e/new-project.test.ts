import { expect, test } from "@playwright/test";
import {
  mockAnthropic,
  mockGitHub,
  readIndexedDbStore,
  sendChatMessage,
  trackExternalRequests,
  useProviderKey,
} from "./helpers/sse-mock";

test.describe("local project starts", () => {
  test("the chooser exposes every start on one screen and remains usable at 320px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await useProviderKey(page, { remember: true });
    await page.goto("/project/new");

    await expect(page.getByRole("heading", { level: 1, name: "Start a new map" })).toBeVisible();
    await expect(page.locator("main h3")).toHaveText(["Blank canvas", "Requirements file"]);
    await expect(page.getByRole("button", { name: "Create blank map" })).toBeVisible();
    await expect(page.getByLabel("Choose .md or .txt file")).toBeAttached();
    await expect(page.getByLabel("GitHub repository")).toBeVisible();
    await expect(page.getByText("Start from a worked example")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Copy one of your saved maps instead" })
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      )
    ).toBe(false);
  });

  test("without a key every start is offered above key setup, and nothing is contacted", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const external = trackExternalRequests(page);
    await page.goto("/project/new");

    await expect(page.getByRole("heading", { name: "Connect an AI provider" })).toBeVisible();
    await expect(page.getByLabel("Anthropic API key")).toBeVisible();
    await expect(page.getByText("Choose .md or .txt file")).toBeVisible();
    await expect(page.getByLabel("GitHub repository")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create blank map" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      )
    ).toBe(false);
    expect(await readIndexedDbStore(page, "stackhatch-vault", "projects")).toEqual([]);
    expect(external).toEqual([]);
  });

  test("an oversized requirements file is rejected without storage or egress", async ({ page }) => {
    await useProviderKey(page, { remember: true });
    const external = trackExternalRequests(page);
    await page.goto("/project/new");
    await page.getByLabel("Choose .md or .txt file").setInputFiles({
      name: "oversized.md",
      mimeType: "text/markdown",
      buffer: Buffer.alloc(1_000_001, "x"),
    });

    await expect(page).toHaveURL(/\/project\/new$/);
    await expect(
      page.getByRole("region", { name: "Start a new map" }).getByRole("alert")
    ).toHaveText("The requirements file is too large. Choose a file no larger than 1 MB.");
    await expect
      .poll(async () => {
        try {
          return (await readIndexedDbStore(page, "stackhatch-vault", "projects")).length;
        } catch {
          return -1;
        }
      })
      .toBe(0);
    expect(external).toEqual([]);
  });

  test("a repository start is normalized after a key is supplied", async ({ page }) => {
    await useProviderKey(page, { remember: true });
    await mockGitHub(page);
    await mockAnthropic(page, ["Repository mapped."]);
    await page.goto("/project/new");
    await page.getByLabel("GitHub repository").fill("https://github.com/acme/platform.git");
    await page.getByRole("button", { name: "Map repository" }).click();

    await expect.poll(() => new URL(page.url()).hash).toMatch(/^#.+/);
    await expect(page.getByRole("heading", { level: 1, name: /platform/ })).toBeVisible();
    const projects = await readIndexedDbStore<{ repoUrl: string }>(
      page,
      "stackhatch-vault",
      "projects"
    );
    expect(projects[0]?.repoUrl).toBe("https://github.com/acme/platform");
  });

  test("a retired template URL falls back to the usable chooser", async ({ page }) => {
    const external = trackExternalRequests(page);
    await page.goto("/project/new?mode=template");

    await expect(page.getByRole("heading", { level: 1, name: "Start a new map" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Start from Template" })).toHaveCount(0);
    await page.getByRole("button", { name: "Create blank map" }).click();
    await expect.poll(() => new URL(page.url()).hash).toMatch(/^#.+/);
    await expect(page.getByRole("heading", { level: 1, name: /Untitled map/ })).toBeVisible();
    expect(external).toEqual([]);
  });
});

const GENERATED_STACK =
  'Mapped.\n<stack>{"nodes":[{"id":"api","category":"api","subtype":"rest-api","name":"Platform API","technology":"Hono","description":"Owns the platform boundary","reasoning":"Inferred","locked":false}],"edges":[]}</stack>';

test("requirements path drafts a map with no extra step", async ({ page }) => {
  await mockAnthropic(page, [GENERATED_STACK]);
  await useProviderKey(page, { remember: true });
  await page.goto("/project/new");
  await page.getByLabel("Choose .md or .txt file").setInputFiles({
    name: "orders.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Orders platform\n\nA REST orders API owns the order boundary."),
  });
  await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 30_000 });
  expect(await page.getByRole("dialog").count()).toBe(0);
});

test("blank path reaches a map from the composer alone", async ({ page }) => {
  await mockAnthropic(page, [GENERATED_STACK]);
  await useProviderKey(page, { remember: true });
  await page.goto("/project/new");
  await page.getByRole("button", { name: "Create blank map" }).click();
  await expect(page.getByRole("button", { name: "Ask the assistant" })).toBeVisible();
  await page.getByRole("button", { name: "Ask the assistant" }).click();
  await sendChatMessage(page, "A REST orders API with a database.");
  await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 30_000 });
  expect(await page.getByRole("dialog").count()).toBe(0);
});
