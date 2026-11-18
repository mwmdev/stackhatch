"use client";

import { useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import Modal from "@/components/ui/Modal";
import GitHubTokenField from "./GitHubTokenField";
import ProviderKeyField from "./ProviderKeyField";
import {
  AI_PROVIDER_IDS,
  AI_PROVIDERS,
  DEFAULT_AI_SELECTION,
  MODEL_PRICES_AS_OF,
  modelOption,
  normalizeModelId,
  type AiModelSelection,
  type AiProviderId,
} from "@/lib/ai/providers";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { githubTokenForScan, type RepositorySourceCommit } from "@/lib/ai/provider-run";
import {
  GITHUB_TOKEN_RECOVERABLE_CODES,
  RepoAnalysisError,
  listRepositoryFiles,
  parseGitHubRepoReference,
  readGitHubQuota,
  type GitHubQuota,
  type RepositorySnapshot,
} from "@/lib/github-analyzer";
import { getBrowserProviderKeyManager, type ProviderKeyManager } from "@/lib/provider-key";
import type { WorkspaceVault } from "@/lib/vault/workspace";
import { enumerateFolder, type EnumerationResult } from "@/lib/local-source/enumerate";
import { LocalSourceError } from "@/lib/local-source/errors";
import {
  buildFolderTree,
  folderCheckState,
  hasExcludedAncestor,
  isPathIncluded,
  normalizeExcludedPaths,
  toggleFolder,
  type FolderTreeNode,
} from "@/lib/local-source/folder-tree";
import {
  buildLocalGeneration,
  estimateLocalGeneration,
  localFolderSubject,
  repositorySubject,
  formatTokenCount,
  formatUsd,
  type ApprovedLocalGeneration,
  type GenerationSubject,
} from "@/lib/local-source/generation";
import { ESTIMATED_CHARACTERS_PER_TOKEN, LOCAL_SOURCE_LIMITS } from "@/lib/local-source/limits";

export type ReviewSource =
  | { kind: "local"; handle: FileSystemDirectoryHandle }
  | { kind: "github"; repositoryUrl: string };

export interface SourceApproval {
  /** The folder name, or the repository (with its directory); capped to the folder-name limit. */
  name: string;
  excludedPaths: string[];
  generation: ApprovedLocalGeneration;
  /** Set only for a GitHub source. */
  repository: RepositorySourceCommit | null;
}

export interface SourceReviewDialogProps {
  source: ReviewSource;
  initialExcludedPaths: readonly string[];
  replacesMap: boolean;
  aiSettings: Pick<
    WorkspaceVault,
    "getAiSelection" | "getCustomSubtypes" | "selectAiProvider" | "selectAiModel"
  >;
  keyManager?: ProviderKeyManager;
  /** Test seam for GitHub reads; defaults to the global fetch. */
  githubFetch?: typeof globalThis.fetch;
  onCancel: () => void;
  onApprove: (approval: SourceApproval) => void;
  invokerRef?: RefObject<HTMLElement | null>;
  inertSelector?: string;
}

function FolderRow({
  node,
  excluded,
  onToggle,
  preparing,
}: {
  node: FolderTreeNode;
  excluded: ReadonlySet<string>;
  onToggle: (path: string) => void;
  preparing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const checkbox = useRef<HTMLInputElement>(null);
  const locked = hasExcludedAncestor(node.path, excluded);
  const state = locked ? "unchecked" : folderCheckState(node.path, excluded);
  useEffect(() => {
    if (checkbox.current) checkbox.current.indeterminate = state === "mixed";
  }, [state]);
  return (
    <li className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-2 py-1">
        {node.children.length > 0 ? (
          <button
            type="button"
            className="btn btn--quiet btn--sm shrink-0"
            aria-label={`${expanded ? "Hide" : "Show"} ${node.name}/`}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronDown className="size-4" aria-hidden="true" />
            ) : (
              <ChevronRight className="size-4" aria-hidden="true" />
            )}
          </button>
        ) : (
          <span className="w-7 shrink-0" />
        )}
        <label className="field-check min-w-0">
          <input
            ref={checkbox}
            type="checkbox"
            checked={state === "checked"}
            disabled={locked || preparing}
            onChange={() => onToggle(node.path)}
          />
          <span className="break-all">{node.name}/</span>
        </label>
        <span className="type-small text-ink2">
          {node.files} files · ~{formatTokenCount(node.bytes / ESTIMATED_CHARACTERS_PER_TOKEN)}{" "}
          tokens
        </span>
      </div>
      {expanded && (
        <ul className="m-0 list-none pl-4">
          {node.children.map((child) => (
            <FolderRow
              key={child.path}
              node={child}
              excluded={excluded}
              onToggle={onToggle}
              preparing={preparing}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

const number = (value: number) =>
  new Intl.NumberFormat("en-US").format(value >= 1_000 ? Math.round(value / 1_000) * 1_000 : value);

export default function SourceReviewDialog({
  source,
  initialExcludedPaths,
  replacesMap,
  aiSettings,
  keyManager,
  githubFetch,
  onCancel,
  onApprove,
  invokerRef,
  inertSelector,
}: SourceReviewDialogProps) {
  const handle = source.kind === "local" ? source.handle : null;
  const repositoryUrl = source.kind === "github" ? source.repositoryUrl : null;
  const [manager] = useState(() => keyManager ?? getBrowserProviderKeyManager());
  const [result, setResult] = useState<EnumerationResult | null>(null);
  const [entries, setEntries] = useState(0);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const initialExclusions = useRef(initialExcludedPaths);
  const [selection, setSelection] = useState<AiModelSelection>(DEFAULT_AI_SELECTION);
  const [selectionReady, setSelectionReady] = useState(false);
  const [customSubtypes, setCustomSubtypes] = useState<
    ApprovedLocalGeneration["customSubtypes"] | null
  >(null);
  const [custom, setCustom] = useState(false);
  const [keyReadyFor, setKeyReadyFor] = useState<AiProviderId | null>(null);
  const [readError, setReadError] = useState("");
  const [repository, setRepository] = useState<RepositorySnapshot | null>(null);
  const [quota, setQuota] = useState<GitHubQuota | null>(null);
  const [readFailure, setReadFailure] = useState<RepoAnalysisError | null>(null);
  const [buildFailure, setBuildFailure] = useState<RepoAnalysisError | null>(null);
  const [quotaPending, setQuotaPending] = useState(false);
  const listingToken = useRef<string | null>(null);
  const [githubTokenVersion, setGithubTokenVersion] = useState(0);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const preparingRef = useRef(false);
  const id = useId();
  const tree = useMemo(() => buildFolderTree(result?.files ?? []), [result]);

  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    if (handle) {
      void enumerateFolder(handle, {
        signal: abort.signal,
        now: () => performance.now(),
        onProgress: setEntries,
      })
        .then((next) => {
          if (abort.signal.aborted) return;
          setExcluded(new Set(normalizeExcludedPaths(initialExclusions.current)));
          setResult(next);
        })
        .catch((failure) => {
          if (abort.signal.aborted) return;
          setReadError(
            failure instanceof LocalSourceError
              ? failure.message
              : "StackHatch could not read that folder. Check the browser's permission and try again."
          );
        });
    } else if (repositoryUrl) {
      setResult(null);
      setRepository(null);
      setQuota(null);
      setReadError("");
      setReadFailure(null);
      setBuildFailure(null);
      setError("");
      setProgress(null);
      setQuotaPending(true);
      void (async () => {
        const token = await githubTokenForScan(manager);
        listingToken.current = token;
        const listing = await listRepositoryFiles(repositoryUrl, {
          signal: abort.signal,
          githubToken: token,
          fetch: githubFetch,
        });
        if (abort.signal.aborted) return;
        setRepository(listing.snapshot);
        setExcluded(new Set(normalizeExcludedPaths(initialExclusions.current)));
        setResult(listing.enumeration);
        const remaining = await readGitHubQuota({
          signal: abort.signal,
          githubToken: token,
          fetch: githubFetch,
        });
        if (!abort.signal.aborted) {
          setQuota(remaining);
          setQuotaPending(false);
        }
      })().catch((failure) => {
        if (abort.signal.aborted) return;
        setQuotaPending(false);
        if (failure instanceof RepoAnalysisError) {
          setReadFailure(failure);
          setReadError(failure.message);
        } else {
          setReadError("StackHatch could not read that repository. Try again in a moment.");
        }
      });
    }
    return () => abort.abort();
  }, [handle, repositoryUrl, githubTokenVersion, manager, githubFetch]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([aiSettings.getAiSelection(), aiSettings.getCustomSubtypes()])
      .then(([next, subtypes]) => {
        if (cancelled) return;
        setSelection(next);
        setCustom(modelOption(next) === null);
        setCustomSubtypes(subtypes);
        setSelectionReady(true);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load AI settings. Close this dialog and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [aiSettings]);

  useEffect(() => {
    let cancelled = false;
    void manager
      .getStatus(selection.provider)
      .then((status) => {
        if (!cancelled) setKeyReadyFor(status.state !== "absent" ? selection.provider : null);
      })
      .catch(() => {
        if (!cancelled) setKeyReadyFor(null);
      });
    return () => {
      cancelled = true;
    };
  }, [manager, selection.provider]);

  const included = useMemo(
    () => result?.files.filter((file) => isPathIncluded(file.path, excluded)) ?? [],
    [result, excluded]
  );
  const rootFilePaths = useMemo(
    () => result?.files.filter((file) => !file.path.includes("/")).map((file) => file.path) ?? [],
    [result]
  );
  const rootFilesIncluded = rootFilePaths.some((path) => !excluded.has(path));
  const validModel = normalizeModelId(selection.model);
  const option = validModel
    ? modelOption({ provider: selection.provider, model: validModel })
    : null;
  const subject = useMemo<GenerationSubject>(
    () =>
      handle
        ? localFolderSubject(handle.name)
        : repository
          ? repositorySubject(repository)
          : {
              kind: "GitHub repository",
              label: "Repository",
              name: repositoryUrl ?? "",
              details: [],
            },
    [handle, repository, repositoryUrl]
  );
  const estimate = estimateLocalGeneration({
    files: included,
    subject,
    systemPromptCharacters: buildSystemPrompt(customSubtypes ?? undefined, {
      includeNoteNodes: true,
    }).length,
    option,
  });
  const normalizedExclusions = normalizeExcludedPaths([...excluded]);
  const preparing = progress !== null;
  const overQuota = repositoryUrl !== null && quota !== null && included.length > quota.remaining;
  const githubOwner = repositoryUrl ? parseGitHubRepoReference(repositoryUrl)?.owner : undefined;
  const activeFailure = readFailure ?? buildFailure;
  const tokenRecovery =
    activeFailure !== null &&
    (GITHUB_TOKEN_RECOVERABLE_CODES.has(activeFailure.code) ||
      (activeFailure.code === "github_rate_limited" && !activeFailure.tokenUsed));
  const title =
    handle?.name ??
    (repositoryUrl ? (parseGitHubRepoReference(repositoryUrl)?.shorthand ?? repositoryUrl) : "");

  /** Reads the repository again with the token just set, keeping the folders already unchecked. */
  function relistWithToken() {
    initialExclusions.current = normalizeExcludedPaths([...excluded]);
    setGithubTokenVersion((version) => version + 1);
  }
  const disabled =
    !selectionReady ||
    !included.length ||
    !estimate.fits ||
    !estimate.preparationFits ||
    normalizedExclusions.length > LOCAL_SOURCE_LIMITS.maxExcludedPaths ||
    customSubtypes === null ||
    keyReadyFor !== selection.provider ||
    !validModel ||
    preparing ||
    overQuota ||
    quotaPending;
  const skippedFiles = Object.values(result?.excludedFileCounts ?? {}).reduce(
    (sum, count) => sum + count,
    0
  );
  const skippedDirectories = result?.excludedDirectoryCount ?? 0;

  function cancel() {
    controller.current?.abort();
    onCancel();
  }

  async function approve() {
    if (disabled || preparingRef.current || !validModel || customSubtypes === null) return;
    preparingRef.current = true;
    setBuildFailure(null);
    const signal = controller.current!.signal;
    try {
      if (repositoryUrl) {
        // The token may have been replaced or forgotten since the listing read it.
        const token = await githubTokenForScan(manager);
        if (token !== listingToken.current) {
          initialExclusions.current = normalizeExcludedPaths([...excluded]);
          setGithubTokenVersion((version) => version + 1);
          return;
        }
      }
      setProgress({ done: 0, total: included.length });
      setError("");
      const approvedSelection = { provider: selection.provider, model: validModel };
      await aiSettings.selectAiModel(approvedSelection);
      signal.throwIfAborted();
      const generation = await buildLocalGeneration({
        subject,
        files: included,
        signal,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      signal.throwIfAborted();
      if (!generation.citablePaths.length) {
        setError("None of the selected files could be sent.");
        return;
      }
      const approved = { ...generation, selection: approvedSelection, customSubtypes };
      if (handle) {
        onApprove({
          name: handle.name.slice(0, LOCAL_SOURCE_LIMITS.maxFolderNameLength),
          excludedPaths: normalizedExclusions,
          generation: approved,
          repository: null,
        });
      } else if (repository) {
        const parsed = parseGitHubRepoReference(repository.normalizedUrl)!;
        onApprove({
          name: (parsed.subpath ? `${parsed.repo}/${parsed.subpath}` : parsed.repo).slice(
            0,
            LOCAL_SOURCE_LIMITS.maxFolderNameLength
          ),
          excludedPaths: normalizedExclusions,
          generation: approved,
          repository: {
            repositoryUrl: repository.normalizedUrl,
            commitSha: repository.commitSha,
            excludedPaths: normalizedExclusions,
            analysisStatus: repository.treeTruncated ? "partial" : "complete",
            warning: repository.treeTruncated
              ? "GitHub returned only part of the file tree."
              : null,
          },
        });
      }
    } catch (failure) {
      if (
        !signal.aborted &&
        handle &&
        failure instanceof LocalSourceError &&
        failure.code === "files-changed"
      ) {
        setResult(null);
        try {
          const next = await enumerateFolder(handle, {
            signal,
            now: () => performance.now(),
            onProgress: setEntries,
          });
          if (!signal.aborted) {
            setResult(next);
            setExcluded((current) => new Set(normalizeExcludedPaths([...current])));
            setError(
              "Files changed while preparing. Review the refreshed folder and approve again."
            );
          }
        } catch (refreshFailure) {
          if (!signal.aborted)
            setReadError(
              refreshFailure instanceof LocalSourceError
                ? refreshFailure.message
                : "StackHatch could not read that folder. Check the browser's permission and try again."
            );
        }
      } else if (!signal.aborted) {
        setError(
          failure instanceof Error
            ? failure.message
            : "The selected files could not be prepared. Try again."
        );
        if (failure instanceof RepoAnalysisError) {
          setBuildFailure(failure);
          void githubTokenForScan(manager)
            .then((token) => readGitHubQuota({ signal, githubToken: token, fetch: githubFetch }))
            .then((remaining) => {
              if (!signal.aborted && remaining) setQuota(remaining);
            })
            .catch(() => {});
        }
      }
    } finally {
      preparingRef.current = false;
      if (!signal.aborted) setProgress(null);
    }
  }

  return (
    <Modal
      open
      title={`Map ${title}`}
      onClose={cancel}
      size="md"
      data-testid="source-review-dialog"
      invokerRef={invokerRef}
      inertSelector={inertSelector}
      footer={
        <>
          <button type="button" className="btn" onClick={cancel}>
            Cancel
          </button>
          {result && !readError && (
            <button
              type="button"
              className="btn btn--primary"
              disabled={disabled}
              onClick={() => void approve()}
            >
              {replacesMap ? "Replace map" : "Generate map"}
            </button>
          )}
        </>
      }
    >
      {readError ? (
        <div className="grid min-w-0 gap-3">
          <p className="field-error" role="alert">
            {readError}
          </p>
          {tokenRecovery && (
            <GitHubTokenField
              keyManager={manager}
              owner={githubOwner}
              allowForget={activeFailure?.code === "github_token_rejected"}
              onChange={relistWithToken}
            />
          )}
        </div>
      ) : !result ? (
        <p role="status">
          {repositoryUrl
            ? "Reading the repository from GitHub…"
            : `Reading folder… ${entries} entries`}
        </p>
      ) : (
        <div className="grid min-w-0 gap-4">
          {replacesMap && (
            <p className="type-small m-0">
              Replacing the map also replaces the existing Assistant conversation.
            </p>
          )}
          <fieldset className="min-w-0">
            <legend className="field-label">Folders</legend>
            <div className="max-h-[45vh] overflow-y-auto">
              {rootFilePaths.length > 0 && (
                <label className="field-check min-w-0 py-1">
                  <input
                    type="checkbox"
                    checked={rootFilesIncluded}
                    disabled={preparing}
                    onChange={() =>
                      setExcluded((current) => {
                        const next = new Set(current);
                        for (const path of rootFilePaths) {
                          if (rootFilesIncluded) next.add(path);
                          else next.delete(path);
                        }
                        return next;
                      })
                    }
                  />
                  <span>Top-level files</span>
                  <span className="type-small text-ink2">
                    {rootFilePaths.length} files · ~
                    {formatTokenCount(tree.rootFiles.bytes / ESTIMATED_CHARACTERS_PER_TOKEN)} tokens
                  </span>
                </label>
              )}
              <ul className="m-0 list-none p-0">
                {tree.folders.map((node) => (
                  <FolderRow
                    key={node.path}
                    node={node}
                    excluded={excluded}
                    preparing={preparing}
                    onToggle={(path) => setExcluded((current) => toggleFolder(path, current))}
                  />
                ))}
              </ul>
            </div>
          </fieldset>
          {(skippedDirectories > 0 || skippedFiles > 0) && (
            <p className="type-small m-0 text-ink2">
              Skipped: {skippedDirectories} {skippedDirectories === 1 ? "folder" : "folders"} and{" "}
              {skippedFiles} {skippedFiles === 1 ? "file" : "files"}, such as dependencies, build
              output, binaries and possible secrets.
            </p>
          )}
          {result.unreadableCount > 0 && (
            <p className="field-error" role="alert">
              {result.unreadableCount} unreadable{" "}
              {result.unreadableCount === 1 ? "entry was" : "entries were"} not included.
            </p>
          )}
          {normalizedExclusions.length > LOCAL_SOURCE_LIMITS.maxExcludedPaths && (
            <p className="field-error" role="alert">
              Too many excluded folders. Select no more than {LOCAL_SOURCE_LIMITS.maxExcludedPaths}{" "}
              exclusions.
            </p>
          )}
          <div className="field">
            <label className="field-label" htmlFor={`${id}-provider`}>
              Provider
            </label>
            <select
              id={`${id}-provider`}
              className="field-select"
              value={selection.provider}
              disabled={preparing || !selectionReady}
              onChange={(event) => {
                const provider = event.target.value as AiProviderId;
                setKeyReadyFor(null);
                setCustom(false);
                setSelection({ provider, model: AI_PROVIDERS[provider].defaultModel });
              }}
            >
              {AI_PROVIDER_IDS.map((provider) => (
                <option key={provider} value={provider}>
                  {AI_PROVIDERS[provider].name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`${id}-model`}>
              Model
            </label>
            <select
              id={`${id}-model`}
              className="field-select"
              value={custom ? "other" : selection.model}
              disabled={preparing || !selectionReady}
              onChange={(event) => {
                const value = event.target.value;
                setCustom(value === "other");
                setSelection((current) => ({ ...current, model: value === "other" ? "" : value }));
              }}
            >
              {AI_PROVIDERS[selection.provider].models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
              <option value="other">Other model ID…</option>
            </select>
          </div>
          {custom && (
            <div className="field">
              <label className="field-label" htmlFor={`${id}-custom`}>
                Model ID
              </label>
              <input
                id={`${id}-custom`}
                className="field-input"
                value={selection.model}
                disabled={preparing}
                aria-invalid={!validModel}
                aria-describedby={!validModel ? `${id}-model-error` : undefined}
                onChange={(event) =>
                  setSelection((current) => ({ ...current, model: event.target.value }))
                }
              />
              {!validModel && (
                <p id={`${id}-model-error`} className="field-error" role="alert">
                  Enter a model ID without spaces, up to 160 characters.
                </p>
              )}
            </div>
          )}
          <span className="sr-only" id={`${id}-key`}>
            {AI_PROVIDERS[selection.provider].name} key
          </span>
          <ProviderKeyField
            key={selection.provider}
            provider={selection.provider}
            keyManager={manager}
            heading={false}
            labelledBy={`${id}-key`}
            onReady={(status) =>
              setKeyReadyFor(status.state !== "absent" ? selection.provider : null)
            }
          />
          {repository?.treeTruncated && (
            <p className="type-small m-0 text-ink2">
              GitHub returned only part of this repository&apos;s file list, so some folders may be
              missing.
            </p>
          )}
          {repositoryUrl && quota && !overQuota && (
            <p className="type-small m-0" role="status">
              Reads {included.length} {included.length === 1 ? "file" : "files"} from GitHub ·{" "}
              {quota.remaining} of {quota.limit} GitHub requests left this hour
            </p>
          )}
          {repositoryUrl && quota && overQuota && (
            <div className="grid min-w-0 gap-3">
              <p className="field-error" role="alert">
                This selection needs {included.length} GitHub requests, and {quota.remaining}{" "}
                {quota.remaining === 1 ? "is" : "are"} left{" "}
                {quota.resetAt === null
                  ? "this hour"
                  : `until ${new Date(quota.resetAt).toLocaleTimeString()}`}
                . Add a GitHub token for a higher limit, or uncheck folders.
              </p>
              <GitHubTokenField
                keyManager={manager}
                owner={githubOwner}
                onChange={relistWithToken}
              />
            </div>
          )}
          {!included.length ? (
            <p className="type-small m-0" role="status">
              Nothing selected.
            </p>
          ) : !estimate.fits ? (
            <p className="field-error" role="alert">
              About {number(estimate.inputTokens)} tokens. {option?.name} accepts up to{" "}
              {number(estimate.contextTokens! - estimate.outputTokens)} input tokens, leaving room
              for the map. Uncheck folders or choose another model.
            </p>
          ) : (
            <p className="type-small m-0" role="status">
              About {number(estimate.inputTokens)} tokens ·{" "}
              {estimate.costUsd === null
                ? "price unknown for this model"
                : `about ${formatUsd(estimate.costUsd)} · prices as of ${MODEL_PRICES_AS_OF}`}
            </p>
          )}
          {!estimate.preparationFits && (
            <p className="field-error" role="alert">
              Selection exceeds the 16 MiB preparation budget. Uncheck folders to continue.
            </p>
          )}
          {progress && (
            <p role="status">
              Reading files… {progress.done} of {progress.total}
            </p>
          )}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          {buildFailure && tokenRecovery && (
            <GitHubTokenField
              keyManager={manager}
              owner={githubOwner}
              allowForget={buildFailure.code === "github_token_rejected"}
              onChange={relistWithToken}
            />
          )}
        </div>
      )}
    </Modal>
  );
}
