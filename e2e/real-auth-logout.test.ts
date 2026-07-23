import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { createTestDb } from "../src/db";
import { runMigrations } from "../src/db/migrate";
import { users } from "../src/db/schema";

const SESSION_COOKIE = "authjs.session-token";
const AUTH_SECRET = process.env.NEXTAUTH_SECRET || "test-secret";
const USER = {
  id: "real-auth-smoke-user",
  githubId: "real-auth-smoke-github",
  email: "real-auth-smoke@stackhatch.local",
  name: "Real Auth Smoke",
};

const smokeCanvas = {
  nodes: [
    {
      id: "auth-proof-node",
      category: "client",
      subtype: "web-app",
      name: "Auth Proof Client",
      technology: "Next.js",
      description: "Makes a dirty editor revision visible.",
      reasoning: "Exercises save-before-sign-out with real Auth.js.",
      locked: false,
    },
  ],
  edges: [],
  positions: { "auth-proof-node": { x: 120, y: 120 } },
  alternatives: {},
};

test.describe("non-development-auth logout smoke", () => {
  test.skip(
    process.env.REAL_AUTH_SMOKE !== "1",
    "Run with npm run test:e2e:real-auth to exercise real Auth.js cookies."
  );

  test.beforeAll(() => {
    const databaseUrl = process.env.E2E_DATABASE_URL;
    if (!databaseUrl) throw new Error("E2E_DATABASE_URL is required for the real-auth smoke");
    const db = createTestDb(databaseUrl.replace(/^file:/, ""));
    runMigrations(db);
    db.insert(users)
      .values({
        ...USER,
        avatarUrl: null,
        createdAt: Date.now(),
      })
      .onConflictDoNothing()
      .run();
  });

  async function authenticate(context: BrowserContext, page: Page) {
    const value = await encode({
      secret: AUTH_SECRET,
      salt: SESSION_COOKIE,
      token: {
        sub: USER.id,
        userId: USER.id,
        githubId: USER.githubId,
        email: USER.email,
        name: USER.name,
      },
    });
    await context.addCookies([
      {
        name: SESSION_COOKIE,
        value,
        url: new URL(page.url() || "http://localhost:3099").origin,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  }

  async function expectSessionInvalidated(context: BrowserContext, page: Page) {
    await expect
      .poll(async () => (await context.cookies()).some((cookie) => cookie.name === SESSION_COOKIE))
      .toBe(false);
    await page.goto("/app/maps");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fapp%2Fmaps$/);
  }

  test("clean shared-page sign-out clears the cookie and protects app routes", async ({
    context,
    page,
  }) => {
    await page.goto("/");
    await authenticate(context, page);
    await page.goto("/app/maps");
    await expect(page.getByRole("heading", { level: 1, name: "All Maps" })).toBeVisible();

    await page.getByRole("button", { name: "Account", exact: true }).click();
    await page.getByTestId("account-popover").getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expectSessionInvalidated(context, page);
  });

  test("dirty editor sign-out saves, clears the cookie, and protects app routes", async ({
    context,
    page,
  }) => {
    await page.goto("/");
    await authenticate(context, page);
    const projectResponse = await page.request.post("/api/projects", {
      data: {
        name: `Real auth dirty editor ${Date.now()}`,
        canvasState: JSON.stringify(smokeCanvas),
      },
    });
    expect(projectResponse.status()).toBe(201);
    const project = (await projectResponse.json()) as { id: string };
    await page.route(`**/api/projects/${project.id}/messages`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "real-auth-ready-message",
            role: "assistant",
            content: "The architecture is ready.",
            createdAt: Date.now(),
          },
        ]),
      });
    });

    await page.goto(`/project/${project.id}`);
    await page.getByTestId("stack-node-auth-proof-node").click();
    await page.getByLabel("Node name").fill("Saved before real sign-out");
    await page.getByRole("button", { name: "Account", exact: true }).click();
    await page.getByTestId("account-popover").getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$/);

    const databaseUrl = process.env.E2E_DATABASE_URL;
    if (!databaseUrl) throw new Error("E2E_DATABASE_URL is required for the real-auth smoke");
    const db = createTestDb(databaseUrl.replace(/^file:/, ""));
    await expect
      .poll(() => {
        const row = db.$client
          .prepare("SELECT canvas_state AS canvasState FROM projects WHERE id = ?")
          .get(project.id) as { canvasState: string } | undefined;
        return row ? JSON.parse(row.canvasState).nodes[0]?.name : null;
      })
      .toBe("Saved before real sign-out");
    await expectSessionInvalidated(context, page);
  });
});
