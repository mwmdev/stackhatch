import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { createId } from "@/lib/id";
import {
  createVaultRepository,
  type VaultProjectBundleWrite,
  type VaultProviderRunWrite,
  type VaultRepository,
} from "./repository";
import { deleteVaultDatabase, openStackHatchVault } from "./indexed-db";
import { DEVICE_RECORD_ID } from "./schema";
import {
  VaultCommitError,
  VaultConflictError,
  VaultGenerationConflictError,
  VaultSnapshotConflictError,
} from "./storage-status";

const databaseNames = new Set<string>();
const repositories = new Set<VaultRepository>();

async function createRepository(label: string) {
  const name = `stackhatch-repository-${label}-${createId()}`;
  databaseNames.add(name);
  const repository = createVaultRepository({
    databaseFactory: () => openStackHatchVault({ name }),
    invalidationChannel: null,
  });
  repositories.add(repository);
  return repository;
}

function project(
  id: string,
  {
    name = id,
    createdAt = 1,
    updatedAt = createdAt,
  }: { name?: string; createdAt?: number; updatedAt?: number } = {}
): VaultProjectBundleWrite["project"] {
  return {
    id,
    name,
    description: null,
    repoUrl: null,
    canvasState: null,
    createdAt,
    updatedAt,
  };
}

afterEach(async () => {
  for (const repository of repositories) repository.close();
  repositories.clear();
  await Promise.all([...databaseNames].map((name) => deleteVaultDatabase(name)));
  databaseNames.clear();
});

describe("browser vault repository", () => {
  it("atomically writes and reads a complete account-free project bundle", async () => {
    const repository = await createRepository("bundle");
    const generation = await repository.getGeneration();
    const stored = await repository.saveProjectBundle(
      {
        project: project("project-1"),
        messages: [
          {
            id: "message-1",
            projectId: "project-1",
            role: "user",
            content: "Map this repository",
            createdAt: 2,
          },
        ],
        evidence: [
          {
            id: "evidence-1",
            projectId: "project-1",
            path: "package.json",
            content: "{}",
            etag: '"etag-1"',
            createdAt: 3,
            updatedAt: 3,
          },
        ],
        provenance: {
          projectId: "project-1",
          repositoryUrl: "https://github.com/example/project",
          commitSha: "abc123",
          scannedAt: 3,
          analysisStatus: "complete",
          warning: null,
          updatedAt: 3,
        },
      },
      { expectedGeneration: generation, expectedProjectRevision: null }
    );

    expect(stored.revision).toBe(1);
    const bundle = await repository.getProjectBundle("project-1");
    expect(bundle).toMatchObject({
      project: { id: "project-1", revision: 1 },
      messages: [{ id: "message-1", revision: 1 }],
      evidence: [{ id: "evidence-1", revision: 1 }],
      provenance: { projectId: "project-1", commitSha: "abc123", revision: 1 },
    });
    expect(bundle?.project).not.toHaveProperty("userId");
    await expect(repository.getProjectSnapshot("project-1")).resolves.toMatchObject({
      generation,
      project: { id: "project-1", revision: 1 },
    });
  });

  it("rolls back every store when a late child write fails", async () => {
    const repository = await createRepository("rollback");
    const generation = await repository.getGeneration();
    await repository.saveProjectBundle(
      {
        project: project("project-1", { name: "Acknowledged" }),
        messages: [
          {
            id: "message-1",
            projectId: "project-1",
            role: "user",
            content: "original",
            createdAt: 2,
          },
        ],
      },
      { expectedGeneration: generation, expectedProjectRevision: null }
    );

    await expect(
      repository.saveProjectBundle(
        {
          project: project("project-1", { name: "Must roll back", updatedAt: 5 }),
          messages: [
            {
              id: "message-1",
              projectId: "project-1",
              role: "assistant",
              content: "duplicate key",
              createdAt: 5,
            },
          ],
        },
        { expectedGeneration: generation, expectedProjectRevision: 1 }
      )
    ).rejects.toBeInstanceOf(VaultCommitError);

    expect(await repository.getProjectBundle("project-1")).toMatchObject({
      project: { name: "Acknowledged", revision: 1 },
      messages: [{ id: "message-1", content: "original" }],
    });
  });

  it("cascade deletes every project-owned record and clears resume state", async () => {
    const repository = await createRepository("cascade");
    const generation = await repository.getGeneration();
    await repository.saveProjectBundle(
      {
        project: project("project-1"),
        messages: [
          {
            id: "message-1",
            projectId: "project-1",
            role: "user",
            content: "prompt",
            createdAt: 2,
          },
        ],
        evidence: [
          {
            id: "evidence-1",
            projectId: "project-1",
            path: "README.md",
            content: "evidence",
            etag: null,
            createdAt: 2,
            updatedAt: 2,
          },
        ],
        provenance: {
          projectId: "project-1",
          repositoryUrl: "https://github.com/example/project",
          commitSha: "abc",
          scannedAt: 2,
          analysisStatus: "partial",
          warning: "README shortened",
          updatedAt: 2,
        },
        providerRuns: [
          {
            id: "run-1",
            projectId: "project-1",
            kind: "chat",
            status: "draft",
            prompt: "retry me",
            model: null,
            requestId: null,
            errorCode: null,
            expectedProjectRevision: 1,
            expectedVaultGeneration: generation,
            createdAt: 2,
            updatedAt: 2,
          },
        ],
      },
      { expectedGeneration: generation, expectedProjectRevision: null }
    );
    await repository.recordProjectOpen("project-1", generation);

    await repository.deleteProject("project-1", {
      expectedGeneration: generation,
      expectedProjectRevision: 1,
    });

    expect(await repository.getProjectBundle("project-1")).toBeNull();
    expect(await repository.getResumeRecord()).toMatchObject({
      id: DEVICE_RECORD_ID,
      lastOpenedProjectId: null,
    });
  });

  it("resolves the last opened project before deterministic updated-time fallback", async () => {
    const repository = await createRepository("resume");
    const generation = await repository.getGeneration();
    for (const record of [
      project("remembered", { createdAt: 1, updatedAt: 1 }),
      project("newer", { createdAt: 2, updatedAt: 3 }),
    ]) {
      await repository.saveProjectBundle(
        { project: record },
        { expectedGeneration: generation, expectedProjectRevision: null }
      );
    }
    await repository.recordProjectOpen("remembered", generation);

    expect(await repository.resolveLastOpenedProject(generation)).toMatchObject({
      id: "remembered",
    });
    await repository.deleteProject("remembered", {
      expectedGeneration: generation,
      expectedProjectRevision: 1,
    });
    expect(await repository.resolveLastOpenedProject(generation)).toMatchObject({
      id: "newer",
    });
  });

  it("rejects stale project revisions and stale persistent vault generations", async () => {
    const repository = await createRepository("conflict");
    const generation = await repository.getGeneration();
    await repository.saveProjectBundle(
      { project: project("project-1") },
      { expectedGeneration: generation, expectedProjectRevision: null }
    );

    await expect(
      repository.saveProjectBundle(
        { project: project("project-1", { updatedAt: 2 }) },
        { expectedGeneration: generation, expectedProjectRevision: 0 }
      )
    ).rejects.toBeInstanceOf(VaultConflictError);

    const nextGeneration = await repository.advanceVaultGeneration(generation);
    expect(nextGeneration).not.toBe(generation);
    await expect(
      repository.saveProjectBundle(
        { project: project("project-1", { updatedAt: 2 }) },
        { expectedGeneration: generation, expectedProjectRevision: 1 }
      )
    ).rejects.toBeInstanceOf(VaultGenerationConflictError);
  });

  it("rejects a full-vault replacement when any record changed after its snapshot", async () => {
    const repository = await createRepository("snapshot-conflict");
    const generation = await repository.getGeneration();
    await repository.saveProjectBundle(
      { project: project("project-1") },
      { expectedGeneration: generation, expectedProjectRevision: null }
    );
    const expected = await repository.readVaultSnapshot();
    await repository.saveProjectBundle(
      { project: project("project-2") },
      { expectedGeneration: generation, expectedProjectRevision: null }
    );

    await expect(
      repository.replaceVaultSnapshot(
        {
          projects: expected.projects,
          templates: expected.templates,
          preferences: expected.preferences,
          resume: expected.resume,
        },
        expected
      )
    ).rejects.toBeInstanceOf(VaultSnapshotConflictError);
    expect(await repository.listProjects()).toHaveLength(2);
  });

  it("persists non-secret provider drafts across repository instances", async () => {
    const name = `stackhatch-repository-provider-${createId()}`;
    databaseNames.add(name);
    const first = createVaultRepository({
      databaseFactory: () => openStackHatchVault({ name }),
      invalidationChannel: null,
    });
    repositories.add(first);
    const generation = await first.getGeneration();
    await first.saveProjectBundle(
      { project: project("project-1") },
      { expectedGeneration: generation, expectedProjectRevision: null }
    );
    const run: VaultProviderRunWrite = {
      id: "run-1",
      projectId: "project-1",
      kind: "chat",
      status: "failed",
      prompt: "Please retry this exact prompt",
      model: "claude-sonnet-5",
      requestId: "request-id",
      errorCode: "network",
      expectedProjectRevision: 1,
      expectedVaultGeneration: generation,
      createdAt: 2,
      updatedAt: 3,
    };
    await first.putProviderRun(run, {
      expectedGeneration: generation,
      expectedRevision: null,
    });
    first.close();
    repositories.delete(first);

    const reopened = createVaultRepository({
      databaseFactory: () => openStackHatchVault({ name }),
      invalidationChannel: null,
    });
    repositories.add(reopened);
    expect(await reopened.getProviderRun("run-1")).toMatchObject({
      prompt: run.prompt,
      status: "failed",
      revision: 1,
    });
    expect(await reopened.getProviderRun("run-1")).not.toHaveProperty("partialOutput");
  });

  it("owns singleton preferences and local templates without account fields", async () => {
    const repository = await createRepository("device");
    const generation = await repository.getGeneration();
    const preferences = await repository.putDevicePreferences(
      {
        model: "claude-sonnet-5",
        theme: "dark",
        customSubtypes: {},
        editorDisplay: { showNodeCategory: true },
      },
      { expectedGeneration: generation, expectedRevision: null }
    );
    const template = await repository.putTemplate(
      {
        id: "template-1",
        name: "Personal template",
        description: null,
        canvasState: { nodes: [], edges: [] },
        createdAt: 2,
        updatedAt: 2,
      },
      { expectedGeneration: generation, expectedRevision: null }
    );

    expect(preferences).toMatchObject({ id: DEVICE_RECORD_ID, revision: 1 });
    expect(template).toMatchObject({ id: "template-1", revision: 1 });
    expect(preferences).not.toHaveProperty("anthropicApiKey");
    expect(template).not.toHaveProperty("userId");
  });
});
