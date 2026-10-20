import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { VAULT_DATABASE_NAME, VAULT_STORE_NAMES } from "../src/lib/vault/schema";
import {
  GITHUB_ORIGIN,
  TEST_GITHUB_TOKEN,
  mockAnthropic,
  mockGitHub,
  readIndexedDbStore,
  trackExternalRequests,
  useProviderKey,
} from "./helpers/sse-mock";

const BILLING_MAP =
  'Mapped.\n<stack>{"nodes":[{"id":"api","category":"api","subtype":"rest-api","name":"Billing API","technology":"Hono","description":"Owns invoices","reasoning":"Inferred","locked":false}],"edges":[]}</stack>';

test("a private repository maps with a token added on the New map page", async ({ page }) => {
  const external = trackExternalRequests(page);
  await useProviderKey(page, { remember: true });
  const github = await mockGitHub(page);
  const anthropic = await mockAnthropic(page, [BILLING_MAP]);
  await page.goto("/project/new");

  await page.getByLabel("GitHub repository").fill("acme/billing");
  await page.getByRole("button", { name: "Private repository? Add a GitHub token" }).click();
  await expect(
    page.getByRole("link", { name: "Create a read-only token for acme" })
  ).toHaveAttribute("href", /contents=read/);
  await page.getByLabel("GitHub token").fill(TEST_GITHUB_TOKEN);
  await page.getByRole("button", { name: "Map repository" }).click();

  await expect(page.getByText("Billing API").first()).toBeVisible({ timeout: 20_000 });
  expect(anthropic).toHaveLength(1);
  expect(github.map((request) => new URL(request.url).pathname)).toEqual(
    expect.arrayContaining(["/repos/acme/billing", "/repos/acme/billing/commits/main"])
  );
  for (const request of github) {
    expect(request.headers.authorization).toBe(`Bearer ${TEST_GITHUB_TOKEN}`);
  }
  // The token goes to GitHub and nowhere else.
  for (const request of external) {
    if (new URL(request.url()).origin === GITHUB_ORIGIN) continue;
    expect(request.url()).not.toContain(TEST_GITHUB_TOKEN);
    expect(request.postData() ?? "").not.toContain(TEST_GITHUB_TOKEN);
    expect(Object.values(await request.allHeaders()).join("\n")).not.toContain(TEST_GITHUB_TOKEN);
  }
});

test("the Assistant asks for a token when a scan can't read the repository", async ({ page }) => {
  await useProviderKey(page, { remember: true });
  const github = await mockGitHub(page);
  const anthropic = await mockAnthropic(page, [BILLING_MAP]);
  await page.goto("/project/new");
  await page.getByLabel("GitHub repository").fill("acme/billing");
  await page.getByRole("button", { name: "Map repository" }).click();

  const assistant = page.getByRole("complementary", { name: "Assistant" });
  await expect(assistant.getByRole("alert")).toContainText("StackHatch can't read acme/billing.");
  expect(github[0]?.headers.authorization).toBeUndefined();
  expect(anthropic).toHaveLength(0);
  await expect(
    assistant.getByRole("link", { name: "Create a read-only token for acme" })
  ).toHaveAttribute("href", /target_name=acme/);

  await assistant.getByLabel("GitHub token").fill(TEST_GITHUB_TOKEN);
  await assistant.getByRole("button", { name: "Use token" }).click();

  await expect(page.getByText("Billing API").first()).toBeVisible({ timeout: 20_000 });
  expect(anthropic).toHaveLength(1);
  expect(github.at(-1)?.headers.authorization).toBe(`Bearer ${TEST_GITHUB_TOKEN}`);

  // The token stays out of everything stored, exported, sent to the AI, or shown.
  for (const store of VAULT_STORE_NAMES) {
    const records = await readIndexedDbStore(page, VAULT_DATABASE_NAME, store);
    expect(JSON.stringify(records)).not.toContain(TEST_GITHUB_TOKEN);
  }
  for (const request of anthropic) {
    expect(request.body).not.toContain(TEST_GITHUB_TOKEN);
    expect(JSON.stringify(request.headers)).not.toContain(TEST_GITHUB_TOKEN);
  }
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export map" }).click();
  await page.getByRole("button", { name: "Back up this map" }).click();
  const backupPath = await (await downloadPromise).path();
  const backup = await readFile(backupPath!, "utf8");
  expect(backup).toContain("acme/billing");
  expect(backup).not.toContain(TEST_GITHUB_TOKEN);
  await expect(page.locator("body")).not.toContainText(TEST_GITHUB_TOKEN);
});

test("a token set in Settings also authenticates public scans", async ({ page }) => {
  await useProviderKey(page, { remember: true });
  await page.goto("/settings#github-token");
  const row = page.getByRole("region", { name: "GitHub token" });
  await row.getByLabel("GitHub token").fill(TEST_GITHUB_TOKEN);
  await row.getByRole("button", { name: "Use token" }).click();
  await expect(row.getByTestId("github-token-status-session")).toBeVisible();

  const github = await mockGitHub(page);
  await mockAnthropic(page, [BILLING_MAP]);
  // Client-side navigation keeps the session-only token.
  await page.getByRole("link", { name: "New map" }).first().click();
  await page.getByLabel("GitHub repository").fill("acme/platform");
  await expect(page.getByRole("link", { name: "Change in Settings" })).toBeVisible();
  await page.getByRole("button", { name: "Map repository" }).click();

  await expect(page.getByText("Billing API").first()).toBeVisible({ timeout: 20_000 });
  expect(github.length).toBeGreaterThan(0);
  for (const request of github) {
    expect(request.headers.authorization).toBe(`Bearer ${TEST_GITHUB_TOKEN}`);
  }
});
