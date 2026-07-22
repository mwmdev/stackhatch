import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { userId: "user-1", githubId: "github-1" } as { userId: string; githubId: string } | null,
  devAuth: false,
  getDb: vi.fn(() => ({ name: "db" })),
  runMigrations: vi.fn(),
  deleteAccountById: vi.fn(() => ({
    userId: "user-1",
    deleted: true,
    counts: { users: 1, projects: 1, messages: 2, templates: 1, settings: 1, projectState: 1 },
  })),
  signOut: vi.fn(),
}));

vi.mock("@/db", () => ({ getDb: mocks.getDb }));
vi.mock("@/db/migrate", () => ({ runMigrations: mocks.runMigrations }));
vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn(() => Promise.resolve(mocks.user)),
  isDevelopmentAuthEnabled: vi.fn(() => mocks.devAuth),
}));
vi.mock("@/lib/account-deletion", () => ({ deleteAccountById: mocks.deleteAccountById }));
vi.mock("@/lib/auth-config", () => ({ signOut: mocks.signOut }));

const { POST } = await import("./route");

function request(
  body: BodyInit | null = JSON.stringify({ confirmation: "DELETE MY ACCOUNT" }),
  headers: HeadersInit = {}
) {
  return new Request("https://stackhatch.io/api/account/delete", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://stackhatch.io",
      host: "stackhatch.io",
      ...headers,
    },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { userId: "user-1", githubId: "github-1" };
  mocks.devAuth = false;
  mocks.deleteAccountById.mockReturnValue({
    userId: "user-1",
    deleted: true,
    counts: { users: 1, projects: 1, messages: 2, templates: 1, settings: 1, projectState: 1 },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/account/delete", () => {
  it.each([
    ["non-JSON content", request("DELETE MY ACCOUNT", { "content-type": "text/plain" })],
    ["missing origin", request(undefined, { origin: "" })],
    ["cross origin", request(undefined, { origin: "https://evil.example" })],
    ["sibling subdomain", request(undefined, { origin: "https://app.stackhatch.io" })],
    ["wrong host", request(undefined, { host: "other.stackhatch.io" })],
    ["invalid JSON", request("{")],
    [
      "extra field",
      request(JSON.stringify({ confirmation: "DELETE MY ACCOUNT", userId: "victim" })),
    ],
    ["missing phrase", request(JSON.stringify({}))],
    ["wrong field type", request(JSON.stringify({ confirmation: 42 }))],
    ["array body", request(JSON.stringify(["DELETE MY ACCOUNT"]))],
    ["null body", request("null")],
    ["wrong phrase", request(JSON.stringify({ confirmation: "delete my account" }))],
  ])("rejects %s without mutation", async (_label, invalidRequest) => {
    const response = await POST(invalidRequest);
    expect(response.status).toBe(400);
    expect(mocks.deleteAccountById).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("rejects development authentication", async () => {
    mocks.devAuth = true;
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(mocks.deleteAccountById).not.toHaveBeenCalled();
  });

  it.each(["unauthenticated", "orphaned"])("rejects an %s session", async () => {
    mocks.user = null;
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(mocks.deleteAccountById).not.toHaveBeenCalled();
  });

  it("deletes only the current database-backed identity and signs out after commit", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      committed: true,
      deleted: true,
      signedOut: true,
    });
    expect(mocks.runMigrations).toHaveBeenCalledWith({ name: "db" });
    expect(mocks.deleteAccountById).toHaveBeenCalledWith({ name: "db" }, "user-1");
    expect(mocks.signOut).toHaveBeenCalledWith({ redirect: false });
    expect(mocks.deleteAccountById.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.signOut.mock.invocationCallOrder[0]
    );
  });

  it("reports an honest committed outcome when cookie cleanup fails", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.signOut.mockRejectedValueOnce(new Error("cookie failure"));
    const response = await POST(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      committed: true,
      deleted: true,
      signedOut: false,
    });
    expect(warning).toHaveBeenCalledWith("stackhatch.account_deletion.sign_out_failed", {
      userId: "user-1",
      phase: "post_commit",
      errorClass: "Error",
    });
    expect(JSON.stringify(warning.mock.calls)).not.toContain("cookie failure");
    expect(JSON.stringify(warning.mock.calls)).not.toContain("DELETE MY ACCOUNT");
  });

  it("does not sign out or claim a commit when deletion fails", async () => {
    const failure = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.deleteAccountById.mockImplementationOnce(() => {
      throw new Error("database busy");
    });
    const response = await POST(request());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Account deletion failed" });
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalledWith("stackhatch.account_deletion.transaction_failed", {
      userId: "user-1",
      phase: "transaction",
      errorClass: "Error",
    });
    expect(JSON.stringify(failure.mock.calls)).not.toContain("database busy");
    expect(JSON.stringify(failure.mock.calls)).not.toContain("DELETE MY ACCOUNT");
  });
});
