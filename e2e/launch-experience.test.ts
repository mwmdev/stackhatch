import { expect, test } from "@playwright/test";

test("the landing page accurately explains the working product and trust boundary", async ({
  page,
}) => {
  await page.goto("/");

  const hero = page.locator('[data-landing-region="hero"]');
  await expect(hero).toContainText("GitHub repository");
  await expect(hero).toContainText("Markdown brief");
  await expect(hero).toContainText("editable architecture map");
  const privacy = page.locator('[data-landing-region="privacy"]');
  for (const provider of ["Anthropic", "OpenAI", "Google Gemini", "OpenRouter"]) {
    await expect(privacy).toContainText(provider);
  }

  await expect(page.getByRole("heading", { name: "Your key, direct", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open source", exact: true })).toBeVisible();

  const slot = page.getByTestId("hero-proof");
  await expect(slot).toBeVisible();

  // The tour waits for the visitor, then really plays and carries English captions.
  const tour = slot.getByLabel("StackHatch in two minutes");
  await expect(tour).not.toHaveAttribute("controls");
  expect(await tour.evaluate((video: HTMLVideoElement) => video.paused)).toBe(true);
  await slot.getByRole("button", { name: /Watch the tour/ }).click();
  await expect(tour).toHaveAttribute("controls");
  await expect(tour).toBeFocused();
  await expect
    .poll(() => tour.evaluate((video: HTMLVideoElement) => video.currentTime), { timeout: 15000 })
    .toBeGreaterThan(0.5);
  await expect
    .poll(
      () =>
        tour.evaluate((video: HTMLVideoElement) => {
          const captions = video.textTracks[0];
          captions.mode = "hidden";
          return captions.cues?.length ?? 0;
        }),
      { timeout: 15000 }
    )
    .toBeGreaterThan(20);
  await tour.evaluate((video: HTMLVideoElement) => video.pause());

  await hero.getByRole("textbox", { name: "GitHub repository" }).fill("umami-software/umami");
  await hero.getByRole("button", { name: "Map repository" }).click();
  await expect(page).toHaveURL(/\/project\/new\?mode=repository#repo=umami-software%2Fumami$/);
  // Without a key the start asks for one first; the repository waits in the address.
  await page.getByRole("textbox", { name: "Anthropic API key" }).fill(`sk-ant-${"x".repeat(40)}`);
  await page.getByRole("button", { name: "Use key" }).click();
  await expect(page.getByRole("textbox", { name: "Repository" })).toHaveValue(
    "umami-software/umami"
  );
  await page.goBack();
  await expect(hero.getByRole("link", { name: "Start a blank map" })).toBeVisible();
  for (const link of await page
    .getByRole("main")
    .getByRole("link", { name: "Start a map" })
    .all()) {
    await expect(link).toHaveAttribute("href", "/project/new");
  }

  // The blank start skips the chooser and opens an empty map.
  await hero.getByRole("link", { name: "Start a blank map" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Untitled map" })).toBeVisible();
  expect(new URL(page.url()).hash).toMatch(/^#.+/);
});

test("help, privacy, and terms agree on a community-supported local-first app", async ({
  page,
}) => {
  await page.goto("/support");
  await expect(page.getByRole("heading", { level: 1, name: "Help" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Get help" })).toBeVisible();

  await page.goto("/privacy");
  await expect(page.getByText(/no user accounts, product analytics/)).toBeVisible();
  await expect(page.getByText(/contacts no provider while you edit a blank map/)).toBeVisible();

  await page.goto("/terms");
  await expect(
    page.getByText(/browser connects directly to GitHub or your chosen AI provider/)
  ).toBeVisible();
});
