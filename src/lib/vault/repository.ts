import type { IDBPTransaction } from "idb";
import { createId } from "@/lib/id";
import {
  createVaultDatabaseFactory,
  type VaultDatabase,
  type VaultDatabaseFactory,
} from "./indexed-db";
import type {
  StackHatchVaultDatabase,
  VaultDevicePreferencesRecord,
  VaultMessageRecord,
  VaultProjectRecord,
  VaultProviderRunRecord,
  VaultRepositoryEvidenceRecord,
  VaultRepositoryProvenanceRecord,
  VaultResumeRecord,
  VaultStoreName,
  VaultTemplateRecord,
} from "./schema";
import { DEVICE_RECORD_ID, VAULT_META_ID, VAULT_STORE_NAMES } from "./schema";
import type {
  VaultInvalidation,
  VaultInvalidationChannel,
  VaultInvalidationWrite,
} from "./coordination";
import { createVaultInvalidationChannel } from "./coordination";
import {
  VaultConflictError,
  VaultGenerationConflictError,
  VaultSnapshotConflictError,
  VaultUnavailableError,
  VaultValidationError,
  normalizeVaultError,
} from "./storage-status";

type VaultWriteTransaction = IDBPTransaction<
  StackHatchVaultDatabase,
  VaultStoreName[],
  "readwrite"
>;

type RecordWrite<T extends { revision: number }> = Omit<T, "revision">;

export interface VaultProjectBundleWrite {
  project: RecordWrite<VaultProjectRecord>;
  messages?: Array<RecordWrite<VaultMessageRecord>>;
  evidence?: Array<RecordWrite<VaultRepositoryEvidenceRecord>>;
  provenance?: RecordWrite<VaultRepositoryProvenanceRecord> | null;
  providerRuns?: Array<RecordWrite<VaultProviderRunRecord>>;
  replaceMessages?: boolean;
  replaceEvidence?: boolean;
  replaceProviderRuns?: boolean;
}

export interface VaultProjectBundle {
  project: VaultProjectRecord;
  messages: VaultMessageRecord[];
  evidence: VaultRepositoryEvidenceRecord[];
  provenance: VaultRepositoryProvenanceRecord | null;
  providerRuns: VaultProviderRunRecord[];
}

export type VaultBackupProjectBundle = Omit<VaultProjectBundle, "providerRuns">;

export interface VaultProjectPrecondition {
  expectedGeneration: string;
  expectedProjectRevision: number | null;
}

export interface VaultRecordPrecondition {
  expectedGeneration: string;
  expectedRevision: number | null;
}

export interface VaultProviderResultWrite {
  project: RecordWrite<VaultProjectRecord>;
  run: RecordWrite<VaultProviderRunRecord>;
  messages?: Array<RecordWrite<VaultMessageRecord>>;
  replaceMessages?: boolean;
}

export interface VaultProviderResultPrecondition extends VaultProjectPrecondition {
  expectedRunRevision: number;
}

export interface VaultProviderResultCommit {
  project: VaultProjectRecord;
  run: VaultProviderRunRecord;
}

export type VaultDevicePreferencesWrite = Pick<
  VaultDevicePreferencesRecord,
  "model" | "theme" | "customSubtypes" | "editorDisplay"
>;

export type VaultTemplateWrite = RecordWrite<VaultTemplateRecord>;

export type VaultProviderRunWrite = RecordWrite<VaultProviderRunRecord>;

export interface VaultProjectSnapshot {
  project: VaultProjectRecord;
  generation: string;
}

export interface VaultDevicePreferencesSnapshot {
  generation: string;
  preferences: VaultDevicePreferencesRecord | null;
}

export interface VaultRepositorySnapshot {
  generation: string;
  projects: VaultProjectBundle[];
  templates: VaultTemplateRecord[];
  preferences: VaultDevicePreferencesRecord | null;
  resume: VaultResumeRecord | null;
}

export interface VaultBackupSnapshot {
  generation: string;
  projects: VaultBackupProjectBundle[];
  templates: VaultTemplateRecord[];
  preferences: VaultDevicePreferencesRecord | null;
  resume: VaultResumeRecord | null;
}

export interface VaultReplaceOptions {
  beforeCommit?: () => void | Promise<void>;
}

export interface VaultRepository {
  getGeneration(): Promise<string>;
  advanceVaultGeneration(expectedGeneration: string): Promise<string>;
  getProject(projectId: string): Promise<VaultProjectRecord | null>;
  getProjectSnapshot(projectId: string): Promise<VaultProjectSnapshot | null>;
  listProjectMessages(projectId: string): Promise<VaultMessageRecord[]>;
  getRepositoryProvenance(projectId: string): Promise<VaultRepositoryProvenanceRecord | null>;
  getDevicePreferencesSnapshot(): Promise<VaultDevicePreferencesSnapshot>;
  getProjectBundle(projectId: string): Promise<VaultProjectBundle | null>;
  getProjectBackupBundle(projectId: string): Promise<VaultBackupProjectBundle | null>;
  readBackupSnapshot(): Promise<VaultBackupSnapshot>;
  readVaultSnapshot(): Promise<VaultRepositorySnapshot>;
  replaceVaultSnapshot(
    snapshot: Omit<VaultRepositorySnapshot, "generation">,
    expectedSnapshot: VaultRepositorySnapshot,
    options?: VaultReplaceOptions
  ): Promise<string>;
  listProjects(): Promise<VaultProjectRecord[]>;
  saveProjectBundle(
    bundle: VaultProjectBundleWrite,
    precondition: VaultProjectPrecondition
  ): Promise<VaultProjectRecord>;
  commitProviderResult(
    result: VaultProviderResultWrite,
    precondition: VaultProviderResultPrecondition
  ): Promise<VaultProviderResultCommit>;
  deleteProject(projectId: string, precondition: VaultProjectPrecondition): Promise<void>;
  recordProjectOpen(projectId: string, expectedGeneration: string): Promise<boolean>;
  resolveLastOpenedProject(expectedGeneration: string): Promise<VaultProjectRecord | null>;
  getResumeRecord(): Promise<VaultResumeRecord | null>;
  getDevicePreferences(): Promise<VaultDevicePreferencesRecord | null>;
  putDevicePreferences(
    preferences: VaultDevicePreferencesWrite,
    precondition: VaultRecordPrecondition
  ): Promise<VaultDevicePreferencesRecord>;
  listTemplates(): Promise<VaultTemplateRecord[]>;
  putTemplate(
    template: VaultTemplateWrite,
    precondition: VaultRecordPrecondition
  ): Promise<VaultTemplateRecord>;
  getProviderRun(runId: string): Promise<VaultProviderRunRecord | null>;
  putProviderRun(
    run: VaultProviderRunWrite,
    precondition: VaultRecordPrecondition
  ): Promise<VaultProviderRunRecord>;
  subscribeInvalidation(listener: (invalidation: VaultInvalidation) => void): () => void;
  close(): void;
}

export interface VaultRepositoryOptions {
  databaseFactory?: VaultDatabaseFactory;
  invalidationChannel?: VaultInvalidationChannel | null;
  now?: () => number;
  generationFactory?: () => string;
}

function actualRevision(record: { revision: number } | undefined) {
  return record?.revision ?? null;
}

function assertRevision(record: { revision: number } | undefined, expectedRevision: number | null) {
  const actual = actualRevision(record);
  if (actual !== expectedRevision) {
    throw new VaultConflictError(expectedRevision, actual);
  }
}

function assertProjectRelations(bundle: VaultProjectBundleWrite) {
  const projectId = bundle.project.id;
  const childIds = [
    ...(bundle.messages ?? []).map((record) => record.projectId),
    ...(bundle.evidence ?? []).map((record) => record.projectId),
    ...(bundle.providerRuns ?? []).map((record) => record.projectId),
    ...(bundle.provenance ? [bundle.provenance.projectId] : []),
  ];
  if (childIds.some((childProjectId) => childProjectId !== projectId)) {
    throw new VaultValidationError("Every project bundle record must reference the bundle project");
  }
}

function revisionFingerprintFromRecords({
  projects,
  messages,
  evidence,
  provenance,
  providerRuns,
  templates,
  preferences,
  resume,
}: {
  projects: VaultProjectRecord[];
  messages: VaultMessageRecord[];
  evidence: VaultRepositoryEvidenceRecord[];
  provenance: VaultRepositoryProvenanceRecord[];
  providerRuns: VaultProviderRunRecord[];
  templates: VaultTemplateRecord[];
  preferences: VaultDevicePreferencesRecord | null;
  resume: VaultResumeRecord | null;
}) {
  const revisions = (records: Array<{ id: string; revision: number }>) =>
    records
      .map(({ id, revision }) => `${id}:${revision}`)
      .sort((left, right) => left.localeCompare(right));

  return JSON.stringify({
    projects: revisions(projects),
    messages: revisions(messages),
    evidence: revisions(evidence),
    provenance: revisions(
      provenance.map((record) => ({ id: record.projectId, revision: record.revision }))
    ),
    providerRuns: revisions(providerRuns),
    templates: revisions(templates),
    preferences: preferences?.revision ?? null,
    resume: resume?.revision ?? null,
  });
}

function revisionFingerprint(snapshot: VaultRepositorySnapshot) {
  return revisionFingerprintFromRecords({
    projects: snapshot.projects.map(({ project }) => project),
    messages: snapshot.projects.flatMap(({ messages }) => messages),
    evidence: snapshot.projects.flatMap(({ evidence }) => evidence),
    provenance: snapshot.projects.flatMap(({ provenance }) => (provenance ? [provenance] : [])),
    providerRuns: snapshot.projects.flatMap(({ providerRuns }) => providerRuns),
    templates: snapshot.templates,
    preferences: snapshot.preferences,
    resume: snapshot.resume,
  });
}

function assembleProjectBundles(
  projects: VaultProjectRecord[],
  messages: VaultMessageRecord[],
  evidence: VaultRepositoryEvidenceRecord[],
  provenance: VaultRepositoryProvenanceRecord[],
  providerRuns: VaultProviderRunRecord[]
) {
  const groupByProject = <T extends { projectId: string }>(records: T[]) => {
    const grouped = new Map<string, T[]>();
    for (const record of records) {
      const group = grouped.get(record.projectId);
      if (group) group.push(record);
      else grouped.set(record.projectId, [record]);
    }
    return grouped;
  };
  const messagesByProject = groupByProject(messages);
  const evidenceByProject = groupByProject(evidence);
  const providerRunsByProject = groupByProject(providerRuns);
  const provenanceByProject = new Map(provenance.map((record) => [record.projectId, record]));

  return projects.map((project) => ({
    project,
    messages: (messagesByProject.get(project.id) ?? []).sort(
      (left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id)
    ),
    evidence: (evidenceByProject.get(project.id) ?? []).sort((left, right) =>
      left.path.localeCompare(right.path)
    ),
    provenance: provenanceByProject.get(project.id) ?? null,
    providerRuns: (providerRunsByProject.get(project.id) ?? []).sort(
      (left, right) => left.updatedAt - right.updatedAt || left.id.localeCompare(right.id)
    ),
  }));
}

async function assertGeneration(transaction: VaultWriteTransaction, expectedGeneration: string) {
  const metadata = await transaction.objectStore("meta").get(VAULT_META_ID);
  if (!metadata) {
    throw new VaultUnavailableError("The vault metadata record is missing");
  }
  if (metadata.generation !== expectedGeneration) {
    throw new VaultGenerationConflictError(expectedGeneration, metadata.generation);
  }
  return metadata;
}

async function runWrite<T>(
  database: VaultDatabase,
  stores: VaultStoreName[],
  operation: (transaction: VaultWriteTransaction) => Promise<T>,
  message: string
) {
  const transaction = database.transaction(stores, "readwrite") as VaultWriteTransaction;
  try {
    const result = await operation(transaction);
    await transaction.done;
    return result;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // The browser may already have aborted after a failed request.
    }
    try {
      await transaction.done;
    } catch {
      // The original request error below carries the useful failure.
    }
    throw normalizeVaultError(error, message);
  }
}

async function runRead<T>(operation: () => Promise<T>, message: string): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw normalizeVaultError(error, message);
  }
}

async function deleteProjectIndexRecords(
  transaction: VaultWriteTransaction,
  storeName: "messages" | "repositoryEvidence" | "providerRuns",
  projectId: string
) {
  let cursor = await transaction.objectStore(storeName).index("by-project").openCursor(projectId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
}

class IndexedDbVaultRepository implements VaultRepository {
  private databasePromise: Promise<VaultDatabase> | null = null;
  private closed = false;
  private readonly invalidationListeners = new Set<(invalidation: VaultInvalidation) => void>();
  private readonly unsubscribeChannel: (() => void) | null;

  constructor(
    private readonly options: Required<
      Pick<VaultRepositoryOptions, "databaseFactory" | "now" | "generationFactory">
    > &
      Pick<VaultRepositoryOptions, "invalidationChannel">
  ) {
    this.unsubscribeChannel =
      options.invalidationChannel?.subscribe((invalidation) => {
        for (const listener of this.invalidationListeners) {
          listener(invalidation);
        }
      }) ?? null;
  }

  private database() {
    if (this.closed) {
      return Promise.reject(new VaultUnavailableError("The vault is closed"));
    }
    this.databasePromise ??= this.options.databaseFactory();
    return this.databasePromise;
  }

  private publish(invalidation: VaultInvalidationWrite) {
    this.options.invalidationChannel?.publish(invalidation);
  }

  async getGeneration() {
    return runRead(async () => {
      const database = await this.database();
      const metadata = await database.get("meta", VAULT_META_ID);
      if (!metadata) {
        throw new VaultUnavailableError("The vault metadata record is missing");
      }
      return metadata.generation;
    }, "The vault generation could not be read");
  }

  async advanceVaultGeneration(expectedGeneration: string) {
    const database = await this.database();
    const generation = this.options.generationFactory();
    const result = await runWrite(
      database,
      ["meta"],
      async (transaction) => {
        const metadata = await assertGeneration(transaction, expectedGeneration);
        await transaction.objectStore("meta").put({
          ...metadata,
          generation,
          updatedAt: this.options.now(),
        });
        return generation;
      },
      "The vault generation did not commit"
    );
    this.publish({
      generation: result,
      projectId: null,
      projectRevision: null,
      stores: ["meta"],
      reason: "generation",
    });
    return result;
  }

  async getProject(projectId: string) {
    return runRead(async () => {
      const database = await this.database();
      return (await database.get("projects", projectId)) ?? null;
    }, "The project could not be read");
  }

  async getProjectSnapshot(projectId: string) {
    return runRead(async () => {
      const database = await this.database();
      const transaction = database.transaction(["meta", "projects"], "readonly");
      const [metadata, project] = await Promise.all([
        transaction.objectStore("meta").get(VAULT_META_ID),
        transaction.objectStore("projects").get(projectId),
      ]);
      await transaction.done;
      if (!metadata) {
        throw new VaultUnavailableError("The vault metadata record is missing");
      }
      return project ? { project, generation: metadata.generation } : null;
    }, "The project snapshot could not be read");
  }

  async listProjectMessages(projectId: string) {
    return runRead(async () => {
      const database = await this.database();
      const messages = await database.getAllFromIndex("messages", "by-project", projectId);
      return messages.sort(
        (left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id)
      );
    }, "Project messages could not be read");
  }

  async getRepositoryProvenance(projectId: string) {
    return runRead(async () => {
      const database = await this.database();
      return (await database.get("repositoryProvenance", projectId)) ?? null;
    }, "Repository provenance could not be read");
  }

  async getDevicePreferencesSnapshot() {
    return runRead(async () => {
      const database = await this.database();
      const transaction = database.transaction(["meta", "preferences"], "readonly");
      const [metadata, preferences] = await Promise.all([
        transaction.objectStore("meta").get(VAULT_META_ID),
        transaction.objectStore("preferences").get(DEVICE_RECORD_ID),
      ]);
      await transaction.done;
      if (!metadata) {
        throw new VaultUnavailableError("The vault metadata record is missing");
      }
      return {
        generation: metadata.generation,
        preferences: preferences ?? null,
      };
    }, "Device preferences could not be read");
  }

  async getProjectBundle(projectId: string) {
    return runRead(async () => {
      const database = await this.database();
      const transaction = database.transaction(
        ["projects", "messages", "repositoryEvidence", "repositoryProvenance", "providerRuns"],
        "readonly"
      );
      const [project, messages, evidence, provenance, providerRuns] = await Promise.all([
        transaction.objectStore("projects").get(projectId),
        transaction.objectStore("messages").index("by-project").getAll(projectId),
        transaction.objectStore("repositoryEvidence").index("by-project").getAll(projectId),
        transaction.objectStore("repositoryProvenance").get(projectId),
        transaction.objectStore("providerRuns").index("by-project").getAll(projectId),
      ]);
      await transaction.done;
      if (!project) return null;

      messages.sort(
        (left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id)
      );
      evidence.sort((left, right) => left.path.localeCompare(right.path));
      providerRuns.sort(
        (left, right) => left.updatedAt - right.updatedAt || left.id.localeCompare(right.id)
      );
      return {
        project,
        messages,
        evidence,
        provenance: provenance ?? null,
        providerRuns,
      };
    }, "The project bundle could not be read");
  }

  async getProjectBackupBundle(projectId: string) {
    return runRead(async () => {
      const database = await this.database();
      const transaction = database.transaction(
        ["projects", "messages", "repositoryEvidence", "repositoryProvenance"],
        "readonly"
      );
      const [project, messages, evidence, provenance] = await Promise.all([
        transaction.objectStore("projects").get(projectId),
        transaction.objectStore("messages").index("by-project").getAll(projectId),
        transaction.objectStore("repositoryEvidence").index("by-project").getAll(projectId),
        transaction.objectStore("repositoryProvenance").get(projectId),
      ]);
      await transaction.done;
      if (!project) return null;
      messages.sort(
        (left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id)
      );
      evidence.sort((left, right) => left.path.localeCompare(right.path));
      return {
        project,
        messages,
        evidence,
        provenance: provenance ?? null,
      };
    }, "The project backup bundle could not be read");
  }

  async readBackupSnapshot() {
    return runRead(async () => {
      const database = await this.database();
      const transaction = database.transaction(
        [
          "meta",
          "projects",
          "messages",
          "repositoryEvidence",
          "repositoryProvenance",
          "templates",
          "preferences",
          "resume",
        ],
        "readonly"
      );
      const [metadata, projects, messages, evidence, provenance, templates, preferences, resume] =
        await Promise.all([
          transaction.objectStore("meta").get(VAULT_META_ID),
          transaction.objectStore("projects").getAll(),
          transaction.objectStore("messages").getAll(),
          transaction.objectStore("repositoryEvidence").getAll(),
          transaction.objectStore("repositoryProvenance").getAll(),
          transaction.objectStore("templates").getAll(),
          transaction.objectStore("preferences").get(DEVICE_RECORD_ID),
          transaction.objectStore("resume").get(DEVICE_RECORD_ID),
        ]);
      await transaction.done;
      if (!metadata) {
        throw new VaultUnavailableError("The vault metadata record is missing");
      }
      const bundles = assembleProjectBundles(projects, messages, evidence, provenance, []).map(
        ({ providerRuns: _providerRuns, ...bundle }) => bundle
      );
      bundles.sort(
        (left, right) =>
          right.project.updatedAt - left.project.updatedAt ||
          right.project.createdAt - left.project.createdAt ||
          right.project.id.localeCompare(left.project.id)
      );
      templates.sort(
        (left, right) => right.createdAt - left.createdAt || right.id.localeCompare(left.id)
      );
      return {
        generation: metadata.generation,
        projects: bundles,
        templates,
        preferences: preferences ?? null,
        resume: resume ?? null,
      };
    }, "The backup snapshot could not be read");
  }

  async readVaultSnapshot() {
    return runRead(async () => {
      const database = await this.database();
      const transaction = database.transaction(VAULT_STORE_NAMES, "readonly");
      const [
        metadata,
        projects,
        messages,
        evidence,
        provenance,
        providerRuns,
        templates,
        preferences,
        resume,
      ] = await Promise.all([
        transaction.objectStore("meta").get(VAULT_META_ID),
        transaction.objectStore("projects").getAll(),
        transaction.objectStore("messages").getAll(),
        transaction.objectStore("repositoryEvidence").getAll(),
        transaction.objectStore("repositoryProvenance").getAll(),
        transaction.objectStore("providerRuns").getAll(),
        transaction.objectStore("templates").getAll(),
        transaction.objectStore("preferences").get(DEVICE_RECORD_ID),
        transaction.objectStore("resume").get(DEVICE_RECORD_ID),
      ]);
      await transaction.done;
      if (!metadata) {
        throw new VaultUnavailableError("The vault metadata record is missing");
      }

      const bundles = assembleProjectBundles(
        projects,
        messages,
        evidence,
        provenance,
        providerRuns
      );
      bundles.sort(
        (left, right) =>
          right.project.updatedAt - left.project.updatedAt ||
          right.project.createdAt - left.project.createdAt ||
          right.project.id.localeCompare(left.project.id)
      );
      templates.sort(
        (left, right) => right.createdAt - left.createdAt || right.id.localeCompare(left.id)
      );
      return {
        generation: metadata.generation,
        projects: bundles,
        templates,
        preferences: preferences ?? null,
        resume: resume ?? null,
      };
    }, "The vault snapshot could not be read");
  }

  async replaceVaultSnapshot(
    snapshot: Omit<VaultRepositorySnapshot, "generation">,
    expectedSnapshot: VaultRepositorySnapshot,
    options: VaultReplaceOptions = {}
  ) {
    for (const bundle of snapshot.projects) {
      assertProjectRelations({
        project: bundle.project,
        messages: bundle.messages,
        evidence: bundle.evidence,
        provenance: bundle.provenance,
        providerRuns: bundle.providerRuns,
      });
    }
    const database = await this.database();
    const generation = this.options.generationFactory();
    const expectedFingerprint = revisionFingerprint(expectedSnapshot);
    await runWrite(
      database,
      [...VAULT_STORE_NAMES],
      async (transaction) => {
        const metadata = await assertGeneration(transaction, expectedSnapshot.generation);
        const [
          projects,
          messages,
          evidence,
          provenance,
          providerRuns,
          templates,
          preferences,
          resume,
        ] = await Promise.all([
          transaction.objectStore("projects").getAll(),
          transaction.objectStore("messages").getAll(),
          transaction.objectStore("repositoryEvidence").getAll(),
          transaction.objectStore("repositoryProvenance").getAll(),
          transaction.objectStore("providerRuns").getAll(),
          transaction.objectStore("templates").getAll(),
          transaction.objectStore("preferences").get(DEVICE_RECORD_ID),
          transaction.objectStore("resume").get(DEVICE_RECORD_ID),
        ]);
        const actualFingerprint = revisionFingerprintFromRecords({
          projects,
          messages,
          evidence,
          provenance,
          providerRuns,
          templates,
          preferences: preferences ?? null,
          resume: resume ?? null,
        });
        if (actualFingerprint !== expectedFingerprint) {
          throw new VaultSnapshotConflictError();
        }
        const stores = VAULT_STORE_NAMES.filter((storeName) => storeName !== "meta");
        await Promise.all(stores.map((storeName) => transaction.objectStore(storeName).clear()));

        const writes: Promise<unknown>[] = [];
        for (const bundle of snapshot.projects) {
          writes.push(transaction.objectStore("projects").add(bundle.project));
          writes.push(
            ...bundle.messages.map((message) => transaction.objectStore("messages").add(message))
          );
          writes.push(
            ...bundle.evidence.map((record) =>
              transaction.objectStore("repositoryEvidence").add(record)
            )
          );
          if (bundle.provenance) {
            writes.push(transaction.objectStore("repositoryProvenance").add(bundle.provenance));
          }
          writes.push(
            ...bundle.providerRuns.map((run) => transaction.objectStore("providerRuns").add(run))
          );
        }
        writes.push(
          ...snapshot.templates.map((template) =>
            transaction.objectStore("templates").add(template)
          )
        );
        if (snapshot.preferences) {
          writes.push(transaction.objectStore("preferences").add(snapshot.preferences));
        }
        if (snapshot.resume) {
          writes.push(transaction.objectStore("resume").add(snapshot.resume));
        }
        await Promise.all(writes);
        await transaction.objectStore("meta").put({
          ...metadata,
          generation,
          updatedAt: this.options.now(),
        });
        await options.beforeCommit?.();
      },
      "The vault import did not commit"
    );
    this.publish({
      generation,
      projectId: null,
      projectRevision: null,
      stores: [...VAULT_STORE_NAMES],
      reason: "generation",
    });
    return generation;
  }

  async listProjects() {
    return runRead(async () => {
      const database = await this.database();
      const projects = await database.getAll("projects");
      return projects.sort(
        (left, right) =>
          right.updatedAt - left.updatedAt ||
          right.createdAt - left.createdAt ||
          right.id.localeCompare(left.id)
      );
    }, "Projects could not be listed");
  }

  async saveProjectBundle(bundle: VaultProjectBundleWrite, precondition: VaultProjectPrecondition) {
    assertProjectRelations(bundle);
    const database = await this.database();
    const stores: VaultStoreName[] = ["meta", "projects"];
    if (bundle.messages?.length || bundle.replaceMessages) stores.push("messages");
    if (bundle.evidence?.length || bundle.replaceEvidence) stores.push("repositoryEvidence");
    if (bundle.provenance !== undefined) stores.push("repositoryProvenance");
    if (bundle.providerRuns?.length || bundle.replaceProviderRuns) stores.push("providerRuns");
    const project = await runWrite(
      database,
      stores,
      async (transaction) => {
        await assertGeneration(transaction, precondition.expectedGeneration);
        const projectStore = transaction.objectStore("projects");
        const existingProject = await projectStore.get(bundle.project.id);
        assertRevision(existingProject, precondition.expectedProjectRevision);
        const storedProject: VaultProjectRecord = {
          ...bundle.project,
          createdAt: existingProject?.createdAt ?? bundle.project.createdAt,
          revision: (existingProject?.revision ?? 0) + 1,
        };

        if (existingProject) {
          await projectStore.put(storedProject);
        } else {
          await projectStore.add(storedProject);
        }

        if (bundle.replaceMessages) {
          await deleteProjectIndexRecords(transaction, "messages", bundle.project.id);
        }
        await Promise.all(
          (bundle.messages ?? []).map((message) =>
            transaction.objectStore("messages").add({
              ...message,
              revision: 1,
            })
          )
        );

        if (bundle.replaceEvidence) {
          await deleteProjectIndexRecords(transaction, "repositoryEvidence", bundle.project.id);
        }
        await Promise.all(
          (bundle.evidence ?? []).map((evidence) =>
            transaction.objectStore("repositoryEvidence").add({
              ...evidence,
              revision: 1,
            })
          )
        );

        if (bundle.provenance === null) {
          await transaction.objectStore("repositoryProvenance").delete(bundle.project.id);
        } else if (bundle.provenance) {
          const provenanceStore = transaction.objectStore("repositoryProvenance");
          const existing = await provenanceStore.get(bundle.project.id);
          await provenanceStore.put({
            ...bundle.provenance,
            revision: (existing?.revision ?? 0) + 1,
          });
        }

        if (bundle.replaceProviderRuns) {
          await deleteProjectIndexRecords(transaction, "providerRuns", bundle.project.id);
        }
        await Promise.all(
          (bundle.providerRuns ?? []).map((providerRun) =>
            transaction.objectStore("providerRuns").add({
              ...providerRun,
              revision: 1,
            })
          )
        );

        return storedProject;
      },
      "The project mutation did not commit"
    );

    this.publish({
      generation: precondition.expectedGeneration,
      projectId: project.id,
      projectRevision: project.revision,
      stores: [
        "projects",
        ...(bundle.messages?.length || bundle.replaceMessages ? (["messages"] as const) : []),
        ...(bundle.evidence?.length || bundle.replaceEvidence
          ? (["repositoryEvidence"] as const)
          : []),
        ...(bundle.provenance !== undefined ? (["repositoryProvenance"] as const) : []),
        ...(bundle.providerRuns?.length || bundle.replaceProviderRuns
          ? (["providerRuns"] as const)
          : []),
      ],
      reason: "mutation",
    });
    return project;
  }

  async commitProviderResult(
    result: VaultProviderResultWrite,
    precondition: VaultProviderResultPrecondition
  ) {
    const database = await this.database();
    const stores: VaultStoreName[] = ["meta", "projects", "providerRuns"];
    if (result.messages?.length || result.replaceMessages) stores.push("messages");
    const committed = await runWrite(
      database,
      stores,
      async (transaction) => {
        await assertGeneration(transaction, precondition.expectedGeneration);
        const projectStore = transaction.objectStore("projects");
        const existingProject = await projectStore.get(result.project.id);
        assertRevision(existingProject, precondition.expectedProjectRevision);
        if (!existingProject) {
          throw new VaultValidationError("A provider result must reference a local project");
        }
        const project: VaultProjectRecord = {
          ...result.project,
          createdAt: existingProject.createdAt,
          revision: existingProject.revision + 1,
        };
        await projectStore.put(project);

        if (result.replaceMessages) {
          await deleteProjectIndexRecords(transaction, "messages", result.project.id);
        }
        await Promise.all(
          (result.messages ?? []).map((message) =>
            transaction.objectStore("messages").add({
              ...message,
              revision: 1,
            })
          )
        );

        const runStore = transaction.objectStore("providerRuns");
        const existingRun = await runStore.get(result.run.id);
        assertRevision(existingRun, precondition.expectedRunRevision);
        if (!existingRun || existingRun.projectId !== result.project.id) {
          throw new VaultValidationError("A provider result must reference its active draft");
        }
        const run: VaultProviderRunRecord = {
          ...result.run,
          createdAt: existingRun.createdAt,
          revision: existingRun.revision + 1,
        };
        await runStore.put(run);
        return { project, run };
      },
      "The provider result did not commit"
    );

    this.publish({
      generation: precondition.expectedGeneration,
      projectId: committed.project.id,
      projectRevision: committed.project.revision,
      stores: [
        "projects",
        "providerRuns",
        ...(result.messages?.length || result.replaceMessages ? (["messages"] as const) : []),
      ],
      reason: "mutation",
    });
    return committed;
  }

  async deleteProject(projectId: string, precondition: VaultProjectPrecondition) {
    const database = await this.database();
    await runWrite(
      database,
      [
        "meta",
        "projects",
        "messages",
        "repositoryEvidence",
        "repositoryProvenance",
        "providerRuns",
        "resume",
      ],
      async (transaction) => {
        await assertGeneration(transaction, precondition.expectedGeneration);
        const projectStore = transaction.objectStore("projects");
        const existing = await projectStore.get(projectId);
        assertRevision(existing, precondition.expectedProjectRevision);
        await Promise.all([
          deleteProjectIndexRecords(transaction, "messages", projectId),
          deleteProjectIndexRecords(transaction, "repositoryEvidence", projectId),
          deleteProjectIndexRecords(transaction, "providerRuns", projectId),
          transaction.objectStore("repositoryProvenance").delete(projectId),
        ]);
        await projectStore.delete(projectId);

        const resumeStore = transaction.objectStore("resume");
        const resume = await resumeStore.get(DEVICE_RECORD_ID);
        if (resume?.lastOpenedProjectId === projectId) {
          await resumeStore.put({
            ...resume,
            lastOpenedProjectId: null,
            revision: resume.revision + 1,
            updatedAt: this.options.now(),
          });
        }
      },
      "The project deletion did not commit"
    );
    this.publish({
      generation: precondition.expectedGeneration,
      projectId,
      projectRevision: null,
      stores: [
        "projects",
        "messages",
        "repositoryEvidence",
        "repositoryProvenance",
        "providerRuns",
        "resume",
      ],
      reason: "deletion",
    });
  }

  async recordProjectOpen(projectId: string, expectedGeneration: string) {
    const database = await this.database();
    const changed = await runWrite(
      database,
      ["meta", "projects", "resume"],
      async (transaction) => {
        await assertGeneration(transaction, expectedGeneration);
        const project = await transaction.objectStore("projects").get(projectId);
        if (!project) return false;

        const resumeStore = transaction.objectStore("resume");
        const existing = await resumeStore.get(DEVICE_RECORD_ID);
        if (existing?.lastOpenedProjectId === projectId) return false;
        await resumeStore.put({
          id: DEVICE_RECORD_ID,
          lastOpenedProjectId: projectId,
          revision: (existing?.revision ?? 0) + 1,
          updatedAt: this.options.now(),
        });
        return true;
      },
      "The resume state did not commit"
    );
    if (changed) {
      this.publish({
        generation: expectedGeneration,
        projectId,
        projectRevision: null,
        stores: ["resume"],
        reason: "mutation",
      });
    }
    return changed;
  }

  async resolveLastOpenedProject(expectedGeneration: string) {
    const database = await this.database();
    const result = await runWrite(
      database,
      ["meta", "projects", "resume"],
      async (transaction) => {
        await assertGeneration(transaction, expectedGeneration);
        const resumeStore = transaction.objectStore("resume");
        const resume = await resumeStore.get(DEVICE_RECORD_ID);
        if (resume?.lastOpenedProjectId) {
          const remembered = await transaction
            .objectStore("projects")
            .get(resume.lastOpenedProjectId);
          if (remembered) return { project: remembered, cleared: false };
          await resumeStore.put({
            ...resume,
            lastOpenedProjectId: null,
            revision: resume.revision + 1,
            updatedAt: this.options.now(),
          });
        }

        const cursor = await transaction
          .objectStore("projects")
          .index("by-updated")
          .openCursor(null, "prev");
        return { project: cursor?.value ?? null, cleared: Boolean(resume) };
      },
      "The resume state could not be resolved"
    );
    if (result.cleared) {
      this.publish({
        generation: expectedGeneration,
        projectId: null,
        projectRevision: null,
        stores: ["resume"],
        reason: "mutation",
      });
    }
    return result.project;
  }

  async getResumeRecord() {
    return runRead(async () => {
      const database = await this.database();
      return (await database.get("resume", DEVICE_RECORD_ID)) ?? null;
    }, "The resume state could not be read");
  }

  async getDevicePreferences() {
    return runRead(async () => {
      const database = await this.database();
      return (await database.get("preferences", DEVICE_RECORD_ID)) ?? null;
    }, "Device preferences could not be read");
  }

  async putDevicePreferences(
    preferences: VaultDevicePreferencesWrite,
    precondition: VaultRecordPrecondition
  ) {
    const database = await this.database();
    const result = await runWrite(
      database,
      ["meta", "preferences"],
      async (transaction) => {
        await assertGeneration(transaction, precondition.expectedGeneration);
        const store = transaction.objectStore("preferences");
        const existing = await store.get(DEVICE_RECORD_ID);
        assertRevision(existing, precondition.expectedRevision);
        const timestamp = this.options.now();
        const stored: VaultDevicePreferencesRecord = {
          id: DEVICE_RECORD_ID,
          ...preferences,
          revision: (existing?.revision ?? 0) + 1,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
        };
        await store.put(stored);
        return stored;
      },
      "The device preferences did not commit"
    );
    this.publish({
      generation: precondition.expectedGeneration,
      projectId: null,
      projectRevision: null,
      stores: ["preferences"],
      reason: "mutation",
    });
    return result;
  }

  async listTemplates() {
    return runRead(async () => {
      const database = await this.database();
      const templates = await database.getAll("templates");
      return templates.sort(
        (left, right) => right.createdAt - left.createdAt || right.id.localeCompare(left.id)
      );
    }, "Templates could not be listed");
  }

  async putTemplate(template: VaultTemplateWrite, precondition: VaultRecordPrecondition) {
    const database = await this.database();
    const result = await runWrite(
      database,
      ["meta", "templates"],
      async (transaction) => {
        await assertGeneration(transaction, precondition.expectedGeneration);
        const store = transaction.objectStore("templates");
        const existing = await store.get(template.id);
        assertRevision(existing, precondition.expectedRevision);
        const stored: VaultTemplateRecord = {
          ...template,
          createdAt: existing?.createdAt ?? template.createdAt,
          revision: (existing?.revision ?? 0) + 1,
        };
        await store.put(stored);
        return stored;
      },
      "The template did not commit"
    );
    this.publish({
      generation: precondition.expectedGeneration,
      projectId: null,
      projectRevision: null,
      stores: ["templates"],
      reason: "mutation",
    });
    return result;
  }

  async getProviderRun(runId: string) {
    return runRead(async () => {
      const database = await this.database();
      return (await database.get("providerRuns", runId)) ?? null;
    }, "The provider draft could not be read");
  }

  async putProviderRun(run: VaultProviderRunWrite, precondition: VaultRecordPrecondition) {
    const database = await this.database();
    const result = await runWrite(
      database,
      ["meta", "projects", "providerRuns"],
      async (transaction) => {
        await assertGeneration(transaction, precondition.expectedGeneration);
        const project = await transaction.objectStore("projects").get(run.projectId);
        if (!project) {
          throw new VaultValidationError("A provider draft must reference a local project");
        }
        const store = transaction.objectStore("providerRuns");
        const existing = await store.get(run.id);
        assertRevision(existing, precondition.expectedRevision);
        const stored: VaultProviderRunRecord = {
          ...run,
          createdAt: existing?.createdAt ?? run.createdAt,
          revision: (existing?.revision ?? 0) + 1,
        };
        await store.put(stored);
        return stored;
      },
      "The provider draft did not commit"
    );
    this.publish({
      generation: precondition.expectedGeneration,
      projectId: run.projectId,
      projectRevision: null,
      stores: ["providerRuns"],
      reason: "mutation",
    });
    return result;
  }

  subscribeInvalidation(listener: (invalidation: VaultInvalidation) => void) {
    this.invalidationListeners.add(listener);
    return () => this.invalidationListeners.delete(listener);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribeChannel?.();
    this.options.invalidationChannel?.close();
    this.invalidationListeners.clear();
    void this.databasePromise?.then((database) => database.close()).catch(() => undefined);
  }
}

export function createVaultRepository(options: VaultRepositoryOptions = {}): VaultRepository {
  return new IndexedDbVaultRepository({
    databaseFactory: options.databaseFactory ?? createVaultDatabaseFactory(),
    invalidationChannel:
      options.invalidationChannel === undefined
        ? createVaultInvalidationChannel()
        : options.invalidationChannel,
    now: options.now ?? Date.now,
    generationFactory: options.generationFactory ?? createId,
  });
}

let browserVaultRepository: VaultRepository | null = null;

export function getBrowserVaultRepository() {
  browserVaultRepository ??= createVaultRepository();
  return browserVaultRepository;
}
