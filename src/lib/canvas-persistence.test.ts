import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCanvasPersistenceCoordinator } from "./canvas-persistence";

interface Snapshot {
  nodes: string[];
  positions: Record<string, { x: number; y: number }>;
  alternatives: Record<string, string[]>;
}

const baseline: Snapshot = { nodes: [], positions: {}, alternatives: {} };

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function populatedSnapshot(name = "api"): Snapshot {
  return {
    nodes: [name],
    positions: { [name]: { x: 10, y: 20 } },
    alternatives: { [name]: ["worker"] },
  };
}

describe("canvas persistence coordinator", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("seeds an acknowledged baseline without writing", async () => {
    const writer = vi.fn().mockResolvedValue(undefined);
    const coordinator = createCanvasPersistenceCoordinator({ baseline, writer });

    await coordinator.flushLatest();
    await vi.runAllTimersAsync();

    expect(writer).not.toHaveBeenCalled();
    expect(coordinator.getState()).toMatchObject({
      latestRevision: 0,
      savedRevision: 0,
      dirty: false,
    });
  });

  it("treats position-only and alternatives-only snapshots as revisions", () => {
    const coordinator = createCanvasPersistenceCoordinator({
      baseline,
      writer: vi.fn().mockResolvedValue(undefined),
    });

    expect(coordinator.publish({ ...baseline, positions: { api: { x: 1, y: 2 } } })).toBe(1);
    expect(coordinator.publish({ ...baseline, alternatives: { api: ["queue"] } })).toBe(2);
    expect(coordinator.getState()).toMatchObject({ latestRevision: 2, dirty: true });
  });

  it("retains an immutable copy of each accepted snapshot", async () => {
    const writer = vi.fn().mockResolvedValue(undefined);
    const coordinator = createCanvasPersistenceCoordinator({ baseline, writer });
    const snapshot = populatedSnapshot();

    coordinator.publish(snapshot);
    snapshot.nodes[0] = "mutated";
    snapshot.positions.api.x = 999;
    await coordinator.flushLatest();

    expect(writer).toHaveBeenCalledWith(
      { revision: 1, snapshot: populatedSnapshot() },
      { keepalive: false }
    );
    const exposed = coordinator.getLatestSnapshot();
    exposed.nodes[0] = "also-mutated";
    expect(coordinator.getLatestSnapshot()).toEqual(populatedSnapshot());
  });

  it("debounces and coalesces revisions into the latest write", async () => {
    const writer = vi.fn().mockResolvedValue(undefined);
    const coordinator = createCanvasPersistenceCoordinator({
      baseline,
      writer,
      debounceMs: 500,
    });

    coordinator.publish(populatedSnapshot("first"));
    await vi.advanceTimersByTimeAsync(400);
    coordinator.publish(populatedSnapshot("latest"));
    await vi.advanceTimersByTimeAsync(499);
    expect(writer).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(writer).toHaveBeenCalledOnce();
    expect(writer.mock.calls[0][0]).toEqual({
      revision: 2,
      snapshot: populatedSnapshot("latest"),
    });
  });

  it("serializes an older write and a newer revision with maximum concurrency one", async () => {
    const writes = [deferred<void>(), deferred<void>()];
    let active = 0;
    let maxActive = 0;
    const writer = vi.fn(
      async ({ revision }: { revision: number }, _options: { keepalive: boolean }) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await writes[revision - 1].promise;
        active -= 1;
      }
    );
    const coordinator = createCanvasPersistenceCoordinator({ baseline, writer });

    coordinator.publish(populatedSnapshot("older"));
    const flush = coordinator.flushLatest();
    coordinator.publish(populatedSnapshot("newer"));

    expect(writer).toHaveBeenCalledTimes(1);
    writes[0].resolve();
    await vi.waitFor(() => expect(writer).toHaveBeenCalledTimes(2));
    expect(coordinator.getState()).toMatchObject({ savedRevision: 1, latestRevision: 2 });
    writes[1].resolve();
    await flush;

    expect(maxActive).toBe(1);
    expect(coordinator.getState()).toMatchObject({ savedRevision: 2, dirty: false });
  });

  it("retains the exact dirty snapshot after failure and retries it", async () => {
    const writer = vi
      .fn()
      .mockRejectedValueOnce(new Error("ambiguous response"))
      .mockResolvedValueOnce(undefined);
    const coordinator = createCanvasPersistenceCoordinator({ baseline, writer });
    coordinator.publish(populatedSnapshot());

    await expect(coordinator.flushLatest()).rejects.toThrow("ambiguous response");
    expect(coordinator.getState()).toMatchObject({ savedRevision: 0, dirty: true });
    await coordinator.flushLatest();

    expect(writer).toHaveBeenCalledTimes(2);
    expect(writer.mock.calls[1][0]).toEqual(writer.mock.calls[0][0]);
    expect(coordinator.getState().dirty).toBe(false);
  });

  it("keeps durable commit preconditions unchanged until a retry is acknowledged", async () => {
    const writer = vi
      .fn()
      .mockRejectedValueOnce(new Error("transaction aborted"))
      .mockResolvedValueOnce({ projectRevision: 8, vaultGeneration: "vault-next" });
    const coordinator = createCanvasPersistenceCoordinator({
      baseline,
      baselineCommit: { projectRevision: 7, vaultGeneration: "vault-current" },
      writer,
    });
    coordinator.publish(populatedSnapshot());

    await expect(coordinator.flushLatest()).rejects.toThrow("transaction aborted");
    expect(coordinator.getState()).toMatchObject({
      dirty: true,
      projectRevision: 7,
      vaultGeneration: "vault-current",
    });

    await coordinator.flushLatest();

    expect(writer.mock.calls[0][0]).toMatchObject({
      expectedProjectRevision: 7,
      expectedVaultGeneration: "vault-current",
    });
    expect(writer.mock.calls[1][0]).toEqual(writer.mock.calls[0][0]);
    expect(coordinator.getState()).toMatchObject({
      dirty: false,
      projectRevision: 8,
      vaultGeneration: "vault-next",
    });
  });

  it("shares ordered work across concurrent flush callers", async () => {
    const write = deferred<void>();
    const writer = vi.fn(() => write.promise);
    const coordinator = createCanvasPersistenceCoordinator({ baseline, writer });
    coordinator.publish(populatedSnapshot());

    const first = coordinator.flushLatest();
    const second = coordinator.flushLatest();

    expect(first).toBe(second);
    expect(writer).toHaveBeenCalledOnce();
    write.resolve();
    await Promise.all([first, second]);
  });

  it("queues disposal behind an older write and uses keepalive only at the head", async () => {
    const writes = [deferred<void>(), deferred<void>()];
    let active = 0;
    let maxActive = 0;
    const writer = vi.fn(
      async ({ revision }: { revision: number }, _options: { keepalive: boolean }) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await writes[revision - 1].promise;
        active -= 1;
      }
    );
    const coordinator = createCanvasPersistenceCoordinator({ baseline, writer });
    coordinator.publish(populatedSnapshot("older"));
    const firstFlush = coordinator.flushLatest();
    coordinator.publish(populatedSnapshot("latest"));

    const disposal = coordinator.dispose();
    expect(writer.mock.calls[0][1]).toEqual({ keepalive: false });
    writes[0].resolve();
    await vi.waitFor(() => expect(writer).toHaveBeenCalledTimes(2));
    expect(writer.mock.calls[1][1]).toEqual({ keepalive: true });
    writes[1].resolve();
    await Promise.all([firstFlush, disposal]);

    expect(maxActive).toBe(1);
  });

  it("does not duplicate an explicitly flushed write during disposal", async () => {
    const writer = vi.fn().mockResolvedValue(undefined);
    const coordinator = createCanvasPersistenceCoordinator({ baseline, writer });
    coordinator.publish(populatedSnapshot());

    await coordinator.flushLatest();
    await coordinator.dispose();

    expect(writer).toHaveBeenCalledOnce();
  });

  it("suspends ordinary publications and persists an explicit replacement before resume", async () => {
    const writer = vi.fn().mockResolvedValue(undefined);
    const coordinator = createCanvasPersistenceCoordinator({ baseline, writer });
    coordinator.publish(populatedSnapshot("before-stream"));

    await coordinator.suspendAndFlush();
    expect(coordinator.getState()).toMatchObject({ suspended: true, dirty: false });
    expect(coordinator.publish(populatedSnapshot("blocked-edit"))).toBeNull();
    await coordinator.persistReplacement(populatedSnapshot("ai-result"));
    expect(coordinator.getLatestSnapshot()).toEqual(populatedSnapshot("ai-result"));
    expect(coordinator.getState()).toMatchObject({ suspended: true, dirty: false });

    coordinator.resume();
    expect(coordinator.publish(populatedSnapshot("after-stream"))).toBe(3);
  });

  it("restores a refetched acknowledged snapshot without issuing another write", async () => {
    const writer = vi.fn().mockResolvedValue(undefined);
    const coordinator = createCanvasPersistenceCoordinator({ baseline, writer });
    coordinator.publish(populatedSnapshot("before-stream"));
    await coordinator.suspendAndFlush();

    coordinator.restoreAcknowledgedSnapshot(populatedSnapshot("authoritative-before-stream"));

    expect(writer).toHaveBeenCalledOnce();
    expect(coordinator.getLatestSnapshot()).toEqual(
      populatedSnapshot("authoritative-before-stream")
    );
    expect(coordinator.getState()).toMatchObject({ suspended: true, dirty: false });
  });

  it("accepts a revision-safe external provider commit after pending edits settle", async () => {
    const writer = vi.fn().mockResolvedValue({
      projectRevision: 2,
      vaultGeneration: "generation-1",
    });
    const coordinator = createCanvasPersistenceCoordinator({
      baseline,
      baselineCommit: { projectRevision: 1, vaultGeneration: "generation-1" },
      writer,
    });
    coordinator.publish(populatedSnapshot("before-provider"));
    await coordinator.flushLatest();

    coordinator.acknowledgeExternalCommit(populatedSnapshot("provider-result"), {
      projectRevision: 3,
      vaultGeneration: "generation-1",
    });

    expect(coordinator.getLatestSnapshot()).toEqual(populatedSnapshot("provider-result"));
    expect(coordinator.getState()).toMatchObject({
      projectRevision: 3,
      vaultGeneration: "generation-1",
      dirty: false,
      suspended: false,
    });
    expect(writer).toHaveBeenCalledOnce();
  });

  it("creates an isolated acknowledged baseline for a new project instance", () => {
    const writer = vi.fn().mockResolvedValue(undefined);
    const first = createCanvasPersistenceCoordinator({ baseline, writer });
    first.publish(populatedSnapshot("project-one"));

    const secondBaseline = populatedSnapshot("project-two");
    const second = createCanvasPersistenceCoordinator({ baseline: secondBaseline, writer });

    expect(second.getState()).toMatchObject({ latestRevision: 0, savedRevision: 0, dirty: false });
    expect(second.getLatestSnapshot()).toEqual(secondBaseline);
  });
});
