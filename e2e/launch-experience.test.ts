import { expect, test } from "@playwright/test";

test("the landing page accurately explains the working product and trust boundary", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText(/repositories and requirements into interactive architecture maps/)
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Direct BYOK, only when you ask." })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open source on GitHub." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "From source to a living map." })).toBeVisible();

  const screenshot = page.getByRole("img", {
    name: /Synthetic Customer Portal reference architecture/,
  });
  await expect(screenshot).toBeVisible();
  await expect(screenshot).toHaveAttribute("src", "/screenshots/architecture-overview.webp");
});

test("help, privacy, and terms agree on a community-supported local-first app", async ({
  page,
}) => {
  await page.goto("/support");
  await expect(
    page.getByRole("heading", { name: "Keep your map private, portable, and understandable." })
  ).toBeVisible();
  await expect(page.getByText(/project is community-supported/)).toBeVisible();

  await page.goto("/privacy");
  await expect(page.getByText(/no user accounts, product analytics/)).toBeVisible();
  await expect(page.getByText(/contacts no provider while you edit a blank map/)).toBeVisible();

  await page.goto("/terms");
  await expect(page.getByText(/browser connects directly to GitHub or Anthropic/)).toBeVisible();
});
