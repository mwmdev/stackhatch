import { expect, test } from "@playwright/test";
import { openChat, readIndexedDbStore, trackExternalRequests } from "./helpers/sse-mock";

test.describe("local project starts", () => {
  test("the chooser exposes all four starts and remains usable at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/project/new");

    await expect(page.getByRole("heading", { level: 1, name: "Start a new map" })).toBeVisible();
    for (const name of [/Blank map/, /Requirements file/, /Public repository/, /Template/]) {
      await expect(page.getByRole("button", { name })).toBeVisible();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      )
    ).toBe(false);
  });

  test("a requirements file becomes a local map without contacting a provider", async ({
    page,
  }) => {
    const external = trackExternalRequests(page);
    await page.goto("/project/new?mode=requirements");
    await page.getByLabel("Choose .md or .txt file").setInputFiles({
      name: "platform.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Platform map\n\nKeep the service boundary visible."),
    });

    await expect.poll(() => new URL(page.url()).hash).toMatch(/^#.+/);
    await expect(page.getByRole("heading", { level: 1, name: "Platform map" })).toBeVisible();
    expect(external).toEqual([]);
  });

  test("a repository start is normalized and staged locally before any provider action", async ({
    page,
  }) => {
    const external = trackExternalRequests(page);
    await page.goto("/project/new?mode=repository");
    await page
      .getByRole("textbox", { name: "Public GitHub repository" })
      .fill("https://github.com/acme/platform.git");
    await page.getByRole("button", { name: "Map repository" }).click();

    await expect.poll(() => new URL(page.url()).hash).toMatch(/^#.+/);
    await expect(page.getByRole("heading", { level: 1, name: "platform" })).toBeVisible();
    await openChat(page);
    await expect(page.getByRole("button", { name: "Review GitHub evidence" })).toBeVisible();
    const projects = await readIndexedDbStore<{ repoUrl: string }>(
      page,
      "stackhatch-vault",
      "projects"
    );
    expect(projects[0]?.repoUrl).toBe("https://github.com/acme/platform");
    expect(external).toEqual([]);
  });

  test("a built-in template creates an independent local canvas", async ({ page }) => {
    const external = trackExternalRequests(page);
    await page.goto("/project/new");
    await page.getByRole("button", { name: /Template/ }).click();
    await page.getByRole("button", { name: /Web app foundation/ }).click();

    await expect.poll(() => new URL(page.url()).hash).toMatch(/^#.+/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Web app foundation – Copy" })
    ).toBeVisible();
    await expect(page.locator(".react-flow__node").first()).toBeVisible();
    expect(external).toEqual([]);
  });
});
