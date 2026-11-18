import { z } from "zod";
import { createId } from "@/lib/id";
import { CANVAS_TEXT_LIMITS } from "@/lib/canvas-limits";
import { readRepositoryFiles, type RepoSourceFile } from "@/lib/github-analyzer";
import { applyEvidencePolicy } from "@/lib/node-evidence";
import { createBrowserAiClient, type BrowserAiClient } from "@/lib/ai/browser-client";
import { buildCanvasContext, buildMessages } from "@/lib/ai/context-builder";
import { DEFAULT_ALTERNATIVES_PROMPT, DEFAULT_PRD_PROMPT } from "@/lib/ai/default-prompts";
import { ProviderError } from "@/lib/ai/provider-errors";
import {
  AI_PROVIDERS,
  formatModelReference,
  parseModelReference,
  type AiProviderId,
  type AiModelSelection,
} from "@/lib/ai/providers";
import type { CustomSubtypesMap } from "@/lib/custom-subtypes";
import { BRIEF_INSTRUCTION, buildSystemPrompt, INIT_INSTRUCTION } from "@/lib/ai/system-prompt";
import {
  getBrowserProviderKeyManager,
  ProviderKeyUnavailableError,
  type ProviderKeyManager,
  type ProviderKeyStatus,
} from "@/lib/provider-key";
import { mergeArchitecture } from "@/lib/merge-architecture";
import { GITHUB_CREDENTIAL_ID } from "@/lib/github-token";
import { createVaultLockCoordinator, type VaultLockCoordinator } from "@/lib/vault/coordination";
import { getBrowserVaultRepository, type VaultRepository } from "@/lib/vault/repository";
import type {
  VaultLocalFolder,
  VaultCanvasState,
  VaultMessageRecord,
  VaultProjectRecord,
  VaultProviderRunKind,
  VaultProviderRunRecord,
  VaultProviderRunStatus,
} from "@/lib/vault/schema";
import { VaultConflictError, VaultGenerationConflictError } from "@/lib/vault/storage-status";
import {
  NODE_CATEGORIES,
  type AlternativeNode,
  type StackArchitecture,
  type StackNode,
} from "@/types/stack";

const alternativeSchema = z.object({
  name: z.string().min(1),
  technology: z.string(),
  description: z.string(),
  reasoning: z.string(),
  category: z.enum(NODE_CATEGORIES),
  subtype: z.string().min(1),
});

const PROVIDER_RUN_LEASE_MS = 5 * 60 * 1_000;
export const ARCHITECTURE_MAX_OUTPUT_TOKENS = 8_192;

export class ProviderRunStaleError extends Error {
  readonly code = "stale";
  /** The provider the run was sent to; null when no provider was involved. */
  readonly provider: AiProviderId | null;

  constructor(
    message = "The map changed while the provider request was running. Review and retry.",
    provider: AiProviderId | null = null
  ) {
    super(message);
    this.name = "ProviderRunStaleError";
    this.provider = provider;
  }
}

export function providerErrorDetails(error: unknown): {
  code: string;
  message: string;
  /**
   * For `credentials_missing`, the provider whose key should be added; for
   * `stale`, the provider that was responding (null for a GitHub scan).
   */
  provider?: AiProviderId | null;
} {
  // A key that was never entered and a key the provider rejected need
  // different answers: one is "add a key", the other is "the key you added is
  // wrong". Only the first should send the user to set one up.
  if (error instanceof ProviderKeyUnavailableError) {
    return {
      code: "credentials_missing",
      message: error.message || "Add an AI provider key in Settings to run this.",
      provider: error.provider,
    };
  }
  if (error instanceof ProviderRunStaleError) {
    return { code: error.code, message: error.message, provider: error.provider };
  }
  if (error instanceof ProviderError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error && error.message) {
    return { code: "unknown", message: error.message };
  }
  return {
    code: "unknown",
    message: "The provider request could not be completed. Try again.",
  };
}

export interface RepositorySourceCommit {
  repositoryUrl: string;
  commitSha: string;
  excludedPaths: string[];
  analysisStatus: "complete" | "partial";
  warning: string | null;
}

export interface ProviderRunRequest {
  projectId: string;
  kind: VaultProviderRunKind;
  prompt?: string;
  /** Sent after the prompt in a repository-generation run; never stored. */
  sourceContext?: string;
  /** Files a repository-generation run may cite as node evidence: the scan's `citablePaths`. */
  citablePaths?: readonly string[];
  selection?: AiModelSelection;
  customSubtypes?: CustomSubtypesMap;
  localFolder?: VaultLocalFolder;
  /** Approved GitHub source for a repository-generation run; committed with the map. */
  repositorySource?: RepositorySourceCommit;
  targetNode?: StackNode;
  runId?: string;
  retryRunId?: string;
  signal?: AbortSignal;
  onText?: (text: string, delta: string) => void;
  beforeCommit?: () => Promise<void>;
}

export interface ProviderRunOutcome {
  run: VaultProviderRunRecord;
  project: VaultProjectRecord;
  generation: string;
  text: string;
  message: string;
  architecture: StackArchitecture | null;
  alternatives: AlternativeNode[] | null;
  prd: string | null;
}

export interface NodeSourcesOutcome {
  node: StackNode;
  repositoryUrl: string;
  commitSha: string;
  files: RepoSourceFile[];
  /** Linked paths that returned nothing: directories, binary files, or failed reads. */
  omitted: string[];
}

interface ProviderRunCoordinatorOptions {
  repository: VaultRepository;
  keyManager: ProviderKeyManager;
  ai?: BrowserAiClient;
  locks?: VaultLockCoordinator;
  readRepositoryFiles?: typeof readRepositoryFiles;
  idFactory?: () => string;
  now?: () => number;
}

export interface ProviderRunCoordinator {
  /** The key status of the provider the device's model preference selects. */
  getKeyStatus(): Promise<ProviderKeyStatus>;
  listMessages(projectId: string): Promise<VaultMessageRecord[]>;
  /** Reads a saved node's evidence files from GitHub at the scanned revision. */
  readNodeSources(
    projectId: string,
    nodeId: string,
    options?: { signal?: AbortSignal }
  ): Promise<NodeSourcesOutcome>;
  run(request: ProviderRunRequest): Promise<ProviderRunOutcome>;
  close(): void;
}

function recordWithoutRevision<T extends { revision: number }>(record: T): Omit<T, "revision"> {
  const { revision: _revision, ...write } = record;
  return write;
}

function projectWrite(project: VaultProjectRecord, canvasState: VaultCanvasState | null) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    repoUrl: project.repoUrl,
    ...(project.localFolder ? { localFolder: project.localFolder } : {}),
    canvasState,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function parseAlternatives(text: string, providerName: string): AlternativeNode[] {
  const invalid = () =>
    new ProviderError(
      "invalid_output",
      `${providerName} returned invalid alternatives. The map was preserved.`
    );
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw invalid();

  let value: unknown;
  try {
    value = JSON.parse(match[0]);
  } catch {
    throw invalid();
  }
  const parsed = z.array(alternativeSchema).min(1).max(5).safeParse(value);
  if (!parsed.success) throw invalid();
  return parsed.data.map((alternative) => ({
    ...alternative,
    name: alternative.name.slice(0, CANVAS_TEXT_LIMITS.nodeName),
    technology: alternative.technology.slice(0, CANVAS_TEXT_LIMITS.nodeTechnology),
    subtype: alternative.subtype.slice(0, CANVAS_TEXT_LIMITS.nodeSubtype),
  }));
}

function promptForAlternatives(canvas: StackArchitecture, node: StackNode) {
  return `${buildCanvasContext(canvas)}
Current node to find alternatives for:
- Name: ${node.name}
- Technology: ${node.technology}
- Category: ${node.category}
- Subtype: ${node.subtype}
- Description: ${node.description}

Suggest 3-5 alternative technologies for this node's role. Keep the same category and subtype unless the alternative fundamentally changes the approach.`;
}

function promptForPrd(project: VaultProjectRecord, canvas: StackArchitecture) {
  return `Project: ${project.name}

${buildCanvasContext(canvas)}
Raw architecture JSON:
\`\`\`json
${JSON.stringify(canvas, null, 2)}
\`\`\`

Generate a detailed PRD for this architecture.`;
}

function isStaleStorageError(error: unknown) {
  return error instanceof VaultConflictError || error instanceof VaultGenerationConflictError;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("The provider request was cancelled.", "AbortError");
  }
}

function failureStatus(error: unknown): {
  status: VaultProviderRunStatus;
  code: string;
  requestId: string | null;
} {
  if (error instanceof ProviderRunStaleError || isStaleStorageError(error)) {
    return { status: "stale", code: "stale", requestId: null };
  }
  if (error instanceof ProviderError) {
    return {
      status: error.code === "aborted" ? "cancelled" : "failed",
      code: error.code,
      requestId: error.requestId,
    };
  }
  return { status: "failed", code: "unknown", requestId: null };
}

/** The GitHub token a scan sends, or null to read public repositories anonymously. */
export async function githubTokenForScan(keyManager: ProviderKeyManager): Promise<string | null> {
  const status = await keyManager.getStatus(GITHUB_CREDENTIAL_ID);
  if (status.state === "absent") return null;
  return keyManager.getKeyForDispatch(GITHUB_CREDENTIAL_ID);
}

export function createProviderRunCoordinator(
  options: ProviderRunCoordinatorOptions
): ProviderRunCoordinator {
  const ai = options.ai ?? createBrowserAiClient();
  let locks = options.locks;
  const idFactory = options.idFactory ?? createId;
  const now = options.now ?? Date.now;
  let closed = false;

  function ensureOpen() {
    if (closed) throw new ProviderError("invalid_request", "Provider actions are unavailable.");
  }

  function lockCoordinator() {
    locks ??= createVaultLockCoordinator();
    return locks;
  }

  async function updateRun(
    run: VaultProviderRunRecord,
    status: VaultProviderRunStatus,
    values: { errorCode?: string | null; requestId?: string | null } = {}
  ) {
    const current = await options.repository.getProviderRun(run.id);
    if (!current) return run;
    return options.repository.putProviderRun(
      {
        ...recordWithoutRevision(current),
        status,
        errorCode: values.errorCode ?? null,
        requestId: values.requestId ?? current.requestId,
        updatedAt: now(),
      },
      {
        expectedGeneration: current.expectedVaultGeneration,
        expectedRevision: current.revision,
      }
    );
  }

  async function markFailure(run: VaultProviderRunRecord, error: unknown) {
    const failure = failureStatus(error);
    try {
      await updateRun(run, failure.status, {
        errorCode: failure.code,
        requestId: failure.requestId,
      });
    } catch {
      // A clear or generation change must not be undone just to retain retry metadata.
    }
  }

  return {
    async getKeyStatus() {
      ensureOpen();
      const preferences = await options.repository.getDevicePreferences();
      return options.keyManager.getStatus(parseModelReference(preferences?.model).provider);
    },

    async listMessages(projectId) {
      ensureOpen();
      return options.repository.listProjectMessages(projectId);
    },

    async readNodeSources(projectId, nodeId, readOptions = {}) {
      ensureOpen();
      const bundle = await options.repository.getProjectBundle(projectId);
      const node = bundle?.project.canvasState?.nodes.find((candidate) => candidate.id === nodeId);
      if (!bundle?.provenance || !node?.evidence?.length) {
        throw new ProviderError(
          "invalid_request",
          "This component has no repository files to read."
        );
      }
      // Evidence belongs to the commit the map was generated from, which a
      // later scan with a failed regeneration leaves behind `commitSha`.
      const { repositoryUrl } = bundle.provenance;
      const commitSha = bundle.provenance.mapCommitSha ?? bundle.provenance.commitSha;
      const { files, omitted } = await (options.readRepositoryFiles ?? readRepositoryFiles)(
        repositoryUrl,
        commitSha,
        node.evidence,
        { signal: readOptions.signal, githubToken: await githubTokenForScan(options.keyManager) }
      );
      return { node, repositoryUrl, commitSha, files, omitted };
    },

    async run(request) {
      ensureOpen();
      let run: VaultProviderRunRecord | null = null;
      let dispatchedProvider: AiProviderId | null = null;

      try {
        const captured = await lockCoordinator().withProjectLock(
          request.projectId,
          async () => {
            const [bundle, generation, preferences] = await Promise.all([
              options.repository.getProjectBundle(request.projectId),
              options.repository.getGeneration(),
              options.repository.getDevicePreferences(),
            ]);
            if (!bundle) {
              throw new ProviderError("invalid_request", "The local map is no longer available.");
            }
            const selection = request.selection ?? parseModelReference(preferences?.model);
            const keyStatus = await options.keyManager.getStatus(selection.provider);
            if (keyStatus.state === "absent") {
              // Distinct from "authentication", which means the provider saw a
              // key and rejected it. Collapsing the two told a user with a
              // typo'd key to add the key they had already added.
              throw new ProviderKeyUnavailableError(
                `Add your ${AI_PROVIDERS[selection.provider].name} API key before starting this request.`,
                selection.provider
              );
            }

            const currentCanvas = bundle.project.canvasState;
            let prompt = request.prompt?.trim() ?? "";
            let targetNode: StackNode | undefined;
            if (request.kind === "initialization") {
              // A brief is a set of answers, not a reason to start asking.
              prompt =
                prompt ||
                (bundle.project.description
                  ? `${BRIEF_INSTRUCTION}\n\nRequirements brief:\n${bundle.project.description}`
                  : INIT_INSTRUCTION);
            } else if (request.kind === "repository-generation") {
              if (!prompt || Boolean(request.localFolder) === Boolean(request.repositorySource)) {
                throw new ProviderError(
                  "invalid_request",
                  "Review the selected files before generating a map."
                );
              }
            } else if (request.kind === "alternatives") {
              if (!currentCanvas || !request.targetNode) {
                throw new ProviderError(
                  "invalid_request",
                  "Choose a node on a saved map before requesting alternatives."
                );
              }
              targetNode = currentCanvas.nodes.find((node) => node.id === request.targetNode?.id);
              if (!targetNode) {
                throw new ProviderError(
                  "invalid_request",
                  "That component is no longer present on the saved map."
                );
              }
              prompt = promptForAlternatives(currentCanvas, targetNode);
            } else if (request.kind === "prd") {
              if (!currentCanvas?.nodes.length) {
                throw new ProviderError(
                  "invalid_request",
                  "Add at least one saved component before generating a PRD."
                );
              }
              prompt = promptForPrd(bundle.project, currentCanvas);
            } else if (!prompt) {
              throw new ProviderError("invalid_request", "Enter a message first.");
            }

            const timestamp = now();
            let existing = request.retryRunId
              ? await options.repository.getProviderRun(request.retryRunId)
              : null;
            for (const activeRun of bundle.providerRuns.filter(
              (providerRun) => providerRun.status === "running"
            )) {
              if (timestamp - activeRun.updatedAt < PROVIDER_RUN_LEASE_MS) {
                throw new ProviderError(
                  "invalid_request",
                  "Another provider request is already running for this map."
                );
              }
              const staleRun = await options.repository.putProviderRun(
                {
                  ...recordWithoutRevision(activeRun),
                  status: "stale",
                  errorCode: "interrupted",
                  updatedAt: timestamp,
                },
                {
                  expectedGeneration: generation,
                  expectedRevision: activeRun.revision,
                }
              );
              if (existing?.id === staleRun.id) existing = staleRun;
            }
            if (request.retryRunId && !existing) {
              throw new ProviderError(
                "invalid_request",
                "This provider draft is no longer available to retry."
              );
            }
            if (
              existing &&
              (existing.projectId !== request.projectId ||
                existing.kind !== request.kind ||
                existing.prompt !== prompt ||
                !["failed", "stale", "cancelled"].includes(existing.status))
            ) {
              throw new ProviderError("invalid_request", "This provider draft cannot be retried.");
            }

            const model = formatModelReference(selection);
            const nextRun = existing
              ? await options.repository.putProviderRun(
                  {
                    ...recordWithoutRevision(existing),
                    status: "running",
                    model,
                    requestId: null,
                    errorCode: null,
                    expectedProjectRevision: bundle.project.revision,
                    expectedVaultGeneration: generation,
                    updatedAt: timestamp,
                  },
                  { expectedGeneration: generation, expectedRevision: existing.revision }
                )
              : await options.repository.putProviderRun(
                  {
                    id: request.runId ?? idFactory(),
                    projectId: request.projectId,
                    kind: request.kind,
                    status: "running",
                    prompt,
                    model,
                    requestId: null,
                    errorCode: null,
                    expectedProjectRevision: bundle.project.revision,
                    expectedVaultGeneration: generation,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                  },
                  { expectedGeneration: generation, expectedRevision: null }
                );
            run = nextRun;
            return {
              bundle,
              generation,
              credentialGeneration: keyStatus.generation,
              customSubtypes: request.customSubtypes ?? preferences?.customSubtypes ?? {},
              targetNode,
              run: nextRun,
            };
          },
          request.signal
        );

        const { provider, model } = parseModelReference(captured.run.model);
        dispatchedProvider = provider;
        const providerName = AI_PROVIDERS[provider].name;
        const key = await options.keyManager.getKeyForDispatch(provider);
        const dispatchStatus = await options.keyManager.getStatus(provider);
        if (dispatchStatus.generation !== captured.credentialGeneration) {
          throw new ProviderRunStaleError(
            `The ${providerName} key changed before dispatch. Review and retry.`,
            provider
          );
        }

        const history = captured.bundle.messages.map((message) => ({
          id: message.id,
          projectId: message.projectId,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
        }));
        let providerMessages;
        let system: string;
        if (request.kind === "alternatives") {
          providerMessages = [{ role: "user" as const, content: captured.run.prompt }];
          system = DEFAULT_ALTERNATIVES_PROMPT;
        } else if (request.kind === "prd") {
          providerMessages = [{ role: "user" as const, content: captured.run.prompt }];
          system = DEFAULT_PRD_PROMPT;
        } else if (request.kind === "repository-generation") {
          providerMessages = [
            {
              role: "user" as const,
              content: request.sourceContext
                ? `${captured.run.prompt}\n\n${request.sourceContext}`
                : captured.run.prompt,
            },
          ];
          system = buildSystemPrompt(captured.customSubtypes, { includeNoteNodes: true });
        } else {
          providerMessages = buildMessages(history, captured.bundle.project.canvasState, {
            nodeLockingEnabled: true,
          });
          providerMessages.push({ role: "user", content: captured.run.prompt });
          if (providerMessages[0]?.role !== "user") {
            providerMessages.unshift({ role: "user", content: INIT_INSTRUCTION });
          }
          system = buildSystemPrompt(captured.customSubtypes, { includeNoteNodes: true });
        }

        const providerResult = await ai.stream({
          provider,
          apiKey: key,
          model,
          messages: providerMessages,
          system,
          maxTokens:
            request.kind === "alternatives"
              ? 1_024
              : request.kind === "prd"
                ? 4_096
                : ARCHITECTURE_MAX_OUTPUT_TOKENS,
          signal: request.signal,
          requireArchitecture: request.kind === "repository-generation",
          allowNoteNodes: true,
          onText: request.onText,
        });
        if (
          request.kind === "repository-generation" &&
          (!providerResult.architecture || providerResult.architecture.nodes.length === 0)
        ) {
          throw new ProviderError(
            "invalid_output",
            `${providerName} did not return a usable repository map. The previous map was preserved.`,
            { requestId: providerResult.requestId }
          );
        }

        const alternatives =
          request.kind === "alternatives"
            ? parseAlternatives(providerResult.text, providerName)
            : null;
        const prd =
          request.kind === "prd"
            ? providerResult.text.trim() ||
              (() => {
                throw new ProviderError(
                  "invalid_output",
                  `${providerName} returned an empty PRD. The map was preserved.`
                );
              })()
            : null;

        await request.beforeCommit?.();
        throwIfAborted(request.signal);

        const committed = await lockCoordinator().withProjectLock(
          request.projectId,
          async () => {
            throwIfAborted(request.signal);
            const [bundle, generation, keyStatus] = await Promise.all([
              options.repository.getProjectBundle(request.projectId),
              options.repository.getGeneration(),
              options.keyManager.getStatus(provider),
            ]);
            if (
              !bundle ||
              generation !== captured.generation ||
              bundle.project.revision !== captured.bundle.project.revision ||
              keyStatus.generation !== captured.credentialGeneration
            ) {
              throw new ProviderRunStaleError(undefined, provider);
            }

            let canvasState = bundle.project.canvasState;
            if (providerResult.architecture) {
              const incoming = applyEvidencePolicy(
                providerResult.architecture,
                canvasState,
                request.kind === "repository-generation" ? new Set(request.citablePaths) : null
              );
              const architecture =
                request.kind === "repository-generation" || !canvasState?.nodes.length
                  ? incoming
                  : mergeArchitecture(canvasState, incoming, [], {
                      nodeLockingEnabled: true,
                    }).architecture;
              const mergedIds = new Set(architecture.nodes.map((node) => node.id));
              canvasState = {
                ...architecture,
                ...(canvasState?.layout ? { layout: canvasState.layout } : {}),
                ...(request.kind === "repository-generation"
                  ? {}
                  : {
                      ...(canvasState?.positions
                        ? {
                            positions: Object.fromEntries(
                              Object.entries(canvasState.positions).filter(([id]) =>
                                mergedIds.has(id)
                              )
                            ),
                          }
                        : {}),
                      ...(canvasState?.alternatives
                        ? {
                            alternatives: Object.fromEntries(
                              Object.entries(canvasState.alternatives).filter(([id]) =>
                                mergedIds.has(id)
                              )
                            ),
                          }
                        : {}),
                    }),
              };
            }
            if (alternatives && captured.targetNode && canvasState) {
              canvasState = {
                ...canvasState,
                alternatives: {
                  ...(canvasState.alternatives ?? {}),
                  [captured.targetNode.id]: alternatives,
                },
              };
            }

            const timestamp = now();
            const messages: Array<Omit<VaultMessageRecord, "revision">> = [];
            if (
              request.kind === "chat" ||
              request.kind === "initialization" ||
              request.kind === "repository-generation"
            ) {
              messages.push(
                {
                  id: `${captured.run.id}:user`,
                  projectId: request.projectId,
                  role: "user",
                  content: captured.run.prompt,
                  createdAt: timestamp - 1,
                },
                {
                  id: `${captured.run.id}:assistant`,
                  projectId: request.projectId,
                  role: "assistant",
                  content: providerResult.text,
                  createdAt: timestamp,
                }
              );
            }

            const completedRun = {
              ...captured.run,
              status: "completed" as const,
              prompt: "",
              requestId: providerResult.requestId,
              errorCode: null,
              updatedAt: timestamp,
            };
            const repositorySource = request.repositorySource;
            // A repository map replaces any local folder the project was bound to.
            const { localFolder: _discarded, ...canvasProject } = projectWrite(
              bundle.project,
              canvasState
            );
            const committed = await options.repository.commitProviderResult(
              {
                project: {
                  ...(repositorySource ? canvasProject : projectWrite(bundle.project, canvasState)),
                  ...(request.localFolder
                    ? { localFolder: request.localFolder, repoUrl: null }
                    : {}),
                  ...(repositorySource ? { repoUrl: repositorySource.repositoryUrl } : {}),
                  updatedAt: timestamp,
                },
                messages,
                replaceMessages: request.kind === "repository-generation",
                ...(request.localFolder ? { clearRepositorySource: true } : {}),
                ...(repositorySource
                  ? {
                      repositoryProvenance: {
                        repositoryUrl: repositorySource.repositoryUrl,
                        commitSha: repositorySource.commitSha,
                        mapCommitSha: repositorySource.commitSha,
                        scannedAt: timestamp,
                        analysisStatus: repositorySource.analysisStatus,
                        warning: repositorySource.warning,
                        excludedPaths: repositorySource.excludedPaths,
                      },
                    }
                  : {}),
                run: recordWithoutRevision(completedRun),
              },
              {
                expectedGeneration: generation,
                expectedProjectRevision: bundle.project.revision,
                expectedRunRevision: captured.run.revision,
              }
            );
            return {
              ...committed,
              generation,
              architecture: providerResult.architecture ? canvasState : null,
            };
          },
          request.signal
        );

        return {
          ...providerResult,
          ...committed,
          alternatives,
          prd,
        };
      } catch (error) {
        if (run) await markFailure(run, error);
        if (isStaleStorageError(error))
          throw new ProviderRunStaleError(undefined, dispatchedProvider);
        throw error;
      }
    },

    close() {
      closed = true;
      options.repository.close();
    },
  };
}

let browserProviderRunCoordinator: ProviderRunCoordinator | null = null;

export function getBrowserProviderRunCoordinator() {
  browserProviderRunCoordinator ??= createProviderRunCoordinator({
    repository: getBrowserVaultRepository(),
    keyManager: getBrowserProviderKeyManager(),
  });
  return browserProviderRunCoordinator;
}
