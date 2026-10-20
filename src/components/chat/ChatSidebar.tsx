"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, Loader2, Paperclip, Send, Square, X } from "lucide-react";
import GitHubTokenField from "@/components/projects/GitHubTokenField";
import ProviderKeyField from "@/components/projects/ProviderKeyField";
import { AI_PROVIDERS, DEFAULT_AI_SELECTION } from "@/lib/ai/providers";
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
import {
  GITHUB_TOKEN_RECOVERABLE_CODES,
  parseGitHubRepoReference,
  RepoAnalysisError,
} from "@/lib/github-analyzer";
import { createId } from "@/lib/id";
import {
  ChatAttachmentError,
  composeAttachedMessage,
  parseAttachedMessage,
  readChatAttachment,
  type ChatAttachment,
} from "@/lib/chat-attachment";
import type { ProviderKeyManager, ProviderKeyStatus } from "@/lib/provider-key";
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
  /** Set when the map was started from an uploaded requirements file. */
  hasRequirementsBrief?: boolean;
  /**
   * Runs the map's one obvious action on arrival, so submitting a repository or
   * a brief goes straight to a map. The editor only sets this for a map that
   * has never been generated, since generation replaces the canvas wholesale.
   */
  autoStart?: "repository" | "brief" | null;
  repoUrl?: string | null;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  scanTrigger?: number;
  coordinator?: ProviderRunCoordinator;
  keyManager?: ProviderKeyManager;
  onArchitecture?: (
    architecture: StackArchitecture,
    meta: ArchitectureUpdateMeta
  ) => Promise<void> | void;
  onProviderCommit?: (commit: CanvasPersistenceCommit) => Promise<void> | void;
  onArchitectureStreamStart?: () => Promise<void>;
  onProviderCommitStart?: () => Promise<void>;
  onArchitectureStreamEnd?: (outcome: ArchitectureStreamOutcome) => Promise<void> | void;
  onStreaming?: (streaming: boolean) => void;
  /** True from the moment the streamed reply starts its map until the run ends. */
  onMapping?: (mapping: boolean) => void;
  /** Names of the nodes on the canvas; bold mentions of them read as references. */
  nodeNames?: readonly string[];
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

/** Sentinel for the one error that should render the key setup prompt. */
const KEY_MISSING = "credentials-missing";

/** Id prefix of the user turn shown before the run stores it. */
const PENDING_MESSAGE_PREFIX = "pending-";

function isNotPending(message: ChatMessage) {
  return !message.id.startsWith(PENDING_MESSAGE_PREFIX);
}

function visibleMessage(message: ChatMessage) {
  return !(
    message.role === "user" &&
    (message.content.startsWith("Begin the architecture interview") ||
      message.content.startsWith("The requirements brief below") ||
      message.content.startsWith("Analyze this GitHub repository") ||
      message.content.startsWith("Generate an architecture overview for this repository"))
  );
}

function provenanceFrom(outcome: RepositoryEvidenceOutcome): RepositoryScanProvenance {
  return {
    repoUrl: outcome.analysis.normalizedUrl,
    commitSha: outcome.analysis.commitSha,
    scannedAt: outcome.project.updatedAt,
    analysisStatus: outcome.analysis.status,
    analysisWarning:
      outcome.analysis.warnings.length > 0 ? outcome.analysis.warnings.join(" ") : null,
  };
}

function providerErrorMessage(error: unknown) {
  const value = providerErrorDetails(error);
  // Only a key that was never entered sends the user to set one up. A key
  // the provider rejected keeps its own message, which says to check it.
  if (value.code === "credentials_missing") return KEY_MISSING;
  if (value.code === "stale") {
    const name = value.provider ? AI_PROVIDERS[value.provider].name : "the AI provider";
    return `Your map changed while ${name} was responding. The newer map was kept; retry when ready.`;
  }
  return value.message;
}

/** Lower-cased names of the nodes on the open canvas. */
const NodeNamesContext = createContext<ReadonlySet<string>>(new Set());

/** Bold text; a bold node name is underlined as a reference to the canvas. */
function ChatStrong({ children }: { children?: ReactNode }) {
  const nodeNames = useContext(NodeNamesContext);
  const isNodeReference =
    typeof children === "string" && nodeNames.has(children.trim().toLowerCase());
  return (
    <strong
      className={`font-bold text-ink ${
        isNodeReference
          ? "underline decoration-rule-strong decoration-[1.5px] underline-offset-4"
          : ""
      }`}
    >
      {children}
    </strong>
  );
}

const chatMarkdownComponents: Components = {
  p({ children }) {
    return <p className="mb-2.5 last:mb-0">{children}</p>;
  },
  strong({ children }) {
    return <ChatStrong>{children}</ChatStrong>;
  },
  ul({ children }) {
    return <ul className="my-2.5 list-outside list-disc space-y-1 pl-5">{children}</ul>;
  },
  ol({ children, start }) {
    return (
      <ol start={start} className="my-2.5 list-outside list-decimal space-y-1 pl-5">
        {children}
      </ol>
    );
  },
  li({ children }) {
    return <li className="pl-0.5 marker:text-ink2">{children}</li>;
  },
  code({ children }) {
    return <code className="font-utility text-[0.8125rem] text-ink">{children}</code>;
  },
  pre({ children }) {
    return <pre className="my-2.5 overflow-x-auto bg-canvas px-3 py-2">{children}</pre>;
  },
  table({ children }) {
    return (
      <div
        role="region"
        aria-label="Scrollable table"
        tabIndex={0}
        className="my-3 max-w-full overflow-x-auto border-y-[1.5px] border-ink focus-visible:outline-offset-[-2px]"
      >
        <table className="w-full min-w-full border-collapse text-left type-small [&_td]:[overflow-wrap:anywhere] [&_th]:[overflow-wrap:anywhere]">
          {children}
        </table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="text-ink">{children}</thead>;
  },
  tbody({ children }) {
    return <tbody className="[&_tr:last-child_td]:border-b-0">{children}</tbody>;
  },
  th({ children, style }) {
    return (
      <th style={style} className="border-b border-rule-strong py-2 pr-4 type-label text-ink">
        {children}
      </th>
    );
  },
  td({ children, style }) {
    return (
      <td style={style} className="border-b border-rule py-2 pr-4 align-top">
        {children}
      </td>
    );
  },
};

function ChatMarkdown({ children }: { children: string }) {
  return (
    <div className="max-w-none text-[0.90625rem] leading-[1.55] text-ink">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={chatMarkdownComponents}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

/** The "You" / "StackHatch" line above each turn. */
function WhoLabel({ children }: { children: string }) {
  return <p className="mb-1.5 type-who text-ink2">{children}</p>;
}

/** A user turn; an attached file shows as its name, not its text. */
function UserMessage({ content }: { content: string }) {
  const { text, attachment } = parseAttachedMessage(content);
  return (
    <div className="border-l-[3px] border-primary pl-3">
      <WhoLabel>You</WhoLabel>
      <p className="whitespace-pre-wrap type-body">{text}</p>
      {attachment ? (
        <p className="type-small mt-2 flex items-center gap-1.5 text-ink2">
          <FileText aria-hidden="true" className="size-4 flex-none" />
          <span className="min-w-0 truncate" data-testid="chat-message-attachment">
            {attachment.name}
          </span>
        </p>
      ) : null}
    </div>
  );
}

export default function ChatSidebar({
  projectId,
  hasRequirementsBrief = false,
  autoStart = null,
  repoUrl,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  scanTrigger = 0,
  coordinator: providedCoordinator,
  onArchitecture,
  keyManager,
  onProviderCommit,
  onArchitectureStreamStart,
  onProviderCommitStart,
  onArchitectureStreamEnd,
  onStreaming,
  onMapping,
  nodeNames,
}: ChatSidebarProps) {
  const [coordinator] = useState(() => providedCoordinator ?? getBrowserProviderRunCoordinator());
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [ready, setReady] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState("");
  const [attachment, setAttachment] = useState<ChatAttachment | null>(null);
  const [attachmentError, setAttachmentError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [keyStatus, setKeyStatus] = useState<ProviderKeyStatus | null>(null);
  const [evidence, setEvidence] = useState<RepositoryEvidenceOutcome | null>(null);
  const [retryDraft, setRetryDraft] = useState<RetryDraft | null>(null);
  // The last scan's GitHub failure, which decides whether the token prompt shows.
  const [scanFailure, setScanFailure] = useState<RepoAnalysisError | null>(null);
  // The header gains a rule once the thread scrolls beneath it.
  const [threadScrolled, setThreadScrolled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const keyPromptRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const restoreComposerFocusRef = useRef(false);
  const pendingKeySendRef = useRef(false);
  const streamFrameRef = useRef<number | null>(null);
  const pendingStreamTextRef = useRef("");
  const previousScanTrigger = useRef(scanTrigger);
  const autoStartedRef = useRef(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const previousOpenRef = useRef(open);
  const focusCloseControl = open && !previousOpenRef.current;
  const normalizedRepoUrl = normalizeRepoUrl(repoUrl);
  // Keyed on the names' content, since the editor passes a fresh array each render.
  const nodeNamesKey = nodeNames?.join("\n").toLowerCase() ?? "";
  const nodeNameSet = useMemo(
    () => new Set(nodeNamesKey ? nodeNamesKey.split("\n").map((name) => name.trim()) : []),
    [nodeNamesKey]
  );

  const setSidebarOpen = useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange]
  );

  const refreshMessages = useCallback(async () => {
    const storedMessages = await coordinator.listMessages(projectId);
    setMessages(storedMessages.filter(visibleMessage));
  }, [coordinator, projectId]);

  const refreshLocalState = useCallback(
    async () =>
      Promise.all([
        refreshMessages(),
        coordinator.getKeyStatus().then((status) => setKeyStatus(status)),
      ]),
    [coordinator, refreshMessages]
  );

  useEffect(() => {
    previousOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    onStreaming?.(streaming);
  }, [onStreaming, streaming]);

  // A reply only builds nodes once it reaches its <stack> block; questions and
  // prose before it, or replies without one, leave the canvas alone.
  const mapping = streaming && streamText.includes("<stack>");
  useEffect(() => {
    onMapping?.(mapping);
  }, [onMapping, mapping]);

  // Follow the newest turn, including when the panel opens onto an existing
  // thread, and bring an error or the key prompt into view: they render below
  // the conversation, where a long thread would hide them.
  const scrollToEnd = useCallback(() => {
    const target = messagesEndRef.current;
    if (typeof target?.scrollIntoView !== "function") return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [scrollToEnd, messages, streamText, error, keyStatus, open]);

  // A scan failure only explains the panel while its message is the one shown;
  // a later error, such as a missing AI key, takes over.
  const activeScanFailure = scanFailure && error === scanFailure.message ? scanFailure : null;
  // The key and token prompts render nothing until they have read their
  // status, so they grow after the scroll above ran; follow their height too.
  const keyPromptVisible = error === KEY_MISSING;
  const githubTokenPromptVisible = Boolean(
    activeScanFailure && GITHUB_TOKEN_RECOVERABLE_CODES.has(activeScanFailure.code)
  );
  const promptVisible = keyPromptVisible || githubTokenPromptVisible;
  useEffect(() => {
    const prompt = keyPromptRef.current;
    if (!promptVisible || !prompt || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => scrollToEnd());
    observer.observe(prompt);
    return () => observer.disconnect();
  }, [promptVisible, scrollToEnd]);

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

  const finishBarrier = useCallback(
    async (outcome: ArchitectureStreamOutcome) => {
      try {
        await onArchitectureStreamEnd?.(outcome);
      } catch {
        setError("The result could not be merged into this canvas. Reopen the map and try again.");
      }
    },
    [onArchitectureStreamEnd]
  );

  const runProvider = useCallback(
    // scanAndGenerate calls this in the same tick as setEvidence, so the state
    // closure is still null there; the caller passes the fresh scan instead.
    async (request: ProviderRunRequest, scanned?: RepositoryEvidenceOutcome | null) => {
      const runId = request.retryRunId ?? request.runId ?? createId();
      const nextRequest = { ...request, runId };
      setStreaming(true);
      setStreamText("");
      setError("");
      setScanFailure(null);
      setRetryDraft(null);
      // Show the user's turn at once. The stored thread replaces it when the run finishes.
      setMessages((current) => [
        ...current.filter(isNotPending),
        ...(request.kind === "chat" && request.prompt
          ? [
              {
                id: `${PENDING_MESSAGE_PREFIX}${runId}`,
                projectId,
                role: "user" as const,
                content: request.prompt,
                revision: 0,
                createdAt: Date.now(),
              },
            ]
          : []),
      ]);
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
            ...(request.kind === "repository-generation" && (scanned ?? evidence)
              ? {
                  provenance: provenanceFrom((scanned ?? evidence)!),
                }
              : {}),
          });
        } else {
          await onProviderCommit?.({
            projectRevision: result.project.revision,
            vaultGeneration: result.generation,
          });
        }
        await refreshMessages();
        setStreamText("");
        outcome = "completed";
      } catch (runError) {
        if (providerCommitted) {
          setError(
            "The result was saved on this device but could not be merged into the open canvas. Reopen the map to load it."
          );
        } else {
          const message = providerErrorMessage(runError);
          if (message === KEY_MISSING && request.kind === "chat") {
            setMessages((current) => current.filter(isNotPending));
            const restored = parseAttachedMessage(request.prompt ?? "");
            setInput(restored.text);
            setAttachment(restored.attachment);
            pendingKeySendRef.current = true;
            setKeyStatus({
              provider: providerErrorDetails(runError).provider ?? DEFAULT_AI_SELECTION.provider,
              state: "absent",
              generation: "",
            });
          }
          setError(message);
          if (message !== KEY_MISSING) {
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
      projectId,
      publishStreamText,
      refreshMessages,
    ]
  );

  const scanRepository = useCallback(async () => {
    if (!normalizedRepoUrl || streaming) return null;
    setSidebarOpen(true);
    setStreaming(true);
    setError("");
    setScanFailure(null);
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
      return result;
    } catch (scanError) {
      if (scanError instanceof RepoAnalysisError) setScanFailure(scanError);
      setError(providerErrorMessage(scanError));
      return null;
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

  const scanAndGenerate = useCallback(async () => {
    if (!normalizedRepoUrl) return;
    const scanned = await scanRepository();
    // The scan is still its own network event; what went is the click between
    // reading the repository and turning it into a map.
    if (!scanned) return;
    await runProvider(
      {
        projectId,
        kind: "repository-generation",
        prompt: repositoryPrompt(scanned.analysis),
      },
      scanned
    );
  }, [normalizedRepoUrl, projectId, runProvider, scanRepository]);

  useEffect(() => {
    if (!autoStart || autoStartedRef.current) return;
    if (!ready || streaming || messages.length > 0) return;
    if (!keyStatus || keyStatus.state === "absent") return;
    autoStartedRef.current = true;
    if (autoStart === "repository") void scanAndGenerate();
    else void runProvider({ projectId, kind: "initialization" });
  }, [
    autoStart,
    keyStatus,
    messages.length,
    projectId,
    ready,
    runProvider,
    scanAndGenerate,
    streaming,
  ]);

  useEffect(() => {
    if (scanTrigger <= previousScanTrigger.current) return;
    previousScanTrigger.current = scanTrigger;
    void scanAndGenerate();
  }, [scanTrigger, scanAndGenerate]);

  useEffect(() => {
    if (streaming || !ready || !restoreComposerFocusRef.current) return;
    restoreComposerFocusRef.current = false;
    textareaRef.current?.focus();
  }, [ready, streaming]);

  async function attachFile(file: File | undefined) {
    if (!file || !ready || streaming) return;
    try {
      setAttachment(await readChatAttachment(file));
      setAttachmentError("");
    } catch (attachError) {
      setAttachmentError(
        attachError instanceof ChatAttachmentError
          ? attachError.message
          : "The file could not be read. Try another file."
      );
    }
  }

  /** The composer's message, with its file inlined; clears both. */
  function takeComposerMessage() {
    const message = composeAttachedMessage(input, attachment);
    setInput("");
    setAttachment(null);
    setAttachmentError("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    return message;
  }

  function sendMessage({ restoreFocus = false }: { restoreFocus?: boolean } = {}) {
    if ((!input.trim() && !attachment) || streaming) return;
    if (keyStatus?.state === "absent") {
      pendingKeySendRef.current = true;
      setError(KEY_MISSING);
      return;
    }
    restoreComposerFocusRef.current = restoreFocus;
    void runProvider({ projectId, kind: "chat", prompt: takeComposerMessage() });
  }

  function startInterview() {
    void runProvider({ projectId, kind: "initialization" });
  }

  const showApiKeyPrompt = error === KEY_MISSING;
  const providerName = keyStatus ? AI_PROVIDERS[keyStatus.provider].name : "your AI provider";
  // Exactly one next step at a time. Anything further along in the flow owns
  // the panel, so the opening card retires as soon as one of them appears.
  const showStartCard = messages.length === 0 && !streaming && !evidence && !error;

  if (!open) return null;

  const hasTurns = messages.length > 0;
  const startAction = normalizedRepoUrl
    ? { label: "Map this repository", run: () => void scanAndGenerate() }
    : hasRequirementsBrief
      ? { label: "Draft a map from your brief", run: startInterview }
      : null;

  return (
    <NodeNamesContext.Provider value={nodeNameSet}>
      <aside
        aria-label="Assistant"
        className="flex h-full min-h-0 w-full flex-col bg-paper text-ink"
      >
        <div
          className={`flex flex-none items-center gap-2 border-b pb-1 pl-5 pr-2.5 pt-3 transition-colors duration-120 ease-standard ${
            threadScrolled ? "border-rule" : "border-transparent"
          }`}
          data-testid="chat-sidebar-header"
        >
          <h2 className="min-w-0 flex-1 truncate type-section-sm">Assistant</h2>
          {controlledOpen !== undefined && onOpenChange ? (
            <IconControl
              label="Close chat"
              tooltipPlacement="left"
              autoFocus={focusCloseControl}
              onClick={() => setSidebarOpen(false)}
            >
              <X />
            </IconControl>
          ) : null}
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto px-[22px] pb-6 pt-1"
          onScroll={(event) => setThreadScrolled(event.currentTarget.scrollTop > 0)}
        >
          {showStartCard ? (
            <section className="pb-5 pt-3.5">
              <p className="type-body text-ink2">
                {normalizedRepoUrl
                  ? `StackHatch reads bounded evidence from GitHub, then asks ${providerName} to turn it into a map you can edit.`
                  : hasRequirementsBrief
                    ? `Your brief is stored on this device, and ${providerName} drafts a map from it that you can edit.`
                    : "Describe what you're building and the assistant drafts a map you can edit."}
              </p>
              {startAction ? (
                <button type="button" onClick={startAction.run} className="btn btn--primary mt-4">
                  {startAction.label}
                </button>
              ) : null}
            </section>
          ) : null}

          <div role="log" aria-label="Messages" aria-live="polite" aria-relevant="additions">
            {messages.map((message) => (
              <div
                key={message.id}
                data-testid={`chat-message-${message.role}`}
                className="border-t border-rule pb-4 pt-3.5 first:border-t-0"
              >
                {message.role === "assistant" ? (
                  <>
                    <WhoLabel>StackHatch</WhoLabel>
                    <ChatMarkdown>{stripStackTags(message.content)}</ChatMarkdown>
                  </>
                ) : (
                  <UserMessage content={message.content} />
                )}
              </div>
            ))}
          </div>

          {streaming ? (
            <div className={`pb-4 pt-3.5 ${hasTurns ? "border-t border-rule" : ""}`}>
              <WhoLabel>StackHatch</WhoLabel>
              {streamText ? (
                <div data-testid="chat-message-assistant-streaming">
                  <ChatMarkdown>{stripStackTags(streamText)}</ChatMarkdown>
                </div>
              ) : (
                <p className="flex items-center gap-2 type-small text-ink2">
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                  Thinking...
                </p>
              )}
            </div>
          ) : null}

          {showApiKeyPrompt ? (
            <div ref={keyPromptRef} role="alert" className="mt-3 border-t-2 border-primary pt-3.5">
              <ProviderKeyField
                keyManager={keyManager}
                onReady={(status) => {
                  setKeyStatus(status);
                  if (status.state === "absent") return;
                  setError("");
                  if (pendingKeySendRef.current && (input.trim() || attachment)) {
                    pendingKeySendRef.current = false;
                    const text = takeComposerMessage();
                    void runProvider({ projectId, kind: "chat", prompt: text });
                  }
                }}
              />
            </div>
          ) : null}

          {githubTokenPromptVisible ? (
            <div ref={keyPromptRef} className="mt-3 border-t-2 border-primary pt-3.5">
              <p role="alert" className="type-small mt-0 mb-3 text-ink">
                {error}
              </p>
              <GitHubTokenField
                keyManager={keyManager}
                owner={parseGitHubRepoReference(normalizedRepoUrl)?.owner}
                allowForget={activeScanFailure?.code === "github_token_rejected"}
                onChange={() => void scanAndGenerate()}
              />
            </div>
          ) : null}

          {error && !showApiKeyPrompt && !githubTokenPromptVisible ? (
            <div
              role="alert"
              className="mt-3 border-l-[3px] border-danger bg-danger-surface py-3 pl-3.5 pr-3"
            >
              <p className="type-small text-ink">{error}</p>
              {activeScanFailure?.code === "github_rate_limited" && !activeScanFailure.tokenUsed ? (
                <Link href="/settings#github-token" className="link type-small mt-2 inline-block">
                  Add a GitHub token
                </Link>
              ) : null}
              {retryDraft ? (
                <button
                  type="button"
                  onClick={() =>
                    void runProvider({ ...retryDraft.request, retryRunId: retryDraft.runId })
                  }
                  className="btn btn--sm mt-3"
                >
                  Review and retry
                </button>
              ) : null}
            </div>
          ) : null}
          <div ref={messagesEndRef} />
        </div>

        <div className="flex-none border-t-[1.5px] border-panel-edge px-4 pb-4 pt-3">
          {attachment ? (
            <div
              className="mb-2 flex items-center gap-2 text-ink2"
              data-testid="chat-attachment-chip"
            >
              <FileText aria-hidden="true" className="size-4 flex-none" />
              <span className="type-small min-w-0 flex-1 truncate">{attachment.name}</span>
              <IconControl
                label={`Remove ${attachment.name}`}
                tooltipPlacement="top"
                onClick={() => setAttachment(null)}
              >
                <X />
              </IconControl>
            </div>
          ) : null}
          {attachmentError ? (
            <p role="alert" className="type-small mb-2 text-danger">
              {attachmentError}
            </p>
          ) : null}
          <div
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes("Files")) event.preventDefault();
            }}
            onDrop={(event) => {
              const file = event.dataTransfer.files[0];
              if (!file) return;
              event.preventDefault();
              void attachFile(file);
            }}
            className="flex items-end gap-2 rounded-control border-[1.5px] border-rule-strong bg-field py-[5px] pl-1 pr-[5px] transition-colors duration-120 ease-standard hover:border-ink2 has-[textarea:focus]:border-ink has-[textarea:focus]:shadow-[inset_0_0_0_1px_var(--ink)]"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.txt,text/markdown,text/plain"
              tabIndex={-1}
              aria-hidden="true"
              data-testid="chat-attachment-input"
              className="hidden"
              onChange={(event) => {
                void attachFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <IconControl
              label="Attach file"
              tooltipPlacement="top"
              disabled={!ready || streaming}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip />
            </IconControl>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                event.target.style.height = "auto";
                event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`;
              }}
              onPaste={(event) => {
                const file = event.clipboardData.files[0];
                if (!file) return;
                event.preventDefault();
                void attachFile(file);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage({ restoreFocus: true });
                }
              }}
              placeholder={ready ? "Ask anything…" : "Loading local messages…"}
              disabled={!ready || streaming}
              rows={1}
              className="max-h-[120px] min-h-10 flex-1 resize-none bg-transparent py-[9px] text-[0.90625rem] leading-[1.4] text-ink placeholder:text-ink2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 max-[640px]:text-base"
            />
            {streaming ? (
              <button
                type="button"
                onClick={(event) => {
                  if (event.detail === 0) {
                    restoreComposerFocusRef.current = true;
                  }
                  abortRef.current?.abort();
                }}
                className="btn btn--primary group relative size-10 shrink-0 p-0 hover:border-danger hover:bg-danger hover:text-danger-fg focus-visible:border-danger focus-visible:bg-danger focus-visible:text-danger-fg"
                aria-label="Stop request"
              >
                <Loader2
                  aria-hidden="true"
                  className="absolute animate-spin transition-opacity duration-120 group-hover:opacity-0 group-focus-visible:opacity-0"
                />
                <Square
                  aria-hidden="true"
                  className="absolute fill-current opacity-0 transition-opacity duration-120 group-hover:opacity-100 group-focus-visible:opacity-100"
                />
              </button>
            ) : (
              <button
                type="button"
                onClick={(event) => {
                  if (event.detail > 0) {
                    event.currentTarget.blur();
                  }
                  sendMessage({ restoreFocus: event.detail === 0 });
                }}
                disabled={!ready || (!input.trim() && !attachment)}
                className="btn btn--primary size-10 shrink-0 p-0 disabled:opacity-100 disabled:[&>svg]:opacity-45"
                aria-label="Send message"
              >
                <Send aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </aside>
    </NodeNamesContext.Provider>
  );
}
