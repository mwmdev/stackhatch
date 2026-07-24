import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createProviderKeyManager,
  deleteProviderCredentialDatabase,
  ProviderKeyUnavailableError,
} from "./provider-key";

const databaseNames = new Set<string>();

function manager(label: string, generations = ["credential-generation"]) {
  const name = `stackhatch-provider-key-${label}-${crypto.randomUUID()}`;
  databaseNames.add(name);
  const generationFactory = vi.fn(() => generations.shift() ?? crypto.randomUUID());
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
    await expect(first.initialize()).resolves.toMatchObject({ state: "absent" });

    await expect(first.useSessionKey("sk-ant-session")).resolves.toMatchObject({
      state: "session",
    });
    await expect(first.getKeyForDispatch()).resolves.toBe("sk-ant-session");
    first.close();

    const reopened = fixture.create();
    await expect(reopened.initialize()).resolves.toMatchObject({ state: "absent" });
    await expect(reopened.getKeyForDispatch()).rejects.toBeInstanceOf(ProviderKeyUnavailableError);
    reopened.close();
  });

  it("restores an explicitly remembered key only after its transaction commits", async () => {
    const fixture = manager("remembered");
    const first = fixture.create();
    await first.initialize();
    await expect(first.rememberKey("sk-ant-remembered")).resolves.toMatchObject({
      state: "remembered",
    });
    first.close();

    const reopened = fixture.create();
    await expect(reopened.initialize()).resolves.toMatchObject({ state: "remembered" });
    await expect(reopened.getKeyForDispatch()).resolves.toBe("sk-ant-remembered");
    reopened.close();
  });

  it("removes an older remembered key when the user switches to session-only", async () => {
    const fixture = manager("remembered-to-session", ["generation-1", "generation-2"]);
    const first = fixture.create();
    await first.initialize();
    await first.rememberKey("sk-ant-remembered");
    await expect(first.useSessionKey("sk-ant-session")).resolves.toMatchObject({
      state: "session",
      generation: "generation-2",
    });
    first.close();

    const reopened = fixture.create();
    await expect(reopened.initialize()).resolves.toMatchObject({ state: "absent" });
    await expect(reopened.getKeyForDispatch()).rejects.toBeInstanceOf(ProviderKeyUnavailableError);
    reopened.close();
  });

  it("makes a forgotten generation authoritative for a suspended manager", async () => {
    const fixture = manager("forget", ["generation-1", "generation-2"]);
    const first = fixture.create();
    const suspended = fixture.create();
    await first.initialize();
    await suspended.initialize();
    await suspended.useSessionKey("sk-ant-stale");

    await expect(first.forgetKey()).resolves.toMatchObject({
      state: "absent",
      generation: "generation-2",
    });
    await expect(suspended.getKeyForDispatch()).rejects.toBeInstanceOf(ProviderKeyUnavailableError);
    await expect(suspended.getStatus()).resolves.toMatchObject({ state: "absent" });

    first.close();
    suspended.close();
  });

  it("does not acknowledge remember or forget when the credential transaction fails", async () => {
    const fixture = manager("failure");
    const keyManager = fixture.create();
    await keyManager.initialize();
    await keyManager.useSessionKey("sk-ant-active");

    await expect(
      keyManager.rememberKey("sk-ant-replacement", {
        beforeCommit: () => {
          throw new DOMException("quota", "QuotaExceededError");
        },
      })
    ).rejects.toThrow();
    await expect(keyManager.getKeyForDispatch()).resolves.toBe("sk-ant-active");

    await expect(
      keyManager.forgetKey({
        beforeCommit: () => {
          throw new DOMException("blocked", "AbortError");
        },
      })
    ).rejects.toThrow();
    await expect(keyManager.getKeyForDispatch()).resolves.toBe("sk-ant-active");
    keyManager.close();
  });
});
