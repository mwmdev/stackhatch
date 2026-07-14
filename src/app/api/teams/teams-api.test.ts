import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { teamInvites, teamMembers, teams, users } from "@/db/schema";
import type { AppDatabase } from "@/db";

let testDb: AppDatabase;
let mockAuthenticatedUserId = "owner-id";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY NOT NULL,
      github_id TEXT NOT NULL UNIQUE,
      email TEXT,
      name TEXT,
      avatar_url TEXT,
      role TEXT DEFAULT 'user' NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE teams (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE team_members (
      team_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      joined_at INTEGER NOT NULL,
      PRIMARY KEY(team_id, user_id),
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE team_invites (
      id TEXT PRIMARY KEY NOT NULL,
      team_id TEXT NOT NULL,
      email TEXT NOT NULL,
      invited_by TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      status TEXT DEFAULT 'pending' NOT NULL,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  return drizzle(sqlite, { schema });
}

vi.mock("@/db", () => ({
  getDb: () => testDb,
}));

vi.mock("@/db/migrate", () => ({
  runMigrations: () => {},
}));

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn(() =>
    Promise.resolve({
      userId: "owner-id",
      role: "user",
      name: "Owner",
      email: "owner@example.com",
      image: null,
    })
  ),
  getAuthenticatedUserId: vi.fn(() => Promise.resolve(mockAuthenticatedUserId)),
}));

const teamsRoute = await import("@/app/api/teams/route");
const invitesRoute = await import("@/app/api/teams/[id]/invites/route");
const inviteAcceptanceRoute = await import("@/app/api/invites/[token]/route");

function request(path: string, body: unknown) {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  testDb = createTestDb();
  mockAuthenticatedUserId = "owner-id";
  testDb
    .insert(users)
    .values({
      id: "owner-id",
      githubId: "github-owner",
      email: "owner@example.com",
      name: "Owner",
      avatarUrl: null,
      role: "user",
      createdAt: Date.now(),
    })
    .run();
});

describe("POST /api/teams", () => {
  it("creates the team and owner membership directly", async () => {
    const response = await teamsRoute.POST(request("/api/teams", { name: "Builders" }) as never);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      id: expect.any(String),
      name: "Builders",
      ownerId: "owner-id",
      createdAt: expect.any(Number),
    });
    expect(body).not.toHaveProperty("plan");
    expect(body).not.toHaveProperty("stripeSubscriptionId");

    expect(testDb.select().from(teams).all()).toHaveLength(1);
    expect(
      testDb
        .select()
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, body.id), eq(teamMembers.userId, "owner-id")))
        .get()
    ).toEqual(expect.objectContaining({ role: "owner" }));
  });

  it("lists teams without commercial fields", async () => {
    await teamsRoute.POST(request("/api/teams", { name: "Builders" }) as never);

    const response = await teamsRoute.GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]).toEqual(expect.objectContaining({ name: "Builders", ownerId: "owner-id" }));
    expect(body[0]).not.toHaveProperty("plan");
    expect(body[0]).not.toHaveProperty("stripeSubscriptionId");
  });
});

describe("POST /api/teams/[id]/invites", () => {
  it("allows invites regardless of current member count", async () => {
    const teamResponse = await teamsRoute.POST(
      request("/api/teams", { name: "Large Team" }) as never
    );
    const team = await teamResponse.json();

    for (let index = 0; index < 20; index += 1) {
      const userId = `member-${index}`;
      testDb
        .insert(users)
        .values({
          id: userId,
          githubId: `github-${userId}`,
          email: `${userId}@example.com`,
          name: userId,
          avatarUrl: null,
          role: "user",
          createdAt: Date.now(),
        })
        .run();
      testDb
        .insert(teamMembers)
        .values({
          teamId: team.id,
          userId,
          role: "member",
          joinedAt: Date.now(),
        })
        .run();
    }

    const response = await invitesRoute.POST(
      request(`/api/teams/${team.id}/invites`, { email: "new@example.com" }) as never,
      { params: Promise.resolve({ id: team.id }) }
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.email).toBe("new@example.com");
    expect(body.inviteUrl).toMatch(/^http:\/\/localhost:3000\/invite\/[a-f0-9]{64}$/);
    expect(testDb.select().from(teamInvites).all()).toHaveLength(1);

    const listResponse = await invitesRoute.GET(
      new Request(`http://localhost:3000/api/teams/${team.id}/invites`) as never,
      { params: Promise.resolve({ id: team.id }) }
    );
    const pendingInvites = await listResponse.json();
    expect(pendingInvites).toEqual([
      expect.objectContaining({
        email: "new@example.com",
        inviteUrl: body.inviteUrl,
      }),
    ]);
  });

  it("adds a distinct invited user as a member", async () => {
    const teamResponse = await teamsRoute.POST(
      request("/api/teams", { name: "Shared Team" }) as never
    );
    const team = await teamResponse.json();
    const inviteResponse = await invitesRoute.POST(
      request(`/api/teams/${team.id}/invites`, { email: "member@example.com" }) as never,
      { params: Promise.resolve({ id: team.id }) }
    );
    expect(inviteResponse.status).toBe(201);

    testDb
      .insert(users)
      .values({
        id: "invited-user-id",
        githubId: "github-invited-user",
        email: "member@example.com",
        name: "Invited User",
        avatarUrl: null,
        role: "user",
        createdAt: Date.now(),
      })
      .run();
    mockAuthenticatedUserId = "invited-user-id";
    const token = testDb.select().from(teamInvites).get()!.token;

    const response = await inviteAcceptanceRoute.POST(
      new Request(`http://localhost:3000/api/invites/${token}`, { method: "POST" }) as never,
      { params: Promise.resolve({ token }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, teamId: team.id });
    expect(
      testDb
        .select()
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, "invited-user-id")))
        .get()
    ).toEqual(expect.objectContaining({ role: "member" }));
    expect(testDb.select().from(teamInvites).get()?.status).toBe("accepted");
  });
});
