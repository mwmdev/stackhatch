import { expect, test, type Page } from "@playwright/test";
import { VAULT_DATABASE_NAME, VAULT_STORE_NAMES } from "../src/lib/vault/schema";
import {
  ANTHROPIC_ORIGIN,
  GITHUB_ORIGIN,
  PLATFORM_FILES,
  TEST_ANTHROPIC_KEY,
  TEST_GITHUB_TOKEN,
  createBlankMap,
  mockAnthropic,
  mockGitHub,
  openChat,
  readIndexedDbStore,
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

const WEB_CLIENT_MAP =
  'Mapped.\n<stack>{"nodes":[{"id":"client","category":"client","subtype":"web-app","name":"Web Client","technology":"React","description":"Browser UI","reasoning":"Local boundary","locked":false}],"edges":[]}</stack>';

/** Opens the review dialog for a repository from the New map page. */
async function reviewRepository(page: Page, repository: string) {
  await page.goto("/project/new");
  await page.getByLabel("GitHub repository").fill(repository);
  await page.getByRole("button", { name: "Map repository" }).click();
  const dialog = page.getByTestId("source-review-dialog");
  await expect(dialog.getByRole("group", { name: "Folders" })).toBeVisible({ timeout: 30_000 });
  return dialog;
}

test("a repository becomes a map: choose folders, approve, one request to Anthropic", async ({
  page,
}) => {
  const external = trackExternalRequests(page);
  await useProviderKey(page, { remember: true });
  const github = await mockGitHub(page);
  const anthropic = await mockAnthropic(page, [WEB_CLIENT_MAP]);
  const dialog = await reviewRepository(page, "acme/platform");

  await expect(dialog.getByRole("checkbox", { name: /src\// })).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: /web\// })).toBeVisible();
  await expect(dialog.getByText("node_modules/", { exact: true })).toHaveCount(0);
  await expect(
    dialog.getByText("Reads 3 files from GitHub · 50 of 60 GitHub requests left this hour")
  ).toBeVisible();
  await dialog.getByRole("checkbox", { name: /web\// }).uncheck();
  await expect(dialog.getByText(/^Reads 2 files from GitHub/)).toBeVisible();
  // Reviewing reads the file list and the quota, never a file.
  expect(github.some((request) => request.url.includes("/git/blobs/"))).toBe(false);
  expect(anthropic).toHaveLength(0);

  await dialog.getByRole("button", { name: "Generate map" }).click();
  await expect(page.getByText("Web Client").first()).toBeVisible({ timeout: 20_000 });

  const paths = github.map((request) => new URL(request.url).pathname);
  expect(paths).toEqual(
    expect.arrayContaining([
      "/rate_limit",
      "/repos/acme/platform/git/blobs/readme",
      "/repos/acme/platform/git/blobs/server",
    ])
  );
  expect(paths).not.toContain("/repos/acme/platform/git/blobs/web");
  expect(paths).not.toContain("/repos/acme/platform/readme");
  expect(anthropic).toHaveLength(1);
  expect(anthropic[0].body).toContain(PLATFORM_FILES.server.text);
  expect(anthropic[0].body).toContain("Revision: main @ abc123def456");
  expect(new Set(external.map((request) => new URL(request.url()).origin))).toEqual(
    new Set([GITHUB_ORIGIN, ANTHROPIC_ORIGIN])
  );

  // Only the address, the commit and the unchecked folders are stored; the source never is.
  expect(await readIndexedDbStore(page, VAULT_DATABASE_NAME, "repositoryEvidence")).toEqual([]);
  const provenance = await readIndexedDbStore<{ excludedPaths: string[] }>(
    page,
    VAULT_DATABASE_NAME,
    "repositoryProvenance"
  );
  expect(provenance[0].excludedPaths).toEqual(["web"]);
  for (const store of VAULT_STORE_NAMES) {
    const records = await readIndexedDbStore(page, VAULT_DATABASE_NAME, store);
    expect(JSON.stringify(records)).not.toContain(PLATFORM_FILES.server.text);
  }
  await expect(page.getByText("Read from GitHub")).toHaveCount(0);
  await expect(page.getByTestId("project-provenance")).toHaveCount(0);

  await page.reload();
  await expect(page.getByText("Web Client").first()).toBeVisible();
  // A map that already has nodes must never regenerate itself on open.
  expect(anthropic).toHaveLength(1);
});

test("a slow Anthropic response still becomes the repository map", async ({ page }) => {
  // Real responses stream for many seconds; the request must survive the editor's state changes.
  await useProviderKey(page, { remember: true });
  await mockGitHub(page);
  const anthropic = await mockAnthropic(page, [WEB_CLIENT_MAP], { delayMs: 3_000 });
  const dialog = await reviewRepository(page, "acme/platform");
  await dialog.getByRole("button", { name: "Generate map" }).click();

  await expect(page.getByText("Web Client").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Anthropic could not complete the request")).toHaveCount(0);
  expect(anthropic).toHaveLength(1);
});

test("a selection over the GitHub quota is blocked until a token raises it", async ({ page }) => {
  await useProviderKey(page, { remember: true });
  await mockGitHub(page, { rateRemaining: 1 });
  const anthropic = await mockAnthropic(page, [WEB_CLIENT_MAP]);
  const dialog = await reviewRepository(page, "acme/platform");

  await expect(dialog.getByRole("alert")).toContainText(
    "This selection needs 3 GitHub requests, and 1 is left"
  );
  const generate = dialog.getByRole("button", { name: "Generate map" });
  await expect(generate).toBeDisabled();

  await dialog.getByLabel("GitHub token").fill(TEST_GITHUB_TOKEN);
  await dialog.getByRole("button", { name: "Use token" }).click();
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect(page.getByText("Web Client").first()).toBeVisible({ timeout: 20_000 });
  expect(anthropic).toHaveLength(1);
});

test("without a key the repository review asks for one in place", async ({ page }) => {
  await mockGitHub(page);
  const anthropic = await mockAnthropic(page, [WEB_CLIENT_MAP]);
  const dialog = await reviewRepository(page, "acme/api");
  const generate = dialog.getByRole("button", { name: "Generate map" });
  await expect(generate).toBeDisabled();

  await dialog.getByLabel("Anthropic API key").fill(TEST_ANTHROPIC_KEY);
  await dialog.getByRole("button", { name: "Use key" }).click();
  await expect(generate).toBeEnabled();
  expect(anthropic).toHaveLength(0);
});
