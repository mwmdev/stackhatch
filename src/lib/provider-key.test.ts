import "fake-indexeddb/auto";
import { openDB } from "idb";
import { afterEach, describe, expect, it } from "vitest";
import {
  createProviderKeyManager,
  deleteProviderCredentialDatabase,
  ProviderKeyUnavailableError,
} from "./provider-key";

const databaseNames = new Set<string>();

function manager(label: string) {
  const name = `stackhatch-provider-key-${label}-${crypto.randomUUID()}`;
  databaseNames.add(name);
  let sequence = 0;
  const generationFactory = () => `generation-${++sequence}`;
  return {
    name,
    create: () => createProviderKeyManager({ databaseName: name, generationFactory }),
  };
}

afterEach(async () => {
  await Promise.all([...databaseNames].map((name) => deleteProviderCredentialDatabase(name)));
  databaseNames.clear();
});

describe("provider key lifecycle", () => {
  it("keeps a session key in memory and does not restore it in a new manager", async () => {
    const fixture = manager("session");
    const first = fixture.create();
    await expect(first.getStatus("anthropic")).resolves.toMatchObject({ state: "absent" });

    await expect(first.useSessionKey("anthropic", "sk-ant-session")).resolves.toMatchObject({
      provider: "anthropic",
      state: "session",
    });
    await expect(first.getKeyForDispatch("anthropic")).resolves.toBe("sk-ant-session");
    first.close();

    const reopened = fixture.create();
    await expect(reopened.getStatus("anthropic")).resolves.toMatchObject({ state: "absent" });
    await expect(reopened.getKeyForDispatch("anthropic")).rejects.toMatchObject({
      name: "ProviderKeyUnavailableError",
      provider: "anthropic",
    });
    reopened.close();
  });

  it("restores an explicitly remembered key only after its transaction commits", async () => {
    const fixture = manager("remembered");
    const first = fixture.create();
    await expect(first.rememberKey("openai", "sk-proj-remembered")).resolves.toMatchObject({
      provider: "openai",
      state: "remembered",
    });
    first.close();

    const reopened = fixture.create();
    await expect(reopened.getStatus("openai")).resolves.toMatchObject({ state: "remembered" });
    await expect(reopened.getKeyForDispatch("openai")).resolves.toBe("sk-proj-remembered");
    reopened.close();
  });

  it("removes an older remembered key when the user switches to session-only", async () => {
    const fixture = manager("remembered-to-session");
    const first = fixture.create();
    const remembered = await first.rememberKey("anthropic", "sk-ant-remembered");
    const session = await first.useSessionKey("anthropic", "sk-ant-session");
    expect(session).toMatchObject({ state: "session" });
    expect(session.generation).not.toBe(remembered.generation);
    first.close();

    const reopened = fixture.create();
    await expect(reopened.getStatus("anthropic")).resolves.toMatchObject({ state: "absent" });
    await expect(reopened.getKeyForDispatch("anthropic")).rejects.toBeInstanceOf(
      ProviderKeyUnavailableError
    );
    reopened.close();
  });

  it("makes a forgotten generation authoritative for a suspended manager", async () => {
    const fixture = manager("forget");
    const first = fixture.create();
    const suspended = fixture.create();
    const before = await first.getStatus("gemini");
    await suspended.useSessionKey("gemini", "AIza-stale");

    const forgotten = await first.forgetKey("gemini");
    expect(forgotten).toMatchObject({ state: "absent" });
    expect(forgotten.generation).not.toBe(before.generation);
    await expect(suspended.getKeyForDispatch("gemini")).rejects.toBeInstanceOf(
      ProviderKeyUnavailableError
    );
    await expect(suspended.getStatus("gemini")).resolves.toMatchObject({ state: "absent" });

    first.close();
    suspended.close();
  });

  it("does not acknowledge remember or forget when the credential transaction fails", async () => {
    const fixture = manager("failure");
    const keyManager = fixture.create();
    await keyManager.useSessionKey("anthropic", "sk-ant-active");

    await expect(
      keyManager.rememberKey("anthropic", "sk-ant-replacement", {
        beforeCommit: () => {
          throw new DOMException("quota", "QuotaExceededError");
        },
      })
    ).rejects.toThrow();
    await expect(keyManager.getKeyForDispatch("anthropic")).resolves.toBe("sk-ant-active");

    await expect(
      keyManager.forgetKey("anthropic", {
        beforeCommit: () => {
          throw new DOMException("blocked", "AbortError");
        },
      })
    ).rejects.toThrow();
    await expect(keyManager.getKeyForDispatch("anthropic")).resolves.toBe("sk-ant-active");
    keyManager.close();
  });
});

describe("keys for several providers", () => {
  it("changing one provider's key leaves every other provider's key and generation alone", async () => {
    const fixture = manager("isolation");
    const tab = fixture.create();
    const otherTab = fixture.create();
    const anthropic = await otherTab.useSessionKey("anthropic", "sk-ant-session");
    await tab.rememberKey("openrouter", "sk-or-remembered");

    await tab.forgetKey("openrouter");
    await tab.useSessionKey("openai", "sk-proj-session");

    await expect(otherTab.getStatus("anthropic")).resolves.toEqual(anthropic);
    await expect(otherTab.getKeyForDispatch("anthropic")).resolves.toBe("sk-ant-session");
    await expect(otherTab.getStatus("openrouter")).resolves.toMatchObject({ state: "absent" });
    await expect(otherTab.getStatus("openai")).resolves.toMatchObject({ state: "absent" });
    tab.close();
    otherTab.close();
  });

  it("forgets every provider's session and remembered key for every manager", async () => {
    const fixture = manager("forget-all");
    const tab = fixture.create();
    const otherTab = fixture.create();
    await otherTab.useSessionKey("anthropic", "sk-ant-session");
    await otherTab.rememberKey("gemini", "AIza-remembered");
    await otherTab.rememberKey("github", "github_pat_remembered");

    await tab.forgetAllKeys();

    for (const provider of ["anthropic", "gemini", "github"] as const) {
      await expect(otherTab.getStatus(provider)).resolves.toMatchObject({ state: "absent" });
    }
    tab.close();
    otherTab.close();

    const reopened = fixture.create();
    await expect(reopened.getStatus("gemini")).resolves.toMatchObject({ state: "absent" });
    reopened.close();
    // Forgetting must delete the key material, not just orphan it under an old generation.
    const raw = await openDB(fixture.name, 2);
    await expect(raw.count("credentials")).resolves.toBe(0);
    raw.close();
  });

  it("keeps a session key set while a status read for that provider is in flight", async () => {
    const fixture = manager("concurrent-switch");
    const keyManager = fixture.create();
    await keyManager.rememberKey("openai", "sk-proj-old");

    const [session] = await Promise.all([
      keyManager.useSessionKey("openai", "sk-proj-new"),
      keyManager.getStatus("openai"),
    ]);

    expect(session).toMatchObject({ state: "session" });
    await expect(keyManager.getStatus("openai")).resolves.toMatchObject({ state: "session" });
    await expect(keyManager.getKeyForDispatch("openai")).resolves.toBe("sk-proj-new");
    keyManager.close();
    const raw = await openDB(fixture.name, 2);
    await expect(raw.get("credentials", "openai")).resolves.toBeUndefined();
    raw.close();
  });

  it("keeps an Anthropic key remembered before providers could be chosen", async () => {
    const fixture = manager("v1-upgrade");
    const legacy = await openDB(fixture.name, 1, {
      upgrade(database) {
        database.createObjectStore("meta", { keyPath: "id" });
        database.createObjectStore("credentials", { keyPath: "id" });
      },
    });
    await legacy.put("meta", { id: "credential-generation", generation: "v1", updatedAt: 1 });
    await legacy.put("credentials", {
      id: "anthropic",
      key: "sk-ant-from-v1",
      generation: "v1",
      updatedAt: 1,
    });
    legacy.close();

    const upgraded = fixture.create();
    await expect(upgraded.getStatus("anthropic")).resolves.toEqual({
      provider: "anthropic",
      state: "remembered",
      generation: "v1",
    });
    await expect(upgraded.getKeyForDispatch("anthropic")).resolves.toBe("sk-ant-from-v1");
    await expect(upgraded.getStatus("openai")).resolves.toMatchObject({ state: "absent" });
    await upgraded.useSessionKey("openai", "sk-proj-new");
    await expect(upgraded.getKeyForDispatch("anthropic")).resolves.toBe("sk-ant-from-v1");
    upgraded.close();
  });

  it("holds the GitHub token apart from every AI key", async () => {
    const fixture = manager("github-isolation");
    const tab = fixture.create();
    const otherTab = fixture.create();
    const anthropic = await tab.rememberKey("anthropic", "sk-ant-remembered");
    const github = await otherTab.rememberKey("github", "github_pat_remembered");

    await tab.forgetKey("anthropic");
    await expect(otherTab.getStatus("github")).resolves.toEqual(github);
    await expect(otherTab.getKeyForDispatch("github")).resolves.toBe("github_pat_remembered");

    await tab.useSessionKey("anthropic", "sk-ant-session");
    const anthropicNow = await tab.getStatus("anthropic");
    await otherTab.forgetKey("github");
    await expect(tab.getStatus("anthropic")).resolves.toEqual(anthropicNow);
    await expect(tab.getKeyForDispatch("anthropic")).resolves.toBe("sk-ant-session");
    await expect(tab.getKeyForDispatch("github")).rejects.toBeInstanceOf(
      ProviderKeyUnavailableError
    );
    expect(anthropic.generation).not.toBe(github.generation);
    tab.close();
    otherTab.close();
  });

  it("opens a store written before the GitHub token, which an older build can still open", async () => {
    const fixture = manager("before-github");
    const earlier = await openDB(fixture.name, 2, {
      upgrade(database) {
        database.createObjectStore("meta", { keyPath: "id" });
        database.createObjectStore("credentials", { keyPath: "id" });
      },
    });
    for (const id of [
      "credential-generation",
      "credential-generation:openai",
      "credential-generation:gemini",
      "credential-generation:openrouter",
    ]) {
      await earlier.put("meta", { id, generation: `${id}-v2`, updatedAt: 1 });
    }
    await earlier.put("credentials", {
      id: "anthropic",
      key: "sk-ant-from-v2",
      generation: "credential-generation-v2",
      updatedAt: 1,
    });
    earlier.close();

    const current = fixture.create();
    await expect(current.getStatus("github")).resolves.toMatchObject({ state: "absent" });
    await current.rememberKey("github", "github_pat_new");
    await expect(current.getKeyForDispatch("anthropic")).resolves.toBe("sk-ant-from-v2");
    await expect(current.getKeyForDispatch("github")).resolves.toBe("github_pat_new");
    current.close();

    // A build from before the GitHub token opens the store at the version it knows.
    const older = await openDB(fixture.name, 2);
    await expect(older.get("credentials", "anthropic")).resolves.toMatchObject({
      key: "sk-ant-from-v2",
    });
    older.close();
  });
});
