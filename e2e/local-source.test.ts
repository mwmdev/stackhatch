import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  DEEP_MARKER,
  SECRET_MARKER,
  fixtureFiles,
  node,
  openLocalReviewDialog,
  seedLocalFolder,
} from "./helpers/local-source";
import {
  mockAnthropic,
  openChat,
  readIndexedDbStore,
  sendChatMessage,
  trackExternalRequests,
  useProviderKey,
} from "./helpers/sse-mock";

const DATABASE = "stackhatch-vault";
const SOURCE_PATH = "src/lib/persist.ts";
const MAP = `Mapped.\n<stack>${JSON.stringify({
  nodes: [node("app", "client", "web-app", "Fixture App", [SOURCE_PATH, "src/invented.ts"])],
  edges: [],
})}</stack>`;
const REPLACEMENT = `Replaced.\n<stack>${JSON.stringify({
  nodes: [node("replacement", "client", "web-app", "Replacement App", [SOURCE_PATH])],
  edges: [],
})}</stack>`;

async function estimateTokens(dialog: Locator) {
  const text = await dialog.getByText(/^About [\d,]+ tokens ·/).innerText();
  return Number(text.match(/^About ([\d,]+) tokens/)![1].replaceAll(",", ""));
}

async function startMap(page: Page, outputs = [MAP]) {
  const requests = await mockAnthropic(page, outputs);
  const dialog = await openLocalReviewDialog(page);
  await dialog.getByRole("checkbox", { name: /engine\// }).uncheck();
  await dialog.getByRole("button", { name: "Generate map" }).click();
  await expect(page.getByText("Fixture App").first()).toBeVisible({ timeout: 30_000 });
  return requests;
}

test("reviews folders and sends one request without storing source text", async ({ page }) => {
  await useProviderKey(page, { remember: true });
  const requests = await mockAnthropic(page, [MAP]);
  const external = trackExternalRequests(page);
  const dialog = await openLocalReviewDialog(page, {
    files: [...fixtureFiles(), { path: "engine/extra.rs", text: "x".repeat(12_000) }],
  });
  for (const name of ["src/", "api/", "worker/", "engine/"]) {
    await expect(dialog.getByRole("checkbox", { name: new RegExp(name) })).toBeVisible();
  }
  await expect(dialog.getByText("node_modules/", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText(/^Skipped:/)).toBeVisible();
  expect(external).toEqual([]);
  const before = await estimateTokens(dialog);
  await dialog.getByRole("checkbox", { name: /engine\// }).uncheck();
  expect(await estimateTokens(dialog)).toBeLessThan(before);
  expect(external).toEqual([]);
  await dialog.getByRole("button", { name: "Generate map" }).click();
  await expect(page.getByText("Fixture App").first()).toBeVisible({ timeout: 30_000 });
  expect(requests).toHaveLength(1);
  expect(requests[0].body).toContain(DEEP_MARKER);
  expect(requests[0].body).not.toContain(SECRET_MARKER);
  expect(requests[0].body).not.toContain("engine/src/store.rs");
  for (const store of ["projects", "messages", "providerRuns"]) {
    const records = await readIndexedDbStore(page, DATABASE, store);
    expect(JSON.stringify(records)).not.toContain(DEEP_MARKER);
    if (store === "projects") {
      expect(records).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ localFolder: { name: "fixture", excludedPaths: ["engine"] } }),
        ])
      );
    }
  }
  await page.locator(".react-flow__node").first().click();
  const evidence = page
    .getByTestId("node-detail-panel")
    .getByRole("list", { name: "Evidence files" });
  await expect(evidence.getByRole("listitem")).toHaveCount(1);
  await expect(evidence).toContainText(SOURCE_PATH);
  await expect(evidence).not.toContainText("src/invented.ts");
  await expect(evidence.getByRole("link")).toHaveCount(0);
});

test("blocks a selection exceeding the model context window", async ({ page }) => {
  await useProviderKey(page, { remember: true });
  const dialog = await openLocalReviewDialog(page, {
    files: [...fixtureFiles(), { path: "src/large.ts", text: "x".repeat(760_000) }],
  });
  await dialog.getByLabel("Model", { exact: true }).selectOption({ label: "Claude Haiku 4.5" });
  await expect(dialog.getByRole("alert")).toContainText("accepts up to");
  await expect(dialog.getByRole("button", { name: "Generate map" })).toBeDisabled();
  await dialog.getByLabel("Model", { exact: true }).selectOption({ label: "Other model ID…" });
  await dialog.getByLabel("Model ID").fill("claude-haiku-4-5-20251001 ");
  await expect(dialog.getByRole("alert")).toContainText("accepts up to");
  await expect(dialog.getByRole("button", { name: "Generate map" })).toBeDisabled();
  await dialog.getByLabel("Model", { exact: true }).selectOption({ label: "Claude Sonnet 5" });
  await expect(dialog.getByRole("button", { name: "Generate map" })).toBeEnabled();
});

test("requires another review when files grow after the estimate", async ({ page }) => {
  await useProviderKey(page, { remember: true });
  const requests = await mockAnthropic(page, [MAP]);
  const dialog = await openLocalReviewDialog(page, {
    files: [...fixtureFiles(), { path: "src/live.ts", text: "export {};" }],
  });
  await dialog.getByLabel("Model", { exact: true }).selectOption({ label: "Claude Haiku 4.5" });
  await expect(dialog.getByRole("button", { name: "Generate map" })).toBeEnabled();
  await seedLocalFolder(page, "fixture", [{ path: "src/live.ts", text: "x".repeat(760_000) }]);
  await dialog.getByRole("button", { name: "Generate map" }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: "accepts up to" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Generate map" })).toBeDisabled();
  expect(requests).toHaveLength(0);
  await dialog.getByLabel("Model", { exact: true }).selectOption({ label: "Claude Sonnet 5" });
  await dialog.getByRole("button", { name: "Generate map" }).click();
  await expect(page.getByText("Fixture App").first()).toBeVisible({ timeout: 30_000 });
  expect(requests).toHaveLength(1);
});

test("cancelling review creates no project", async ({ page }) => {
  const dialog = await openLocalReviewDialog(page);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(await readIndexedDbStore(page, DATABASE, "projects")).toEqual([]);
});

test("re-scan after reload restores exclusions and replaces the map", async ({ page }) => {
  await useProviderKey(page, { remember: true });
  const requests = await startMap(page, [MAP, REPLACEMENT]);
  await page.reload();
  await page.getByTestId("rescan-folder-button").click();
  const dialog = page.getByTestId("source-review-dialog");
  await expect(dialog.getByRole("group", { name: "Folders" })).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: /engine\// })).not.toBeChecked();
  await expect(
    dialog.getByText("Replacing the map also replaces the existing Assistant conversation.")
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Replace map" }).click();
  await expect(page.getByText("Replacement App").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Fixture App")).toHaveCount(0);
  expect(requests).toHaveLength(2);
  expect(requests[1].body).not.toContain("engine/src/store.rs");
});

test("storage recovery does not replay generation or resurrect a removed attachment", async ({
  page,
}) => {
  await useProviderKey(page, { remember: true });
  const requests = await startMap(page, [MAP, "No generation repeated."]);
  await page.locator(".react-flow__node").first().click();
  await page
    .getByTestId("node-detail-panel")
    .getByRole("button", {
      name: "Ask about these files",
    })
    .click();
  await expect(page.getByTestId("chat-attachment-chip")).toBeVisible();
  await page.getByRole("button", { name: /^Remove Fixture App/ }).click();
  // Simulate a concurrent writer committing without notifying this editor.
  await page.evaluate(async () => {
    const projectId = decodeURIComponent(location.hash.slice(1));
    const opened = Promise.withResolvers<IDBDatabase>();
    const opening = indexedDB.open("stackhatch-vault");
    opening.onsuccess = () => opened.resolve(opening.result);
    opening.onerror = () => opened.reject(opening.error);
    const db = await opened.promise;
    try {
      const transaction = db.transaction("projects", "readwrite");
      const store = transaction.objectStore("projects");
      const request = store.get(projectId);
      request.onsuccess = () =>
        store.put({
          ...request.result,
          revision: request.result.revision + 1,
        });
      const completed = Promise.withResolvers<void>();
      transaction.oncomplete = () => completed.resolve();
      transaction.onabort = () => completed.reject(transaction.error);
      transaction.onerror = () => completed.reject(transaction.error);
      await completed.promise;
    } finally {
      db.close();
    }
  });
  await page.getByRole("textbox", { name: "Node name", exact: true }).fill("Unsaved edit");
  await page.getByRole("textbox", { name: "Node name", exact: true }).press("Tab");
  await page.getByRole("button", { name: "Reload stored map", exact: true }).click();
  await expect(page.locator(".react-flow__node").first()).toContainText("Fixture App");
  await openChat(page);
  await sendChatMessage(page, "Explain after reload");
  await expect(page.getByText("No generation repeated.")).toBeVisible();
  await expect(page.getByTestId("chat-attachment-chip")).toHaveCount(0);
  expect(requests).toHaveLength(2);
  expect(requests[1].body).toContain("Explain after reload");
  expect(requests[1].body).not.toContain(DEEP_MARKER);
});

test("attaches a node's local files to an assistant message", async ({ page }) => {
  await useProviderKey(page, { remember: true });
  const requests = await startMap(page, [MAP, "The source shows canvas persistence."]);
  await page.locator(".react-flow__node").first().click();
  await page
    .getByTestId("node-detail-panel")
    .getByRole("button", { name: "Ask about these files" })
    .click();
  await expect(page.getByTestId("chat-attachment-chip")).toHaveText(/Fixture App · 1 file/);
  await sendChatMessage(page, "Explain");
  await expect(page.getByText("The source shows canvas persistence.")).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1].body).toContain(DEEP_MARKER);
});

test("a cancelled replacement folder is not used for node evidence", async ({ page }) => {
  await useProviderKey(page, { remember: true });
  const requests = await startMap(page, [MAP, "Explained from the original folder."]);
  await seedLocalFolder(page, "wrong-folder", [{ path: SOURCE_PATH, text: "WRONG_FOLDER_MARKER" }]);
  await page.reload();
  await page.evaluate(() => {
    let calls = 0;
    window.showDirectoryPicker = async () => {
      calls++;
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle(calls === 1 ? "wrong-folder" : "fixture");
    };
  });
  await page.getByTestId("rescan-folder-button").click();
  const dialog = page.getByTestId("source-review-dialog");
  await expect(dialog.getByRole("group", { name: "Folders" })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await page.locator(".react-flow__node").first().click();
  await page
    .getByTestId("node-detail-panel")
    .getByRole("button", {
      name: "Ask about these files",
    })
    .click();
  await expect(page.getByTestId("chat-attachment-chip")).toHaveText(/Fixture App · 1 file/);
  await sendChatMessage(page, "Explain");
  await expect(page.getByText("Explained from the original folder.")).toBeVisible();
  expect(requests[1].body).toContain(DEEP_MARKER);
  expect(requests[1].body).not.toContain("WRONG_FOLDER_MARKER");
});

test("explains when local folders are unsupported", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showDirectoryPicker", { value: undefined, configurable: true });
  });
  await page.goto("/project/new");
  await expect(page.getByRole("button", { name: "Choose local folder" })).toBeDisabled();
  await expect(
    page.getByText("Needs a desktop Chromium browser, such as Chrome or Edge.")
  ).toBeVisible();
});

const RULES = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
for (const theme of ["light", "dark"] as const) {
  test(`the local folder dialog has no accessibility violations in ${theme} mode`, async ({
    page,
  }) => {
    await page.addInitScript((value) => window.localStorage.setItem("theme", value), theme);
    await useProviderKey(page, { remember: true });
    const dialog = await openLocalReviewDialog(page);
    await expect(dialog.getByRole("group", { name: "Folders" })).toBeVisible();
    const violations = (await new AxeBuilder({ page }).withTags(RULES).analyze()).violations.map(
      (violation) => ({
        id: violation.id,
        nodes: violation.nodes.map((target) => target.target.join(" ")),
      })
    );
    expect(violations).toEqual([]);
  });
}

test("review and retry reopens model selection before another local request", async ({ page }) => {
  await useProviderKey(page, { remember: true });
  const requests = await mockAnthropic(page, ["No architecture returned.", MAP]);
  const dialog = await openLocalReviewDialog(page);
  await dialog.getByRole("button", { name: "Generate map" }).click();
  await page.getByRole("button", { name: "Review and retry", exact: true }).click();
  await expect(dialog.getByLabel("Model", { exact: true })).toBeVisible();
  expect(requests).toHaveLength(1);
  await dialog.getByLabel("Model", { exact: true }).selectOption({ label: "Claude Opus 4.8" });
  await dialog.getByRole("button", { name: "Generate map" }).click();
  await expect(page.locator(".react-flow__node").first()).toContainText("Fixture App");
  expect(requests).toHaveLength(2);
  expect(JSON.parse(requests[1].body!).model).toBe("claude-opus-4-8");
});
