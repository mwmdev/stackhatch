import { describe, expect, it, vi } from "vitest";
import {
  GLOBAL_VAULT_LOCK,
  createVaultInvalidationChannel,
  createVaultLockCoordinator,
  projectVaultLock,
  type BroadcastChannelLike,
  type LockManagerLike,
} from "./coordination";
import { VaultUnavailableError } from "./storage-status";

class MemoryBroadcastChannel implements BroadcastChannelLike {
  static channels = new Map<string, Set<MemoryBroadcastChannel>>();

  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(private readonly name: string) {
    const channels = MemoryBroadcastChannel.channels.get(name) ?? new Set();
    channels.add(this);
    MemoryBroadcastChannel.channels.set(name, channels);
  }

  postMessage(message: unknown) {
    for (const channel of MemoryBroadcastChannel.channels.get(this.name) ?? []) {
      if (channel !== this) {
        channel.onmessage?.({ data: structuredClone(message) } as MessageEvent);
      }
    }
  }

  close() {
    MemoryBroadcastChannel.channels.get(this.name)?.delete(this);
  }
}

describe("vault coordination", () => {
  it("delivers invalidations to other tabs without echoing to the publisher", () => {
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    const first = createVaultInvalidationChannel({
      sourceId: "tab-a",
      channelFactory: (name) => new MemoryBroadcastChannel(name),
    });
    const second = createVaultInvalidationChannel({
      sourceId: "tab-b",
      channelFactory: (name) => new MemoryBroadcastChannel(name),
    });
    first.subscribe(firstListener);
    second.subscribe(secondListener);

    first.publish({
      generation: "generation-1",
      projectId: "project-1",
      projectRevision: 2,
      stores: ["projects", "messages"],
      reason: "mutation",
    });

    expect(firstListener).not.toHaveBeenCalled();
    expect(secondListener).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: "tab-a",
        generation: "generation-1",
        projectId: "project-1",
        projectRevision: 2,
      })
    );
    first.close();
    second.close();
  });

  it("acquires the global lock before a project lock and releases in reverse order", async () => {
    const events: string[] = [];
    const lockManager: LockManagerLike = {
      async request(name, _options, callback) {
        events.push(`acquire:${name}`);
        try {
          return await callback();
        } finally {
          events.push(`release:${name}`);
        }
      },
    };
    const coordinator = createVaultLockCoordinator({ lockManager });

    await coordinator.withGlobalProjectLock("project-1", async () => {
      events.push("work");
    });

    expect(events).toEqual([
      `acquire:${GLOBAL_VAULT_LOCK}`,
      `acquire:${projectVaultLock("project-1")}`,
      "work",
      `release:${projectVaultLock("project-1")}`,
      `release:${GLOBAL_VAULT_LOCK}`,
    ]);
  });

  it("fails visibly when Web Locks are unavailable", () => {
    expect(() => createVaultLockCoordinator({ lockManager: undefined })).toThrow(
      VaultUnavailableError
    );
  });
});
