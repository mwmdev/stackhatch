import { beforeEach, describe, expect, it, vi } from "vitest";

interface AuthCallbacks {
  signIn(input: {
    account?: { provider: string } | null;
    profile?: {
      id?: string | number | null;
      email?: string | null;
      name?: string | null;
      avatar_url?: string | null;
    };
  }): Promise<boolean>;
  session(input: {
    session: { user: Record<string, unknown> };
    token: Record<string, unknown>;
  }): Promise<{ user: Record<string, unknown> }>;
}

const mocks = vi.hoisted(() => ({
  callbacks: null as AuthCallbacks | null,
  db: { name: "db" },
  runMigrations: vi.fn(),
  provisionUser: vi.fn(),
}));

vi.mock("next-auth", () => ({
  default: vi.fn((config: { callbacks: AuthCallbacks }) => {
    mocks.callbacks = config.callbacks;
    return {
      handlers: { GET: vi.fn(), POST: vi.fn() },
      auth: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
    };
  }),
}));

vi.mock("next-auth/providers/github", () => ({ default: vi.fn(() => ({ id: "github" })) }));
vi.mock("@/db", () => ({ getDb: () => mocks.db }));
vi.mock("@/db/migrate", () => ({ runMigrations: mocks.runMigrations }));
vi.mock("@/lib/user-provisioning", () => ({ provisionUser: mocks.provisionUser }));

await import("@/lib/auth-config");

describe("Auth.js account provisioning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("provisions GitHub identities through the atomic user/settings boundary", async () => {
    const result = await mocks.callbacks!.signIn({
      account: { provider: "github" },
      profile: {
        id: 12345,
        email: "user@example.com",
        name: "User One",
        avatar_url: "https://example.com/avatar.png",
      },
    });

    expect(result).toBe(true);
    expect(mocks.runMigrations).toHaveBeenCalledWith(mocks.db);
    expect(mocks.provisionUser).toHaveBeenCalledWith(mocks.db, {
      githubId: "12345",
      email: "user@example.com",
      name: "User One",
      avatarUrl: "https://example.com/avatar.png",
    });
  });

  it("does not provision unrelated providers", async () => {
    await expect(
      mocks.callbacks!.signIn({ account: { provider: "other" }, profile: { id: "subject" } })
    ).resolves.toBe(true);
    expect(mocks.provisionUser).not.toHaveBeenCalled();
  });

  it("materializes identity fields without a role", async () => {
    const session = await mocks.callbacks!.session({
      session: { user: { name: "User One" } },
      token: { githubId: "12345", userId: "user-1", role: "ignored-legacy-value" },
    });

    expect(session.user).toEqual({
      name: "User One",
      githubId: "12345",
      userId: "user-1",
    });
  });
});
