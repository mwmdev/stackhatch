import { expect, test } from "@playwright/test";
import { GITHUB_ORIGIN, mockAnthropic, sendChatMessage, useProviderKey } from "./helpers/sse-mock";

const CORS_HEADERS = {
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-origin": "*",
};
const base64 = (text: string) => Buffer.from(text).toString("base64");
const SERVER_TEXT = "export const server = listen(8080);";
const PACKAGE_TEXT = '{"name":"api"}';

const GITHUB_RESPONSES: Record<string, unknown> = {
  "/repos/acme/platform": {
    description: "Monorepo",
    language: "TypeScript",
    default_branch: "main",
  },
  "/repos/acme/platform/languages": { TypeScript: 900 },
  "/repos/acme/platform/commits/main": { sha: "abc123def456", commit: { tree: { sha: "root" } } },
  "/repos/acme/platform/git/trees/root": { tree: [{ path: "packages", type: "tree", sha: "pk" }] },
  "/repos/acme/platform/git/trees/pk": { tree: [{ path: "api", type: "tree", sha: "apitree" }] },
  "/repos/acme/platform/git/trees/apitree?recursive=1": {
    tree: [
      { path: "src", type: "tree", sha: "src" },
      { path: "src/server.ts", type: "blob", sha: "server", size: Buffer.byteLength(SERVER_TEXT) },
      { path: "package.json", type: "blob", sha: "pkg", size: Buffer.byteLength(PACKAGE_TEXT) },
    ],
  },
  "/rate_limit": { resources: { core: { limit: 60, remaining: 50, reset: 1794989321 } } },
  "/repos/acme/platform/git/blobs/pkg": { encoding: "base64", content: base64(PACKAGE_TEXT) },
  "/repos/acme/platform/git/blobs/server": { encoding: "base64", content: base64(SERVER_TEXT) },
  "/repos/acme/platform/contents/packages/api/src/server.ts?ref=abc123def456": {
    encoding: "base64",
    content: base64(SERVER_TEXT),
  },
};

const SOURCE_PATH = "packages/api/src/server.ts";
const MAP = `Mapped.\n<stack>${JSON.stringify({
  nodes: [
    {
      id: "api",
      category: "api",
      subtype: "rest-api",
      name: "API Server",
      technology: "Node.js",
      description: "HTTP API",
      reasoning: "Entry point",
      locked: false,
      // The second path is not in the scanned tree, so the app must drop it.
      evidence: [SOURCE_PATH, "packages/api/src/invented.ts"],
    },
  ],
  edges: [],
})}</stack>`;

test("a directory scan links nodes to files and attaches them to a chat question", async ({
  page,
}) => {
  await useProviderKey(page, { remember: true });
  const github: string[] = [];
  await page.route(`${GITHUB_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const key = `${url.pathname}${url.search}`;
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }
    github.push(key);
    const body = GITHUB_RESPONSES[key];
    await route.fulfill({
      status: body ? 200 : 404,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
      body: JSON.stringify(body ?? { message: "Not Found" }),
    });
  });
  const anthropic = await mockAnthropic(page, [MAP, "It listens on 8080, per the attached file."]);

  await page.goto("/project/new");
  await page
    .getByLabel("GitHub repository")
    .fill("https://github.com/acme/platform/tree/main/packages/api");
  await page.getByRole("button", { name: "Map repository" }).click();
  await page
    .getByTestId("source-review-dialog")
    .getByRole("button", { name: "Generate map" })
    .click();
  await expect(page.getByText("API Server").first()).toBeVisible({ timeout: 30_000 });

  // Only the directory's tree is read, and the model is told about the scope.
  expect(github).toContain("/repos/acme/platform/git/trees/apitree?recursive=1");
  expect(github).not.toContain("/repos/acme/platform/git/trees/root?recursive=1");
  expect(anthropic[0].body).toContain("Scanned directory: packages/api");

  await page.locator(".react-flow__node").first().click();
  const panel = page.getByTestId("node-detail-panel");
  const evidence = panel.getByRole("list", { name: "Evidence files" });
  await expect(evidence.getByRole("listitem")).toHaveCount(1);
  await expect(evidence.getByRole("link")).toHaveAttribute(
    "href",
    `https://github.com/acme/platform/blob/abc123def456/${SOURCE_PATH}`
  );

  // Opening the node reads nothing; the file is fetched only on request.
  expect(github.some((key) => key.includes("/contents/"))).toBe(false);
  await panel.getByRole("button", { name: "Ask about these files" }).click();
  await expect(page.getByTestId("chat-attachment-chip")).toHaveText(/API Server · 1 file/);
  expect(github.at(-1)).toBe(`/repos/acme/platform/contents/${SOURCE_PATH}?ref=abc123def456`);

  await sendChatMessage(page, "Which port does it listen on?");
  await expect(page.getByText("It listens on 8080")).toBeVisible();
  expect(anthropic[1].body).toContain("export const server = listen(8080);");
  await expect(page.getByTestId("chat-message-attachment")).toHaveText("API Server · 1 file");

  // Evidence survives a reload.
  await page.reload();
  await page.locator(".react-flow__node").first().click();
  await expect(
    page.getByTestId("node-detail-panel").getByRole("list", { name: "Evidence files" })
  ).toBeVisible();
});
