import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "@/lib/ai/provider-errors";
import {
  createProviderRunCoordinator,
  providerErrorDetails,
  ProviderRunStaleError,
} from "@/lib/ai/provider-run";
import type { BrowserAiClient } from "@/lib/ai/browser-client";
import type { ProviderStreamResult } from "@/lib/ai/provider-stream";
import type { AiProviderId } from "@/lib/ai/providers";
import type { CredentialId, ProviderKeyManager, ProviderKeyStatus } from "@/lib/provider-key";
import type { VaultLockCoordinator } from "@/lib/vault/coordination";
import { openStackHatchVault, deleteVaultDatabase } from "@/lib/vault/indexed-db";
import { createVaultRepository, type VaultRepository } from "@/lib/vault/repository";
import type { StackArchitecture } from "@/types/stack";

const databases = new Set<string>();
const repositories = new Set<VaultRepository>();

const locks: VaultLockCoordinator = {
  withGlobalLock: async (callback) => callback(),
  withProjectLock: async (_projectId, callback) => callback(),
  withGlobalProjectLock: async (_projectId, callback) => callback(),
};

function keyManager(
  initial: Omit<ProviderKeyStatus, "provider"> = { state: "session", generation: "key-1" }
) {
  let status = initial;
  const dispatched: CredentialId[] = [];
  const manager: ProviderKeyManager & {
    setStatus(next: Omit<ProviderKeyStatus, "provider">): void;
    dispatched: CredentialId[];
  } = {
    // Generations differ per provider, so checking the wrong provider's
    // generation at dispatch or commit reads as a stale key. No GitHub token
    // is set, so scans read GitHub anonymously.
    getStatus: async (provider) => ({
      provider,
      state: provider === "github" ? "absent" : status.state,
      generation: `${status.generation}:${provider}`,
    }),
    useSessionKey: async (provider) => ({ provider, ...status }),
    rememberKey: async (provider) => ({ provider, ...status }),
    forgetKey: async (provider) => ({ provider, ...status }),
    forgetAllKeys: async () => undefined,
    getKeyForDispatch: async (provider) => {
      if (status.state === "absent" || provider === "github") throw new Error("missing");
      dispatched.push(provider);
      return `key-for-${provider}`;
    },
    close: vi.fn(),
    setStatus(next) {
      status = next;
    },
    dispatched,
  };
  return manager;
}

async function repository(label: string) {
  const name = `stackhatch-provider-run-${label}-${crypto.randomUUID()}`;
  databases.add(name);
  const value = createVaultRepository({
    databaseFactory: () => openStackHatchVault({ name }),
    invalidationChannel: null,
  });
  repositories.add(value);
  const generation = await value.getGeneration();
  await value.saveProjectBundle(
    {
      project: {
        id: "project-1",
        name: "Private map",
        description: "A local architecture",
        repoUrl: null,
        canvasState: {
          nodes: [
            {
              id: "locked-client",
              category: "client",
              subtype: "web-app",
              name: "Locked client",
              technology: "React",
              description: "Browser",
              reasoning: "Existing choice",
              locked: true,
            },
          ],
          edges: [],
        },
        createdAt: 1,
        updatedAt: 1,
      },
    },
    { expectedGeneration: generation, expectedProjectRevision: null }
  );
  return value;
}

function architecture(name = "Generated API"): StackArchitecture {
  return {
    nodes: [
      {
        id: "locked-client",
        category: "client",
        subtype: "web-app",
        name: "Changed client",
        technology: "Other",
        description: "Should not replace locked",
        reasoning: "Generated",
        locked: false,
      },
      {
        id: "api",
        category: "api",
        subtype: "rest-api",
        name,
        technology: "Hono",
        description: "API",
        reasoning: "Small",
        locked: false,
      },
    ],
    edges: [],
  };
}

function client(run: BrowserAiClient["stream"]): BrowserAiClient {
  return { stream: vi.fn(run) };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

afterEach(async () => {
  for (const value of repositories) value.close();
  repositories.clear();
  await Promise.all([...databases].map((name) => deleteVaultDatabase(name)));
  databases.clear();
});

describe("browser provider-run coordinator", () => {
  it("pins local approval settings and commits source identity only with a successful map", async () => {
    const vault = await repository("local-replacement");
    const manager = keyManager();
    const ai = client(async () => ({
      text: "Generated",
      message: "Generated",
      architecture: architecture(),
      requestId: "local-request",
    }));
    const initial = (await vault.getProjectBundle("project-1"))!;
    await vault.saveProjectBundle({
      project: { ...initial.project, repoUrl: "https://github.com/acme/app" },
      provenance: {
        projectId: "project-1", repositoryUrl: "https://github.com/acme/app",
        commitSha: "old", scannedAt: 1, analysisStatus: "complete", warning: null, updatedAt: 1,
      },
      evidence: [{ id: "old-evidence", projectId: "project-1", path: "README.md", content: "old", etag: null, createdAt: 1, updatedAt: 1 }],
    }, { expectedGeneration: await vault.getGeneration(), expectedProjectRevision: initial.project.revision });
    const coordinator = createProviderRunCoordinator({ repository: vault, keyManager: manager, ai, locks });
    const original = (await vault.getProjectBundle("project-1"))!;
    expect(original.provenance).not.toBeNull();
    const request = {
      projectId: "project-1",
      kind: "repository-generation" as const,
      prompt: "Map local",
      sourceContext: "source",
      citablePaths: ["src/app.ts"],
      selection: { provider: "openai" as const, model: "gpt-6.1-sol" },
      customSubtypes: {},
      localFolder: { name: "new-folder", excludedPaths: ["private"] },
    };
    vi.mocked(ai.stream).mockRejectedValueOnce(new Error("failed"));
    await expect(coordinator.run(request)).rejects.toThrow();
    const failed = (await vault.getProjectBundle("project-1"))!;
    expect(failed.project.repoUrl).toBe(original.project.repoUrl);
    expect(failed.project.localFolder).toBeUndefined();
    expect(failed.provenance).toEqual(original.provenance);
    expect(failed.evidence).toEqual(original.evidence);
    await coordinator.run(request);
    const committed = (await vault.getProjectBundle("project-1"))!;
    expect(manager.dispatched).toEqual(["openai", "openai"]);
    expect(committed.project.localFolder).toEqual(request.localFolder);
    expect(committed.project.repoUrl).toBeNull();
    expect(committed.provenance).toBeNull();
    expect(committed.evidence).toEqual([]);
  });

  it("preserves local folder metadata when generation replaces the map", async () => {
    const vault = await repository("local-folder");
    const bundle = (await vault.getProjectBundle("project-1"))!;
    const localFolder = { name: "fixture", excludedPaths: ["engine"] };
    await vault.saveProjectBundle(
      { project: { ...bundle.project, localFolder } },
      {
        expectedGeneration: await vault.getGeneration(),
        expectedProjectRevision: bundle.project.revision,
      }
    );
    const ai = client(async () => ({
      text: "Generated",
      message: "Generated",
      architecture: architecture(),
      requestId: "local-request",
    }));
    const coordinator = createProviderRunCoordinator({
      repository: vault,
      keyManager: keyManager(),
      ai,
      locks,
    });
    await coordinator.run({
      projectId: "project-1",
      kind: "repository-generation",
      prompt: "Map fixture.",
      sourceContext: "PRIVATE_SOURCE_CONTEXT",
      localFolder,
    });
    expect((await vault.getProjectBundle("project-1"))?.project.localFolder).toEqual(localFolder);
    expect(ai.stream).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", content: "Map fixture.\n\nPRIVATE_SOURCE_CONTEXT" }],
      })
    );
    const saved = (await vault.getProjectBundle("project-1"))!;
    expect(saved.messages.find((message) => message.role === "user")?.content).toBe("Map fixture.");
    expect(JSON.stringify(saved)).not.toContain("PRIVATE_SOURCE_CONTEXT");
  });

  it("allows only one live provider request per map", async () => {
    const vault = await repository("single-flight");
    const firstResult = deferred<ProviderStreamResult>();
    const ai = client(() => firstResult.promise);
    const coordinator = createProviderRunCoordinator({
      repository: vault,
      keyManager: keyManager(),
      ai,
      locks,
      idFactory: (() => {
        let id = 0;
        return () => `run-live-${++id}`;
      })(),
      now: () => 100,
    });

    const first = coordinator.run({
      projectId: "project-1",
      kind: "chat",
      prompt: "First",
    });
    await vi.waitFor(() => expect(ai.stream).toHaveBeenCalledOnce());

    await expect(
      coordinator.run({ projectId: "project-1", kind: "chat", prompt: "Second" })
    ).rejects.toMatchObject({
      code: "invalid_request",
      message: expect.stringContaining("already running"),
    });

    firstResult.resolve({
      text: "Done",
      message: "Done",
      architecture: null,
      requestId: "req-live",
    });
    await first;
  });

  it("requires retry drafts to exist and be in a retryable terminal state", async () => {
    const vault = await repository("retry-validation");
    const coordinator = createProviderRunCoordinator({
      repository: vault,
      keyManager: keyManager(),
      ai: client(vi.fn()),
      locks,
    });

    await expect(
      coordinator.run({
        projectId: "project-1",
        kind: "chat",
        prompt: "Missing",
        retryRunId: "missing-run",
      })
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("uses an uploaded brief as the answers instead of interviewing for them", async () => {
    // The brief states what the interview would ask, so re-asking makes the
    // user answer their own document.
    const vault = await repository("brief");
    let sent = "";
    const ai = client(async (request) => {
      sent = request.messages.map((message) => message.content).join("\n");
      return { text: "Drafted", message: "Drafted", architecture: null, requestId: "req-1" };
    });
    const coordinator = createProviderRunCoordinator({
      repository: vault,
      keyManager: keyManager(),
      ai,
      locks,
      idFactory: () => "run-1",
      now: () => 10,
    });

    await coordinator.run({ projectId: "project-1", kind: "initialization" });

    expect(sent).toContain("Requirements brief");
    expect(sent).toContain("A local architecture");
    expect(sent).toContain("do not ask them again");
    expect(sent).not.toContain("Begin the architecture interview");
  });

  it("commits a complete chat result once and preserves locked nodes", async () => {
    const vault = await repository("chat");
    await vault.putDevicePreferences(
      {
        model: "claude-sonnet-5",
        theme: "dark",
        customSubtypes: {
          services: [{ slug: "edge-worker", displayName: "Edge Worker", icon: "Cloud" }],
        },
        editorDisplay: {},
      },
      { expectedGeneration: await vault.getGeneration(), expectedRevision: null }
    );
    const onText = vi.fn();
    const ai = client(async (request) => {
      expect(request.messages.some((message) => message.content.includes('"locked":true'))).toBe(
        true
      );
      expect(request.system).toContain("edge-worker");
      request.onText?.("Working", "Working");
      return {
        text: "Updated",
        message: "Updated",
        architecture: architecture(),
        requestId: "req-1",
      };
    });
    const coordinator = createProviderRunCoordinator({
      repository: vault,
      keyManager: keyManager(),
      ai,
      locks,
      idFactory: () => "run-1",
      now: () => 10,
    });

    const outcome = await coordinator.run({
      projectId: "project-1",
      kind: "chat",
      prompt: "Add an API",
      onText,
    });

    expect(onText).toHaveBeenCalledWith("Working", "Working");
    expect(outcome.run).toMatchObject({ id: "run-1", status: "completed" });
    expect(outcome.project.canvasState?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "locked-client", name: "Locked client", locked: true }),
        expect.objectContaining({ id: "api", name: "Generated API" }),
      ])
    );
    const bundle = await vault.getProjectBundle("project-1");
    expect(bundle?.messages.map(({ id, role }) => ({ id, role }))).toEqual([
      { id: "run-1:user", role: "user" },
      { id: "run-1:assistant", role: "assistant" },
    ]);
    expect(bundle?.providerRuns).toEqual([
      expect.objectContaining({ id: "run-1", status: "completed", requestId: "req-1" }),
    ]);
  });

  it("prunes positions and alternatives when chat replaces an unlocked node", async () => {
    const vault = await repository("prune-node-metadata");
    const bundle = (await vault.getProjectBundle("project-1"))!;
    const oldNode = { ...architecture().nodes[1], id: "old" };
    await vault.saveProjectBundle(
      {
        ...bundle,
        project: {
          ...bundle.project,
          canvasState: {
            nodes: [...bundle.project.canvasState!.nodes, oldNode],
            edges: [],
            positions: { old: { x: 10, y: 20 }, "locked-client": { x: 1, y: 2 } },
            alternatives: {
              old: [
                {
                  name: "Old alternative",
                  technology: "Old",
                  category: "api",
                  subtype: "rest-api",
                  description: "",
                  reasoning: "",
                },
              ],
            },
          },
        },
      },
      {
        expectedGeneration: await vault.getGeneration(),
        expectedProjectRevision: bundle.project.revision,
      }
    );
    const coordinator = createProviderRunCoordinator({
      repository: vault,
      keyManager: keyManager(),
      ai: client(async () => ({
        text: "Replaced",
        message: "Replaced",
        architecture: architecture(),
        requestId: "request-prune",
      })),
      locks,
      idFactory: () => "run-prune",
      now: () => 10,
    });

    const outcome = await coordinator.run({
      projectId: "project-1",
      kind: "chat",
      prompt: "Replace old",
    });
    expect(outcome.project.canvasState?.positions).toEqual({ "locked-client": { x: 1, y: 2 } });
    expect(outcome.project.canvasState?.alternatives).toEqual({});
    expect((await vault.getProject("project-1"))?.canvasState).toMatchObject({
      positions: { "locked-client": { x: 1, y: 2 } },
      alternatives: {},
    });
  });

  it("keeps a newer canvas and a retryable stale draft when revision CAS fails", async () => {
    const vault = await repository("stale");
    const ai = client(async () => {
      const current = await vault.getProject("project-1");
      const generation = await vault.getGeneration();
      await vault.saveProjectBundle(
        {
          project: {
            id: current!.id,
            name: current!.name,
            description: current!.description,
            repoUrl: current!.repoUrl,
            canvasState: architecture("Newer manual API"),
            createdAt: current!.createdAt,
            updatedAt: 20,
          },
        },
        { expectedGeneration: generation, expectedProjectRevision: current!.revision }
      );
      return {
        text: "Late output",
        message: "Late output",
        architecture: architecture("Late API"),
        requestId: "req-late",
      };
    });
    const coordinator = createProviderRunCoordinator({
      repository: vault,
      keyManager: keyManager(),
      ai,
      locks,
      idFactory: () => "run-stale",
    });

    await expect(
      coordinator.run({ projectId: "project-1", kind: "chat", prompt: "Change it" })
    ).rejects.toBeInstanceOf(ProviderRunStaleError);

    expect((await vault.getProject("project-1"))?.canvasState?.nodes).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Newer manual API" })])
    );
    expect(await vault.getProviderRun("run-stale")).toMatchObject({ status: "stale" });
    expect((await vault.getProjectBundle("project-1"))?.messages).toEqual([]);
  });

  it("retries the same failed draft without duplicating its user message", async () => {
    const vault = await repository("retry");
    let attempt = 0;
    const ai = client(async () => {
      attempt += 1;
      if (attempt === 1) {
        throw new ProviderError("transient", "Anthropic could not complete the request.", {
          retryable: true,
        });
      }
      return {
        text: "Recovered",
        message: "Recovered",
        architecture: null,
        requestId: "req-retry",
      };
    });
    const coordinator = createProviderRunCoordinator({
      repository: vault,
      keyManager: keyManager(),
      ai,
      locks,
      idFactory: () => "run-retry",
    });

    await expect(
      coordinator.run({ projectId: "project-1", kind: "chat", prompt: "Explain it" })
    ).rejects.toMatchObject({ code: "transient" });
    expect(await vault.getProviderRun("run-retry")).toMatchObject({ status: "failed" });

    await coordinator.run({
      projectId: "project-1",
      kind: "chat",
      prompt: "Explain it",
      retryRunId: "run-retry",
    });

    expect(
      (await vault.getProjectBundle("project-1"))?.messages.map((message) => message.id)
    ).toEqual(["run-retry:user", "run-retry:assistant"]);
  });

  it("rejects late output after the active credential generation changes", async () => {
    const vault = await repository("credential");
    const keys = keyManager();
    const ai = client(async () => {
      keys.setStatus({ state: "absent", generation: "key-2" });
      return {
        text: "Late",
        message: "Late",
        architecture: architecture(),
        requestId: "req-forgotten",
      };
    });
    const coordinator = createProviderRunCoordinator({
      repository: vault,
      keyManager: keys,
      ai,
      locks,
      idFactory: () => "run-forgotten",
    });

    await expect(
      coordinator.run({ projectId: "project-1", kind: "chat", prompt: "Change it" })
    ).rejects.toMatchObject({ name: "ProviderRunStaleError", provider: "anthropic" });
    expect((await vault.getProjectBundle("project-1"))?.messages).toEqual([]);
  });

  it.each([
    ["openrouter:moonshotai/kimi-k3", "openrouter", "moonshotai/kimi-k3"],
    // The preference held a bare Anthropic id before providers could be chosen.
    ["claude-opus-4-8", "anthropic", "claude-opus-4-8"],
  ] as const)(
    "sends %s to its provider with that provider's key",
    async (stored, provider, model) => {
      const vault = await repository(`selection-${provider}`);
      await vault.putDevicePreferences(
        { model: stored, theme: "system", customSubtypes: {}, editorDisplay: {} },
        { expectedGeneration: await vault.getGeneration(), expectedRevision: null }
      );
      const keys = keyManager();
      const ai = client(async () => ({
        text: "Routed",
        message: "Routed",
        architecture: null,
        requestId: null,
      }));
      const coordinator = createProviderRunCoordinator({
        repository: vault,
        keyManager: keys,
        ai,
        locks,
        idFactory: () => "run-routed",
      });

      const outcome = await coordinator.run({ projectId: "project-1", kind: "chat", prompt: "Hi" });

      expect(ai.stream).toHaveBeenCalledWith(
        expect.objectContaining({ provider, model, apiKey: `key-for-${provider}` })
      );
      expect(keys.dispatched).toEqual([provider]);
      expect(outcome.run.model).toBe(`${provider}:${model}`);
      await expect(coordinator.getKeyStatus()).resolves.toMatchObject({ provider });
    }
  );

  it("asks for the selected provider's key without dispatching when it is missing", async () => {
    const vault = await repository("missing-provider-key");
    await vault.putDevicePreferences(
      { model: "gemini:gemini-3.8-flash", theme: "system", customSubtypes: {}, editorDisplay: {} },
      { expectedGeneration: await vault.getGeneration(), expectedRevision: null }
    );
    const ai = client(vi.fn());
    const coordinator = createProviderRunCoordinator({
      repository: vault,
      keyManager: keyManager({ state: "absent", generation: "key-1" }),
      ai,
      locks,
    });

    const failure = coordinator.run({ projectId: "project-1", kind: "chat", prompt: "Hi" });

    await expect(failure).rejects.toMatchObject({
      name: "ProviderKeyUnavailableError",
      provider: "gemini",
      message: expect.stringContaining("Google Gemini"),
    });
    expect(providerErrorDetails(await failure.catch((error: unknown) => error))).toMatchObject({
      code: "credentials_missing",
      provider: "gemini",
    });
    expect(ai.stream).not.toHaveBeenCalled();
  });

  it("lets a repository map cite only approved files and reads them at the approved revision", async () => {
    const vault = await repository("node-sources");
    const generated = architecture();
    generated.nodes[1].evidence = ["src/api.ts", "src/invented.ts"];
    const readFiles = vi.fn(async () => ({
      files: [{ path: "src/api.ts", content: "export {};", truncated: false }],
      omitted: ["src/gone.ts"],
    }));
    const repositorySource = { repositoryUrl: "https://github.com/acme/app", commitSha: "abc123", excludedPaths: ["web"], analysisStatus: "complete" as const, warning: null };
    const coordinator = createProviderRunCoordinator({
      repository: vault,
      keyManager: keyManager(),
      ai: client(async () => ({
        text: "<stack>{}</stack>",
        message: "",
        architecture: generated,
        requestId: "req-1",
      })),
      locks,
      readRepositoryFiles: readFiles,
    });

    await coordinator.run({
      projectId: "project-1",
      kind: "repository-generation",
      prompt: "Map approved files",
      citablePaths: ["src/api.ts"],
      repositorySource,
    });

    const sources = await coordinator.readNodeSources("project-1", "api");
    expect(sources).toMatchObject({
      node: { id: "api", evidence: ["src/api.ts"] },
      commitSha: "abc123",
      files: [{ path: "src/api.ts" }],
    });
    expect(readFiles).toHaveBeenCalledWith(
      "https://github.com/acme/app",
      "abc123",
      ["src/api.ts"],
      expect.objectContaining({ githubToken: null })
    );
    // A node without evidence has nothing to read, so GitHub is not contacted.
    await expect(coordinator.readNodeSources("project-1", "locked-client")).rejects.toMatchObject({
      code: "invalid_request",
    });
    expect(readFiles).toHaveBeenCalledTimes(1);

  });

  it.each([false, true])("commits GitHub provenance only on success (failure: %s)", async (fail) => {
    const vault = await repository(`github-commit-${fail}`);
    const initial = (await vault.getProjectBundle("project-1"))!;
    await vault.saveProjectBundle({
      project: { ...initial.project, localFolder: { name: "old", excludedPaths: [] } },
      provenance: { projectId: "project-1", repositoryUrl: "https://github.com/old/repo", commitSha: "old", scannedAt: 1, analysisStatus: "complete", warning: null, updatedAt: 1 },
      evidence: [{ id: "old-evidence", projectId: "project-1", path: "README.md", content: "old source", etag: null, createdAt: 1, updatedAt: 1 }],
    }, { expectedGeneration: await vault.getGeneration(), expectedProjectRevision: initial.project.revision });
    const before = (await vault.getProjectBundle("project-1"))!;
    const coordinator = createProviderRunCoordinator({
      repository: vault, keyManager: keyManager(), locks,
      ai: client(async () => {
        if (fail) throw new Error("stream failed");
        return { text: "Generated", message: "Generated", architecture: architecture(), requestId: "github" };
      }),
    });
    const source = { repositoryUrl: "https://github.com/acme/app", commitSha: "abc123", excludedPaths: ["web"], analysisStatus: "complete" as const, warning: null };
    const run = coordinator.run({ projectId: "project-1", kind: "repository-generation", prompt: "Map", repositorySource: source });
    if (fail) {
      await expect(run).rejects.toThrow();
      const after = (await vault.getProjectBundle("project-1"))!;
      expect(after.project).toEqual(before.project);
      expect(after.provenance).toEqual(before.provenance);
      expect(after.evidence).toEqual(before.evidence);
    } else {
      await run;
      const after = (await vault.getProjectBundle("project-1"))!;
      expect(after.project.repoUrl).toBe(source.repositoryUrl);
      expect(after.project.localFolder).toBeUndefined();
      expect(after.provenance).toMatchObject({ commitSha: "abc123", mapCommitSha: "abc123", excludedPaths: ["web"] });
      expect(after.evidence).toEqual([]);
    }
  });

  it("rejects repository generation without an approved source", async () => {
    const vault = await repository("missing-source");
    const ai = client(vi.fn());
    const coordinator = createProviderRunCoordinator({ repository: vault, keyManager: keyManager(), ai, locks });
    await expect(coordinator.run({ projectId: "project-1", kind: "repository-generation", prompt: "Map" })).rejects.toMatchObject({ code: "invalid_request" });
    expect(ai.stream).not.toHaveBeenCalled();
  });
  it("resolves alternatives against the current saved node", async () => {
    const vault = await repository("stale-node");
    const coordinator = createProviderRunCoordinator({
      repository: vault,
      keyManager: keyManager(),
      ai: client(vi.fn()),
      locks,
    });

    await expect(
      coordinator.run({
        projectId: "project-1",
        kind: "alternatives",
        targetNode: { ...architecture().nodes[1], id: "removed-node" },
      })
    ).rejects.toMatchObject({
      code: "invalid_request",
      message: expect.stringContaining("no longer present"),
    });
  });

  it("stores alternatives atomically and keeps PRD text out of chat history", async () => {
    const vault = await repository("outputs");
    const ai = client(async (request) =>
      request.system === "unused"
        ? {
            text: "",
            message: "",
            architecture: null,
            requestId: null,
          }
        : {
            text:
              request.maxTokens === 1_024
                ? JSON.stringify([
                    {
                      name: "V".repeat(201),
                      technology: "T".repeat(201),
                      description: "Client",
                      reasoning: "Alternative",
                      category: "client",
                      subtype: "s".repeat(81),
                    },
                  ])
                : "# Private PRD",
            message: "",
            architecture: null,
            requestId: "req-output",
          }
    );
    const coordinator = createProviderRunCoordinator({
      repository: vault,
      keyManager: keyManager(),
      ai,
      locks,
      idFactory: (() => {
        let id = 0;
        return () => `run-output-${++id}`;
      })(),
    });
    const node = (await vault.getProject("project-1"))!.canvasState!.nodes[0];

    const alternatives = await coordinator.run({
      projectId: "project-1",
      kind: "alternatives",
      targetNode: node,
    });
    const prd = await coordinator.run({ projectId: "project-1", kind: "prd" });

    expect(alternatives.alternatives?.[0]).toMatchObject({
      name: "V".repeat(200),
      technology: "T".repeat(200),
      subtype: "s".repeat(80),
    });
    expect(
      (await vault.getProject("project-1"))?.canvasState?.alternatives?.[node.id]
    ).toHaveLength(1);
    expect(prd.prd).toBe("# Private PRD");
    expect((await vault.getProjectBundle("project-1"))?.messages).toEqual([]);
  });
});
