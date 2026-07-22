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
  jwt(input: {
    token: Record<string, unknown>;
    account?: { provider: string } | null;
    profile?: { id?: string | number | null };
  }): Promise<Record<string, unknown>>;
  session(input: {
    session: { user: Record<string, unknown> };
    token: Record<string, unknown>;
  }): Promise<{ user: Record<string, unknown> }>;
}

const mocks = vi.hoisted(() => ({
  callbacks: null as AuthCallbacks | null,
  selectedUser: undefined as { id: string; githubId: string } | undefined,
  databaseFailure: false,
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          get: vi.fn(() => {
            if (mocks.databaseFailure) throw new Error("database unavailable");
            return mocks.selectedUser;
          }),
        })),
      })),
    })),
  },
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
    mocks.selectedUser = undefined;
    mocks.databaseFailure = false;
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

  it("materializes only a previously database-validated identity", async () => {
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

  it("retains a token only when both signed identifiers match one current row", async () => {
    mocks.selectedUser = { id: "user-1", githubId: "12345" };
    const token = await mocks.callbacks!.jwt({
      token: { userId: "user-1", githubId: "12345", name: "User One" },
    });
    expect(token).toMatchObject({ userId: "user-1", githubId: "12345" });
  });

  it("does not rebind a stale JWT to a freshly registered account with the same GitHub ID", async () => {
    mocks.selectedUser = { id: "replacement-user", githubId: "12345" };
    const token = await mocks.callbacks!.jwt({
      token: { userId: "deleted-user", githubId: "12345", name: "Cached Name" },
    });
    expect(token).not.toHaveProperty("userId");
    expect(token).not.toHaveProperty("githubId");
    expect(token).not.toHaveProperty("name");
  });

  it.each(["orphaned identity", "database failure"])(
    "clears cached identity and PII for an %s",
    async (scenario) => {
      mocks.databaseFailure = scenario === "database failure";
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      const token = await mocks.callbacks!.jwt({
        token: {
          userId: "deleted-user",
          githubId: "12345",
          name: "Cached Name",
          email: "cached@example.com",
          picture: "https://example.com/cached.png",
        },
      });
      expect(token).not.toHaveProperty("userId");
      expect(token).not.toHaveProperty("githubId");
      expect(token).not.toHaveProperty("name");
      expect(token).not.toHaveProperty("email");
      expect(token).not.toHaveProperty("picture");
      consoleError.mockRestore();
    }
  );

  it("suppresses session.user when validated identity fields are absent", async () => {
    const session = await mocks.callbacks!.session({
      session: { user: { name: "Cached Name", email: "cached@example.com" } },
      token: {},
    });
    expect(session).not.toHaveProperty("user");
  });
});
