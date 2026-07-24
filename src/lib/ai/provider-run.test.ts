import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "@/lib/ai/provider-errors";
import {
  createProviderRunCoordinator,
  ProviderRunStaleError,
  repositoryPrompt,
} from "@/lib/ai/provider-run";
import type { BrowserAnthropicClient } from "@/lib/ai/browser-client";
import type { ProviderKeyManager, ProviderKeyStatus } from "@/lib/provider-key";
import type { VaultLockCoordinator } from "@/lib/vault/coordination";
import { openStackHatchVault, deleteVaultDatabase } from "@/lib/vault/indexed-db";
import { createVaultRepository, type VaultRepository } from "@/lib/vault/repository";
import type { RepoAnalysis } from "@/lib/github-analyzer";
import type { StackArchitecture } from "@/types/stack";

const databases = new Set<string>();
const repositories = new Set<VaultRepository>();

const locks: VaultLockCoordinator = {
  withGlobalLock: async (callback) => callback(),
  withProjectLock: async (_projectId, callback) => callback(),
  withGlobalProjectLock: async (_projectId, callback) => callback(),
};

function keyManager(initial: ProviderKeyStatus = { state: "session", generation: "key-1" }) {
  let status = initial;
  const manager: ProviderKeyManager & { setStatus(next: ProviderKeyStatus): void } = {
    initialize: async () => status,
    getStatus: async () => status,
    useSessionKey: async () => status,
    rememberKey: async () => status,
    forgetKey: async () => status,
    getKeyForDispatch: async () => {
      if (status.state === "absent") throw new Error("missing");
      return "sk-ant-test";
    },
    close: vi.fn(),
    setStatus(next) {
      status = next;
    },
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

function client(run: BrowserAnthropicClient["stream"]): BrowserAnthropicClient {
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
  it("allows only one live provider request per map", async () => {
    const vault = await repository("single-flight");
    const firstResult = deferred<Awaited<ReturnType<BrowserAnthropicClient["stream"]>>>();
    const anthropic = client(() => firstResult.promise);
    const coordinator = createProviderRunCoordinator({
      repository: vault,
      keyManager: keyManager(),
      anthropic,
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
    await vi.waitFor(() => expect(anthropic.stream).toHaveBeenCalledOnce());

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
      anthropic: client(vi.fn()),
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
    const anthropic = client(async (request) => {
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
      anthropic,
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

  it("keeps a newer canvas and a retryable stale draft when revision CAS fails", async () => {
    const vault = await repository("stale");
    const anthropic = client(async () => {
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
      anthropic,
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
    const anthropic = client(async () => {
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
      anthropic,
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
    const anthropic = client(async () => {
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
      anthropic,
      locks,
      idFactory: () => "run-forgotten",
    });

    await expect(
      coordinator.run({ projectId: "project-1", kind: "chat", prompt: "Change it" })
    ).rejects.toBeInstanceOf(ProviderRunStaleError);
    expect((await vault.getProjectBundle("project-1"))?.messages).toEqual([]);
  });

  it("persists reviewed GitHub evidence without invoking Anthropic", async () => {
    const vault = await repository("github");
    const analysis: RepoAnalysis = {
      owner: "acme",
      repo: "app",
      normalizedUrl: "https://github.com/acme/app",
      description: "App",
      primaryLanguage: "TypeScript",
      languages: { TypeScript: 1 },
      topics: [],
      defaultBranch: "main",
      commitSha: "abc123",
      treePaths: ["src/app.ts"],
      readme: "# App",
      evidenceFiles: [
        {
          path: "package.json",
          content: "{}",
          etag: '"v1"',
          fromCache: false,
          truncated: false,
        },
      ],
      status: "complete",
      warnings: [],
    };
    const anthropic = client(vi.fn());
    const coordinator = createProviderRunCoordinator({
      repository: vault,
      keyManager: keyManager(),
      anthropic,
      locks,
      analyzeRepository: vi.fn(async () => analysis),
      idFactory: (() => {
        let id = 0;
        return () => `evidence-${++id}`;
      })(),
      now: () => 30,
    });

    const result = await coordinator.scanRepository("project-1", "https://github.com/acme/app");

    expect(anthropic.stream).not.toHaveBeenCalled();
    expect(result.project.repoUrl).toBe("https://github.com/acme/app");
    expect((await vault.getProjectBundle("project-1"))?.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "README.md", content: "# App" }),
        expect.objectContaining({ path: "package.json", etag: '"v1"' }),
      ])
    );
    expect(repositoryPrompt(analysis)).toContain("Revision: main @ abc123");

    vi.mocked(anthropic.stream).mockResolvedValue({
      text: '<stack>{"nodes":[],"edges":[]}</stack>',
      message: "",
      architecture: { nodes: [], edges: [] },
      requestId: "req-empty",
    });
    await expect(
      coordinator.run({
        projectId: "project-1",
        kind: "repository-generation",
        prompt: repositoryPrompt(analysis),
      })
    ).rejects.toMatchObject({ code: "invalid_output" });
    expect((await vault.getProjectBundle("project-1"))?.evidence).toHaveLength(2);
  });

  it("keeps a newer project revision when a GitHub scan finishes late", async () => {
    const vault = await repository("github-stale");
    const analysisResult = deferred<RepoAnalysis>();
    const coordinator = createProviderRunCoordinator({
      repository: vault,
      keyManager: keyManager(),
      anthropic: client(vi.fn()),
      locks,
      analyzeRepository: () => analysisResult.promise,
    });

    const scan = coordinator.scanRepository("project-1", "acme/app");
    await Promise.resolve();
    const current = (await vault.getProject("project-1"))!;
    await vault.saveProjectBundle(
      {
        project: {
          ...current,
          name: "Newer local name",
          updatedAt: 20,
        },
      },
      {
        expectedGeneration: await vault.getGeneration(),
        expectedProjectRevision: current.revision,
      }
    );
    analysisResult.resolve({
      owner: "acme",
      repo: "app",
      normalizedUrl: "https://github.com/acme/app",
      description: null,
      primaryLanguage: null,
      languages: {},
      topics: [],
      defaultBranch: "main",
      commitSha: "late",
      treePaths: [],
      readme: null,
      evidenceFiles: [],
      status: "complete",
      warnings: [],
    });

    await expect(scan).rejects.toBeInstanceOf(ProviderRunStaleError);
    expect(await vault.getProject("project-1")).toMatchObject({
      name: "Newer local name",
      repoUrl: null,
    });
  });

  it("resolves alternatives against the current saved node", async () => {
    const vault = await repository("stale-node");
    const coordinator = createProviderRunCoordinator({
      repository: vault,
      keyManager: keyManager(),
      anthropic: client(vi.fn()),
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
    const anthropic = client(async (request) =>
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
                      name: "Vue",
                      technology: "Vue 4",
                      description: "Client",
                      reasoning: "Alternative",
                      category: "client",
                      subtype: "web-app",
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
      anthropic,
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

    expect(alternatives.alternatives?.[0]).toMatchObject({ technology: "Vue 4" });
    expect(
      (await vault.getProject("project-1"))?.canvasState?.alternatives?.[node.id]
    ).toHaveLength(1);
    expect(prd.prd).toBe("# Private PRD");
    expect((await vault.getProjectBundle("project-1"))?.messages).toEqual([]);
  });
});
