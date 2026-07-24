import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { createId } from "@/lib/id";
import { createVaultRepository, type VaultRepository } from "./repository";
import { deleteVaultDatabase, openStackHatchVault } from "./indexed-db";
import {
  BACKUP_FORMAT_VERSION,
  BackupValidationError,
  exportProjectBackup,
  exportVaultBackup,
  prepareBackupImport,
  type StackHatchBackupPayload,
} from "./backup";

const databaseNames = new Set<string>();
const repositories = new Set<VaultRepository>();

async function repository(label: string) {
  const name = `stackhatch-backup-${label}-${createId()}`;
  databaseNames.add(name);
  const value = createVaultRepository({
    databaseFactory: () => openStackHatchVault({ name }),
    invalidationChannel: null,
    generationFactory: () => `generation-${label}-${createId()}`,
  });
  repositories.add(value);
  return value;
}

async function seed(source: VaultRepository, projectId = "project-1") {
  const generation = await source.getGeneration();
  await source.saveProjectBundle(
    {
      project: {
        id: projectId,
        name: "Private architecture",
        description: "Local requirements",
        repoUrl: "https://github.com/acme/app",
        canvasState: { nodes: [], edges: [] },
        createdAt: 1,
        updatedAt: 2,
      },
      messages: [
        {
          id: `message-${projectId}`,
          projectId,
          role: "user",
          content: "Keep this local",
          createdAt: 3,
        },
      ],
      evidence: [
        {
          id: `evidence-${projectId}`,
          projectId,
          path: "package.json",
          content: '{"name":"app"}',
          etag: null,
          createdAt: 4,
          updatedAt: 4,
        },
      ],
      provenance: {
        projectId,
        repositoryUrl: "https://github.com/acme/app",
        commitSha: "abc123",
        scannedAt: 5,
        analysisStatus: "complete",
        warning: null,
        updatedAt: 5,
      },
    },
    { expectedGeneration: generation, expectedProjectRevision: null }
  );
  await source.putTemplate(
    {
      id: "template-1",
      name: "Starter",
      description: null,
      canvasState: { nodes: [], edges: [] },
      createdAt: 6,
      updatedAt: 6,
    },
    { expectedGeneration: generation, expectedRevision: null }
  );
  await source.putDevicePreferences(
    {
      model: "claude-sonnet-5",
      theme: "dark",
      customSubtypes: {
        client: [{ slug: "kiosk", displayName: "Kiosk", icon: "Box" }],
      },
      editorDisplay: {},
    },
    { expectedGeneration: generation, expectedRevision: null }
  );
  await source.recordProjectOpen(projectId, generation);
}

async function checksum(payload: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function envelope(payload: StackHatchBackupPayload, overrides: Record<string, unknown> = {}) {
  const serializedPayload = JSON.stringify(payload);
  return JSON.stringify({
    format: "stackhatch-backup",
    formatVersion: BACKUP_FORMAT_VERSION,
    exportKind: payload.kind,
    createdAt: "2026-07-24T00:00:00.000Z",
    applicationVersion: "test",
    payload: serializedPayload,
    checksum: await checksum(serializedPayload),
    ...overrides,
  });
}

afterEach(async () => {
  for (const value of repositories) value.close();
  await Promise.all([...databaseNames].map((name) => deleteVaultDatabase(name)));
  repositories.clear();
  databaseNames.clear();
});

describe("StackHatch backups", () => {
  it("exports secret-free project and full-vault envelopes", async () => {
    const source = await repository("secret-free");
    await seed(source);
    const projectBytes = await exportProjectBackup(source, "project-1", {
      now: () => new Date("2026-07-24T00:00:00.000Z"),
      applicationVersion: "test",
    });
    const vaultBytes = await exportVaultBackup(source, {
      now: () => new Date("2026-07-24T00:00:00.000Z"),
      applicationVersion: "test",
    });

    for (const bytes of [projectBytes, vaultBytes]) {
      expect(bytes).toContain("stackhatch-backup");
      expect(bytes).not.toContain("sk-ant-secret");
      expect(bytes).not.toContain("providerRuns");
      expect(bytes).not.toContain("requestId");
    }
  });

  it("round-trips bounded project content and full-vault settings", async () => {
    const source = await repository("source");
    const target = await repository("target");
    await seed(source);
    const bytes = await exportVaultBackup(source, { applicationVersion: "test" });
    const prepared = await prepareBackupImport(target, bytes);

    expect(prepared.preview).toMatchObject({
      kind: "vault",
      projectCount: 1,
      templateCount: 1,
      conflicts: [],
    });
    expect(JSON.stringify(prepared.preview)).not.toContain("sk-ant");
    await prepared.commit("keep-both");

    expect((await target.getProjectBundle("project-1"))?.messages[0].content).toBe(
      "Keep this local"
    );
    expect((await target.getProjectBundle("project-1"))?.evidence[0].path).toBe("package.json");
    expect((await target.getDevicePreferences())?.theme).toBe("dark");
    expect(await target.listTemplates()).toHaveLength(1);
  });

  it.each([
    [
      "future version",
      async (payload: StackHatchBackupPayload) => envelope(payload, { formatVersion: 99 }),
    ],
    [
      "forged checksum",
      async (payload: StackHatchBackupPayload) => envelope(payload, { checksum: "0".repeat(64) }),
    ],
  ])("rejects %s before mutation", async (_name, build) => {
    const target = await repository("invalid-envelope");
    const payload: StackHatchBackupPayload = { kind: "project", projects: [] };
    await expect(prepareBackupImport(target, await build(payload))).rejects.toBeInstanceOf(
      BackupValidationError
    );
    expect(await target.listProjects()).toEqual([]);
  });

  it.each([
    ["prototype key", '{"kind":"project","projects":[],"__proto__":{"polluted":true}}'],
    [
      "event handler field",
      '{"kind":"project","projects":[{"project":{"id":"p","name":"P","description":null,"repoUrl":null,"canvasState":{"nodes":[{"id":"n","category":"client","subtype":"web-app","name":"N","technology":"","description":"","reasoning":"","locked":false,"onClick":"steal()"}],"edges":[]},"revision":1,"createdAt":1,"updatedAt":1},"messages":[],"evidence":[],"provenance":null}]}',
    ],
    [
      "unsafe URL",
      '{"kind":"project","projects":[{"project":{"id":"p","name":"P","description":null,"repoUrl":"javascript:alert(1)","canvasState":{"nodes":[],"edges":[]},"revision":1,"createdAt":1,"updatedAt":1},"messages":[],"evidence":[],"provenance":null}]}',
    ],
    [
      "invalid reference",
      '{"kind":"project","projects":[{"project":{"id":"p","name":"P","description":null,"repoUrl":null,"canvasState":{"nodes":[],"edges":[]},"revision":1,"createdAt":1,"updatedAt":1},"messages":[{"id":"m","projectId":"other","role":"user","content":"x","revision":1,"createdAt":1}],"evidence":[],"provenance":null}]}',
    ],
  ])("rejects hostile %s payloads", async (_name, serializedPayload) => {
    const target = await repository("hostile");
    const bytes = JSON.stringify({
      format: "stackhatch-backup",
      formatVersion: BACKUP_FORMAT_VERSION,
      exportKind: "project",
      createdAt: "2026-07-24T00:00:00.000Z",
      applicationVersion: "test",
      payload: serializedPayload,
      checksum: await checksum(serializedPayload),
    });
    await expect(prepareBackupImport(target, bytes)).rejects.toBeInstanceOf(BackupValidationError);
    expect(await target.listProjects()).toEqual([]);
  });

  it("enforces file, depth, array, record, and string limits before preview", async () => {
    const target = await repository("limits");
    const payload: StackHatchBackupPayload = { kind: "project", projects: [] };
    const bytes = await envelope(payload);
    await expect(prepareBackupImport(target, bytes, { maxBytes: 16 })).rejects.toBeInstanceOf(
      BackupValidationError
    );

    const deep = `{"kind":"project","projects":[],"extra":${"[".repeat(30)}null${"]".repeat(30)}}`;
    const deepBytes = JSON.stringify({
      format: "stackhatch-backup",
      formatVersion: BACKUP_FORMAT_VERSION,
      exportKind: "project",
      createdAt: "2026-07-24T00:00:00.000Z",
      applicationVersion: "test",
      payload: deep,
      checksum: await checksum(deep),
    });
    await expect(prepareBackupImport(target, deepBytes)).rejects.toBeInstanceOf(
      BackupValidationError
    );
  });

  it("defaults collisions to keep-both and supports skip and replace", async () => {
    const source = await repository("conflict-source");
    await seed(source);
    const bytes = await exportProjectBackup(source, "project-1", {
      applicationVersion: "test",
    });

    const keepBothTarget = await repository("keep-both");
    await seed(keepBothTarget);
    const keepBoth = await prepareBackupImport(keepBothTarget, bytes, {
      idFactory: () => "imported-copy",
    });
    expect(keepBoth.preview.defaultConflictResolution).toBe("keep-both");
    await keepBoth.commit();
    expect((await keepBothTarget.listProjects()).map((project) => project.id)).toEqual(
      expect.arrayContaining(["project-1", "imported-copy"])
    );

    const skipTarget = await repository("skip");
    await seed(skipTarget);
    const skip = await prepareBackupImport(skipTarget, bytes);
    await skip.commit("skip");
    expect(await skipTarget.listProjects()).toHaveLength(1);

    const replaceTarget = await repository("replace");
    await seed(replaceTarget);
    const replace = await prepareBackupImport(replaceTarget, bytes);
    await replace.commit("replace");
    expect(await replaceTarget.listProjects()).toHaveLength(1);
    expect((await replaceTarget.getProjectBundle("project-1"))?.messages[0].content).toBe(
      "Keep this local"
    );
  });

  it("keeps device preferences separate from project and template collision choices", async () => {
    const source = await repository("device-state-source");
    await seed(source);
    const bytes = await exportVaultBackup(source, { applicationVersion: "test" });

    async function target(label: string) {
      const value = await repository(label);
      const generation = await value.getGeneration();
      await value.putDevicePreferences(
        {
          model: "local-model",
          theme: "light",
          customSubtypes: {},
          editorDisplay: {},
        },
        { expectedGeneration: generation, expectedRevision: null }
      );
      return value;
    }

    const preserveTarget = await target("device-state-preserve");
    const preserve = await prepareBackupImport(preserveTarget, bytes);
    expect(preserve.preview.deviceStateConflicts).toContain("preferences");
    await preserve.commit("replace");
    expect((await preserveTarget.getDevicePreferences())?.model).toBe("local-model");

    const restoreTarget = await target("device-state-restore");
    const restore = await prepareBackupImport(restoreTarget, bytes);
    await restore.commit("keep-both", { restoreDeviceState: true });
    expect((await restoreTarget.getDevicePreferences())?.model).toBe("claude-sonnet-5");
  });

  it("requires a fresh preview when the vault changes after review", async () => {
    const source = await repository("latest-source");
    const target = await repository("latest-target");
    await seed(source);
    const prepared = await prepareBackupImport(
      target,
      await exportProjectBackup(source, "project-1")
    );

    const generation = await target.getGeneration();
    await target.saveProjectBundle(
      {
        project: {
          id: "created-after-preview",
          name: "Created after preview",
          description: null,
          repoUrl: null,
          canvasState: null,
          createdAt: 10,
          updatedAt: 10,
        },
      },
      { expectedGeneration: generation, expectedProjectRevision: null }
    );

    await expect(prepared.commit()).rejects.toMatchObject({ code: "conflict" });
    expect(await target.getProject("created-after-preview")).not.toBeNull();
    expect(await target.getProject("project-1")).toBeNull();
  });

  it("rolls back every record when the atomic import commit fails", async () => {
    const source = await repository("atomic-source");
    const target = await repository("atomic-target");
    await seed(source);
    await seed(target, "existing");
    const bytes = await exportVaultBackup(source, { applicationVersion: "test" });
    const before = await target.readVaultSnapshot();
    const prepared = await prepareBackupImport(target, bytes, {
      beforeCommit: () => {
        throw new Error("simulated commit failure");
      },
    });

    await expect(prepared.commit("replace")).rejects.toThrow();
    expect(await target.readVaultSnapshot()).toEqual(before);
  });
});
