"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import {
  DatabaseZap,
  Github,
  KeyRound,
  Loader2,
  MessageSquareText,
  SendHorizontal,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";
import IconControl from "@/components/ui/IconControl";
import {
  getBrowserProviderRunCoordinator,
  providerErrorDetails,
  repositoryPrompt,
  type ProviderRunCoordinator,
  type ProviderRunRequest,
  type RepositoryEvidenceOutcome,
} from "@/lib/ai/provider-run";
import type { CanvasPersistenceCommit } from "@/lib/canvas-persistence";
import { stripStackTags } from "@/lib/ai/context-builder";
import { createId } from "@/lib/id";
import type { ProviderKeyStatus } from "@/lib/provider-key";
import type { ChatMessage } from "@/types/chat";
import type { StackArchitecture } from "@/types/stack";

export interface RepositoryScanProvenance {
  repoUrl: string;
  commitSha: string;
  scannedAt: number;
  analysisStatus: "complete" | "partial";
  analysisWarning: string | null;
}

export interface ArchitectureUpdateMeta {
  source: "scan" | "assistant";
  persisted: true;
  commit: CanvasPersistenceCommit;
  provenance?: RepositoryScanProvenance;
}

export type ArchitectureStreamOutcome = "completed" | "ambiguous";

interface ChatSidebarProps {
  projectId: string;
  repoUrl?: string | null;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showCollapsedButton?: boolean;
  scanTrigger?: number;
  coordinator?: ProviderRunCoordinator;
  onArchitecture?: (
    architecture: StackArchitecture,
    meta: ArchitectureUpdateMeta
  ) => Promise<void> | void;
  onProviderCommit?: (commit: CanvasPersistenceCommit) => Promise<void> | void;
  onArchitectureStreamStart?: () => Promise<void>;
  onProviderCommitStart?: () => Promise<void>;
  onArchitectureStreamEnd?: (outcome: ArchitectureStreamOutcome) => Promise<void> | void;
  onStreaming?: (streaming: boolean) => void;
}

interface Disclosure {
  provider: "GitHub" | "Anthropic";
  title: string;
  detail: string;
  action: () => Promise<void>;
}

interface RetryDraft {
  runId: string;
  request: ProviderRunRequest;
}

function normalizeRepoUrl(repoUrl?: string | null) {
  const value = repoUrl?.trim();
  if (!value || value === "null" || value === "undefined") return "";
  return value;
}

function visibleMessage(message: ChatMessage) {
  return !(
    message.role === "user" &&
    (message.content.startsWith("Begin the architecture interview") ||
      message.content.startsWith("Analyze this GitHub repository") ||
      message.content.startsWith("Generate an architecture overview for this repository"))
  );
}

function providerErrorMessage(error: unknown) {
  const value = providerErrorDetails(error);
  if (value.code === "authentication") return "AI_NOT_CONFIGURED";
  if (value.code === "stale") {
    return "Your map changed while Anthropic was responding. The newer map was kept; retry when ready.";
  }
  return value.message;
}

export default function ChatSidebar({
  projectId,
  repoUrl,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  showCollapsedButton = true,
  scanTrigger = 0,
  coordinator: providedCoordinator,
  onArchitecture,
  onProviderCommit,
  onArchitectureStreamStart,
  onProviderCommitStart,
  onArchitectureStreamEnd,
  onStreaming,
}: ChatSidebarProps) {
  const [coordinator] = useState(() => providedCoordinator ?? getBrowserProviderRunCoordinator());
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [ready, setReady] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState("");
  const [keyStatus, setKeyStatus] = useState<ProviderKeyStatus | null>(null);
  const [disclosure, setDisclosure] = useState<Disclosure | null>(null);
  const [githubDisclosed, setGithubDisclosed] = useState(false);
  const [anthropicDisclosed, setAnthropicDisclosed] = useState(false);
  const [evidence, setEvidence] = useState<RepositoryEvidenceOutcome | null>(null);
  const [retryDraft, setRetryDraft] = useState<RetryDraft | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamFrameRef = useRef<number | null>(null);
  const pendingStreamTextRef = useRef("");
  const previousScanTrigger = useRef(scanTrigger);
  const open = controlledOpen ?? uncontrolledOpen;
  const previousOpenRef = useRef(open);
  const focusCloseControl = open && !previousOpenRef.current;
  const normalizedRepoUrl = normalizeRepoUrl(repoUrl);

  const setSidebarOpen = useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange]
  );

  const refreshLocalState = useCallback(async () => {
    const [storedMessages, status] = await Promise.all([
      coordinator.listMessages(projectId),
      coordinator.getKeyStatus(),
    ]);
    setMessages(storedMessages.filter(visibleMessage));
    setKeyStatus(status);
  }, [coordinator, projectId]);

  useEffect(() => {
    previousOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    onStreaming?.(streaming);
  }, [onStreaming, streaming]);

  useEffect(() => {
    const target = messagesEndRef.current;
    if (typeof target?.scrollIntoView === "function") {
      target.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streamText]);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    refreshLocalState()
      .catch(() => {
        if (!cancelled) setError("Local messages could not be read from this device.");
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
      if (streamFrameRef.current !== null) {
        cancelAnimationFrame(streamFrameRef.current);
        streamFrameRef.current = null;
      }
    };
  }, [refreshLocalState]);

  const publishStreamText = useCallback((text: string) => {
    pendingStreamTextRef.current = text;
    if (streamFrameRef.current !== null) return;
    streamFrameRef.current = requestAnimationFrame(() => {
      streamFrameRef.current = null;
      setStreamText(pendingStreamTextRef.current);
    });
  }, []);

  const requestDisclosure = useCallback(
    (next: Disclosure) => {
      const alreadyDisclosed = next.provider === "GitHub" ? githubDisclosed : anthropicDisclosed;
      if (alreadyDisclosed) {
        void next.action();
        return;
      }
      setDisclosure(next);
    },
    [anthropicDisclosed, githubDisclosed]
  );

  const finishBarrier = useCallback(
    async (outcome: ArchitectureStreamOutcome) => {
      try {
        await onArchitectureStreamEnd?.(outcome);
      } catch {
        setError("The local canvas could not reconcile the provider result.");
      }
    },
    [onArchitectureStreamEnd]
  );

  const runAnthropic = useCallback(
    async (request: ProviderRunRequest) => {
      const runId = request.retryRunId ?? request.runId ?? createId();
      const nextRequest = { ...request, runId };
      setStreaming(true);
      setStreamText("");
      setError("");
      setRetryDraft(null);
      const controller = new AbortController();
      abortRef.current = controller;
      let outcome: ArchitectureStreamOutcome = "ambiguous";
      let providerCommitted = false;

      try {
        await onArchitectureStreamStart?.();
        const result = await coordinator.run({
          ...nextRequest,
          signal: controller.signal,
          onText: publishStreamText,
          beforeCommit: onProviderCommitStart,
        });
        providerCommitted = true;
        if (result.architecture) {
          await onArchitecture?.(result.architecture, {
            source: request.kind === "repository-generation" ? "scan" : "assistant",
            persisted: true,
            commit: {
              projectRevision: result.project.revision,
              vaultGeneration: result.generation,
            },
            ...(request.kind === "repository-generation" && evidence
              ? {
                  provenance: {
                    repoUrl: evidence.analysis.normalizedUrl,
                    commitSha: evidence.analysis.commitSha,
                    scannedAt: evidence.project.updatedAt,
                    analysisStatus: evidence.analysis.status,
                    analysisWarning:
                      evidence.analysis.warnings.length > 0
                        ? evidence.analysis.warnings.join(" ")
                        : null,
                  },
                }
              : {}),
          });
        } else {
          await onProviderCommit?.({
            projectRevision: result.project.revision,
            vaultGeneration: result.generation,
          });
        }
        await refreshLocalState();
        setStreamText("");
        setEvidence(null);
        outcome = "completed";
      } catch (runError) {
        if (providerCommitted) {
          setError(
            "The provider result was saved on this device, but the editor could not reconcile it. Reopen the map to load the saved result."
          );
        } else {
          const message = providerErrorMessage(runError);
          setError(message);
          if (message !== "AI_NOT_CONFIGURED") {
            setRetryDraft({ runId, request: nextRequest });
          }
        }
      } finally {
        abortRef.current = null;
        setStreaming(false);
        await finishBarrier(outcome);
      }
    },
    [
      coordinator,
      evidence,
      finishBarrier,
      onArchitecture,
      onArchitectureStreamStart,
      onProviderCommitStart,
      onProviderCommit,
      publishStreamText,
      refreshLocalState,
    ]
  );

  const stageAnthropic = useCallback(
    (request: ProviderRunRequest, title: string, detail: string) => {
      requestDisclosure({
        provider: "Anthropic",
        title,
        detail,
        action: () => runAnthropic(request),
      });
    },
    [requestDisclosure, runAnthropic]
  );

  const scanRepository = useCallback(async () => {
    if (!normalizedRepoUrl || streaming) return;
    setSidebarOpen(true);
    setStreaming(true);
    setError("");
    setEvidence(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await onArchitectureStreamStart?.();
      const result = await coordinator.scanRepository(projectId, normalizedRepoUrl, {
        signal: controller.signal,
        beforeCommit: onProviderCommitStart,
      });
      await onProviderCommit?.({
        projectRevision: result.project.revision,
        vaultGeneration: result.generation,
      });
      setEvidence(result);
    } catch (scanError) {
      setError(providerErrorMessage(scanError));
    } finally {
      abortRef.current = null;
      setStreaming(false);
      await finishBarrier("completed");
    }
  }, [
    coordinator,
    finishBarrier,
    normalizedRepoUrl,
    onArchitectureStreamStart,
    onProviderCommit,
    onProviderCommitStart,
    projectId,
    setSidebarOpen,
    streaming,
  ]);

  const stageRepositoryScan = useCallback(() => {
    if (!normalizedRepoUrl) return;
    requestDisclosure({
      provider: "GitHub",
      title: "Read public repository evidence?",
      detail:
        "StackHatch will send the repository owner/name to GitHub and read bounded public metadata, the README, tree paths, and selected configuration files. No Anthropic key is sent.",
      action: scanRepository,
    });
  }, [normalizedRepoUrl, requestDisclosure, scanRepository]);

  useEffect(() => {
    if (scanTrigger <= previousScanTrigger.current) return;
    previousScanTrigger.current = scanTrigger;
    stageRepositoryScan();
  }, [scanTrigger, stageRepositoryScan]);

  function confirmDisclosure() {
    const pending = disclosure;
    if (!pending) return;
    if (pending.provider === "GitHub") setGithubDisclosed(true);
    else setAnthropicDisclosed(true);
    setDisclosure(null);
    void pending.action();
  }

  function sendMessage() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    stageAnthropic(
      { projectId, kind: "chat", prompt: text },
      "Send this message and map context to Anthropic?",
      "Anthropic will receive your message, this map's latest committed nodes and connections, custom subtype vocabulary, and this map's chat history."
    );
  }

  function startInterview() {
    stageAnthropic(
      { projectId, kind: "initialization" },
      "Start an architecture interview with Anthropic?",
      "Anthropic will receive this map's description and latest committed canvas. StackHatch keeps the response on this device."
    );
  }

  function generateRepositoryMap() {
    if (!evidence) return;
    stageAnthropic(
      {
        projectId,
        kind: "repository-generation",
        prompt: repositoryPrompt(evidence.analysis),
      },
      "Send reviewed repository evidence to Anthropic?",
      "Anthropic will receive the bounded GitHub evidence shown here. A valid completed map replaces the current generated repository view only if its local revision is still current."
    );
  }

  const showApiKeyPrompt = error === "AI_NOT_CONFIGURED";

  if (!open) {
    if (!showCollapsedButton) return null;
    return (
      <button
        onClick={() => setSidebarOpen(true)}
        className="fixed left-0 top-1/2 z-10 -translate-y-1/2 rounded-r-lg bg-[var(--brand)] px-2 py-4 text-[var(--brand-foreground)] shadow-md shadow-[var(--shadow-color)] hover:bg-[var(--brand-hover)]"
        aria-label="Open chat"
      >
        <MessageSquareText className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="relative flex h-[45vh] w-full flex-shrink-0 flex-col border-b border-[var(--boundary)] bg-[var(--paper)] md:h-full md:w-[400px] md:border-b-0 md:border-r">
      <div className="absolute inset-x-0 top-0 z-10 border-b border-[var(--boundary)] bg-[var(--paper)]/95 px-4 py-2 backdrop-blur">
        <p className="font-utility text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-[var(--blueprint)]">
          Architecture assistant
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
          <ShieldCheck className="h-3.5 w-3.5" />
          Local until you approve a provider request
        </p>
      </div>
      {controlledOpen !== undefined && onOpenChange ? (
        <div className="absolute right-2 top-2 z-20">
          <IconControl
            label="Close chat"
            tooltipPlacement="left"
            autoFocus={focusCloseControl}
            onClick={() => setSidebarOpen(false)}
          >
            <X />
          </IconControl>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-[4.5rem]">
        <div className="space-y-4">
          {messages.length === 0 && !streaming ? (
            <div className="border border-[var(--boundary)] bg-[var(--background)] p-4">
              <p className="text-sm font-semibold text-[var(--foreground)]">
                Your map does not contact a provider on open.
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">
                Start an interview, or review public GitHub evidence first. You approve what leaves
                this browser.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={startInterview}
                  className="min-h-10 rounded-md bg-[var(--brand)] px-3 py-2 text-sm font-bold text-[var(--brand-foreground)]"
                >
                  Start interview
                </button>
                {normalizedRepoUrl ? (
                  <button
                    type="button"
                    onClick={stageRepositoryScan}
                    className="min-h-10 rounded-md border border-[var(--boundary)] px-3 py-2 text-sm font-semibold"
                  >
                    Review GitHub evidence
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {messages.map((message) => (
            <div
              key={message.id}
              data-testid={`chat-message-${message.role}`}
              className="border-b border-[var(--border)] pb-4 last:border-b-0"
            >
              <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
                {message.role === "user" ? "You" : "StackHatch"}
              </p>
              {message.role === "assistant" ? (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown>{stripStackTags(message.content)}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
              )}
            </div>
          ))}

          {streaming ? (
            <div className="border-b border-[var(--border)] pb-4">
              <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
                {streamText ? "StackHatch" : "Provider request"}
              </p>
              {streamText ? (
                <div
                  data-testid="chat-message-assistant-streaming"
                  className="prose prose-sm max-w-none dark:prose-invert"
                >
                  <ReactMarkdown>{stripStackTags(streamText)}</ReactMarkdown>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Waiting for the provider…
                </div>
              )}
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--boundary)] px-3 py-1.5 text-xs font-semibold"
              >
                <Square className="h-3.5 w-3.5" />
                Cancel request
              </button>
            </div>
          ) : null}

          {disclosure ? (
            <div
              role="dialog"
              aria-label={`${disclosure.provider} data disclosure`}
              className="border border-[var(--blueprint)] bg-[var(--background)] p-4"
            >
              <p className="flex items-center gap-2 text-sm font-semibold">
                {disclosure.provider === "GitHub" ? (
                  <Github className="h-4 w-4" />
                ) : (
                  <DatabaseZap className="h-4 w-4" />
                )}
                {disclosure.title}
              </p>
              <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">
                {disclosure.detail}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={confirmDisclosure}
                  className="min-h-10 rounded-md bg-[var(--brand)] px-3 py-2 text-sm font-bold text-[var(--brand-foreground)]"
                >
                  Continue to {disclosure.provider}
                </button>
                <button
                  type="button"
                  onClick={() => setDisclosure(null)}
                  className="min-h-10 rounded-md border border-[var(--boundary)] px-3 py-2 text-sm font-semibold"
                >
                  Keep it local
                </button>
              </div>
            </div>
          ) : null}

          {evidence ? (
            <div className="border border-[var(--boundary)] bg-[var(--background)] p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Github className="h-4 w-4" />
                GitHub evidence is ready
              </p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-[var(--muted-foreground)]">Revision</dt>
                <dd className="font-mono">{evidence.analysis.commitSha.slice(0, 12)}</dd>
                <dt className="text-[var(--muted-foreground)]">Tree paths</dt>
                <dd>{evidence.analysis.treePaths.length}</dd>
                <dt className="text-[var(--muted-foreground)]">Evidence files</dt>
                <dd>{evidence.analysis.evidenceFiles.length}</dd>
              </dl>
              {evidence.analysis.warnings.length ? (
                <p className="mt-2 text-xs leading-5 text-[var(--warning)]">
                  {evidence.analysis.warnings.join(" ")}
                </p>
              ) : null}
              <button
                type="button"
                onClick={generateRepositoryMap}
                className="mt-3 min-h-10 rounded-md bg-[var(--brand)] px-3 py-2 text-sm font-bold text-[var(--brand-foreground)]"
              >
                Generate map with Anthropic
              </button>
            </div>
          ) : null}

          {showApiKeyPrompt ? (
            <div className="border border-[var(--warning-border)] bg-[var(--warning-surface)] p-4 text-sm">
              <p className="flex items-center gap-2 font-semibold">
                <KeyRound className="h-4 w-4" />
                Add your Anthropic key
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">
                Session-only is the default. Remembering it is an explicit device-level choice.
              </p>
              <Link
                href="/settings?setup=anthropic"
                className="mt-3 inline-flex min-h-10 items-center rounded-md bg-[var(--brand)] px-3 py-2 text-sm font-bold text-[var(--brand-foreground)]"
              >
                Open device settings
              </Link>
            </div>
          ) : null}

          {error && !showApiKeyPrompt ? (
            <div role="alert" className="border border-[var(--danger-border)] px-3 py-2 text-sm">
              {error}
              {retryDraft ? (
                <button
                  type="button"
                  onClick={() =>
                    stageAnthropic(
                      { ...retryDraft.request, retryRunId: retryDraft.runId },
                      "Retry this Anthropic request?",
                      "StackHatch will resend the same local draft against the latest committed revision. It will not duplicate the chat message."
                    )
                  }
                  className="mt-2 block min-h-9 rounded-md border border-[var(--boundary)] px-3 py-1.5 text-xs font-semibold"
                >
                  Review and retry
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-[var(--boundary)] bg-[var(--paper)] p-3">
        <p className="mb-2 text-[0.6875rem] leading-4 text-[var(--muted-foreground)]">
          {keyStatus?.state === "remembered"
            ? "Anthropic key remembered on this device · context is sent only when you act"
            : keyStatus?.state === "session"
              ? "Anthropic key available for this session · context is sent only when you act"
              : "No Anthropic key active · local editing remains available"}
        </p>
        <div className="flex items-end gap-2 rounded-[var(--radius-control)] border border-[var(--boundary)] bg-[var(--background)] p-2 focus-within:border-[var(--blueprint)]">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              event.target.style.height = "auto";
              event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
              }
            }}
            placeholder={ready ? "Ask about this architecture…" : "Loading local messages…"}
            disabled={!ready || streaming}
            rows={1}
            className="max-h-[120px] min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-5 focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={!ready || streaming || !input.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--brand)] text-[var(--brand-foreground)] disabled:opacity-40"
            aria-label="Send message"
          >
            <SendHorizontal className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </div>
  );
}
