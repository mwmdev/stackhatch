export interface CanvasPersistenceWrite<TSnapshot> {
  revision: number;
  snapshot: TSnapshot;
  expectedProjectRevision?: number;
  expectedVaultGeneration?: string;
}

export interface CanvasPersistenceWriteOptions {
  keepalive: boolean;
}

export interface CanvasPersistenceCommit {
  projectRevision: number;
  vaultGeneration: string;
}

export interface CanvasPersistenceState {
  latestRevision: number;
  savedRevision: number;
  projectRevision: number | null;
  vaultGeneration: string | null;
  dirty: boolean;
  saving: boolean;
  suspended: boolean;
  disposed: boolean;
}

export class CanvasPersistenceUnauthorizedError extends Error {
  constructor() {
    super("Canvas persistence requires an authenticated session");
    this.name = "CanvasPersistenceUnauthorizedError";
  }
}

export interface CanvasPersistenceCoordinator<TSnapshot> {
  publish(snapshot: TSnapshot): number | null;
  flushLatest(): Promise<void>;
  suspendAndFlush(): Promise<void>;
  persistReplacement(snapshot: TSnapshot): Promise<void>;
  restoreAcknowledgedSnapshot(snapshot: TSnapshot, commit?: CanvasPersistenceCommit): void;
  resume(): void;
  dispose(): Promise<void>;
  getLatestSnapshot(): TSnapshot;
  getState(): CanvasPersistenceState;
}

interface CanvasPersistenceOptions<TSnapshot> {
  baseline: TSnapshot;
  baselineCommit?: CanvasPersistenceCommit;
  writer: (
    write: CanvasPersistenceWrite<TSnapshot>,
    options: CanvasPersistenceWriteOptions
  ) => Promise<CanvasPersistenceCommit | void>;
  debounceMs?: number;
  clone?: (snapshot: TSnapshot) => TSnapshot;
  onBackgroundError?: (error: unknown) => void;
}

class RevisionCoordinator<TSnapshot> implements CanvasPersistenceCoordinator<TSnapshot> {
  private latestRevision = 0;
  private savedRevision = 0;
  private latestSnapshot: TSnapshot;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private flushPromise: Promise<void> | null = null;
  private suspended = false;
  private disposed = false;
  private keepaliveRequested = false;
  private projectRevision: number | null;
  private vaultGeneration: string | null;

  constructor(private readonly options: CanvasPersistenceOptions<TSnapshot>) {
    this.latestSnapshot = this.clone(options.baseline);
    this.projectRevision = options.baselineCommit?.projectRevision ?? null;
    this.vaultGeneration = options.baselineCommit?.vaultGeneration ?? null;
  }

  publish(snapshot: TSnapshot): number | null {
    if (this.suspended || this.disposed) return null;
    return this.acceptSnapshot(snapshot, true);
  }

  flushLatest(): Promise<void> {
    this.cancelDebounce();
    if (this.flushPromise) return this.flushPromise;
    if (this.savedRevision === this.latestRevision) return Promise.resolve();

    const operation = this.runFlush();
    let sharedPromise: Promise<void>;
    sharedPromise = operation.finally(() => {
      if (this.flushPromise === sharedPromise) this.flushPromise = null;
    });
    this.flushPromise = sharedPromise;
    return sharedPromise;
  }

  suspendAndFlush(): Promise<void> {
    if (this.suspended) {
      return Promise.reject(new Error("Canvas persistence is already suspended"));
    }
    this.suspended = true;
    return this.flushLatest().catch((error) => {
      this.suspended = false;
      throw error;
    });
  }

  async persistReplacement(snapshot: TSnapshot): Promise<void> {
    if (!this.suspended) {
      throw new Error("Canvas persistence must be suspended before replacing its snapshot");
    }
    this.acceptSnapshot(snapshot, false);
    await this.flushLatest();
  }

  restoreAcknowledgedSnapshot(snapshot: TSnapshot, commit?: CanvasPersistenceCommit) {
    if (!this.suspended) {
      throw new Error("Canvas persistence must be suspended before restoring its snapshot");
    }
    this.acceptSnapshot(snapshot, false);
    this.savedRevision = this.latestRevision;
    if (commit) this.acceptCommit(commit);
  }

  resume() {
    this.suspended = false;
  }

  dispose(): Promise<void> {
    this.disposed = true;
    this.keepaliveRequested = true;
    this.cancelDebounce();
    return this.flushLatest();
  }

  getLatestSnapshot(): TSnapshot {
    return this.clone(this.latestSnapshot);
  }

  getState(): CanvasPersistenceState {
    return {
      latestRevision: this.latestRevision,
      savedRevision: this.savedRevision,
      projectRevision: this.projectRevision,
      vaultGeneration: this.vaultGeneration,
      dirty: this.savedRevision !== this.latestRevision,
      saving: this.flushPromise !== null,
      suspended: this.suspended,
      disposed: this.disposed,
    };
  }

  private acceptSnapshot(snapshot: TSnapshot, schedule: boolean) {
    this.latestRevision += 1;
    this.latestSnapshot = this.clone(snapshot);
    if (schedule) this.scheduleFlush();
    return this.latestRevision;
  }

  private scheduleFlush() {
    this.cancelDebounce();
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      void this.flushLatest().catch((error) => this.options.onBackgroundError?.(error));
    }, this.options.debounceMs ?? 500);
  }

  private cancelDebounce() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = undefined;
  }

  private async runFlush() {
    while (this.savedRevision !== this.latestRevision) {
      const revision = this.latestRevision;
      const snapshot = this.clone(this.latestSnapshot);
      const commit =
        this.projectRevision !== null && this.vaultGeneration !== null
          ? {
              expectedProjectRevision: this.projectRevision,
              expectedVaultGeneration: this.vaultGeneration,
            }
          : {};
      const acknowledgement = await this.options.writer(
        { revision, snapshot, ...commit },
        { keepalive: this.keepaliveRequested }
      );
      if (acknowledgement) this.acceptCommit(acknowledgement);
      this.savedRevision = Math.max(this.savedRevision, revision);
    }
  }

  private acceptCommit(commit: CanvasPersistenceCommit) {
    this.projectRevision = commit.projectRevision;
    this.vaultGeneration = commit.vaultGeneration;
  }

  private clone(snapshot: TSnapshot) {
    return this.options.clone ? this.options.clone(snapshot) : structuredClone(snapshot);
  }
}

export function createCanvasPersistenceCoordinator<TSnapshot>(
  options: CanvasPersistenceOptions<TSnapshot>
): CanvasPersistenceCoordinator<TSnapshot> {
  return new RevisionCoordinator(options);
}
