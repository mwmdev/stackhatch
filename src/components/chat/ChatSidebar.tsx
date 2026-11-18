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
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, Loader2, Paperclip, Send, Square, X } from "lucide-react";
import ProviderKeyField from "@/components/projects/ProviderKeyField";
import { AI_PROVIDERS, DEFAULT_AI_SELECTION } from "@/lib/ai/providers";
import IconControl from "@/components/ui/IconControl";
import {
  getBrowserProviderRunCoordinator,
  providerErrorDetails,
  type ProviderRunCoordinator,
  type ProviderRunRequest,
  type RepositorySourceCommit,
} from "@/lib/ai/provider-run";
import type { CanvasPersistenceCommit } from "@/lib/canvas-persistence";
import { stripStackTags } from "@/lib/ai/context-builder";
import { createId } from "@/lib/id";
import {
  ChatAttachmentError,
  composeAttachedMessage,
  composeSourceAttachment,
  parseAttachedMessage,
  readChatAttachment,
  type ChatAttachment,
} from "@/lib/chat-attachment";
import type { ApprovedLocalGeneration } from "@/lib/local-source/generation";
import { readLocalEvidence } from "@/lib/local-source/evidence";
import type { VaultLocalFolder, VaultProjectRecord } from "@/lib/vault/schema";
import type { ProviderKeyManager, ProviderKeyStatus } from "@/lib/provider-key";
import type { ChatMessage } from "@/types/chat";
import type { StackArchitecture, StackNode } from "@/types/stack";

export interface RepositoryScanProvenance {
  repoUrl: string;
  commitSha: string;
  scannedAt: number;
  analysisStatus: "complete" | "partial";
  analysisWarning: string | null;
  /** Folders unchecked in the approved selection. */
  excludedPaths: string[];
}

export interface ArchitectureUpdateMeta {
  source: "scan" | "assistant";
  persisted: true;
  commit: CanvasPersistenceCommit;
  provenance?: RepositoryScanProvenance;
  project?: VaultProjectRecord;
}

export type ArchitectureStreamOutcome = "completed" | "ambiguous";

/** An approved source selection, ready for one generation run. */
export type SourceGenerationRequest = {
  projectId: string;
  generation: ApprovedLocalGeneration;
  nonce: number;
} & (
  | { source: "local"; localFolder: VaultLocalFolder; handle: FileSystemDirectoryHandle }
  | { source: "github"; repository: RepositorySourceCommit }
);

/** A source whose selection the user is asked to review again. */
export type SourceReview =
  | { source: "local"; handle: FileSystemDirectoryHandle; folder: VaultLocalFolder }
  | { source: "github"; repositoryUrl: string; excludedPaths: string[] };

interface ChatSidebarProps {
  projectId: string;
  /** Set when the map was started from an uploaded requirements file. */
  hasRequirementsBrief?: boolean;
  /**
   * Runs the map's one obvious action on arrival, so submitting a brief goes
   * straight to a map. The editor only sets this for a map that has never been
   * generated, since generation replaces the canvas wholesale.
   */
  autoStart?: "brief" | null;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Attaches a node's evidence files, read from GitHub, to the composer. A new nonce asks again. */
  sourceRequest?: { projectId: string; nodeId: string; nonce: number } | null;
  generationRequest?: SourceGenerationRequest | null;
  attachmentRequest?: {
    projectId: string;
    node: StackNode;
    handle: FileSystemDirectoryHandle;
    nonce: number;
  } | null;
  onConsumeSourceRequest?: (nonce: number) => void;
  onConsumeGenerationRequest?: (nonce: number) => void;
  onConsumeAttachmentRequest?: (nonce: number) => void;
  onLocalGenerationCommitted?: (projectId: string, handle: FileSystemDirectoryHandle) => void;
  onReviewSource?: (review: SourceReview) => void;
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
  runId?: string;
  request: ProviderRunRequest;
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
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  sourceRequest = null,
  generationRequest = null,
  attachmentRequest = null,
  onConsumeSourceRequest,
  onConsumeGenerationRequest,
  onConsumeAttachmentRequest,
  onLocalGenerationCommitted,
  onReviewSource,
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
  const [readingSources, setReadingSources] = useState(false);
  const sourcesAbortRef = useRef<AbortController | null>(null);
  const approvedFolderRef = useRef<{ projectId: string; handle: FileSystemDirectoryHandle } | null>(
    null
  );
  const previousSourceRequest = useRef(0);
  const previousGenerationRequest = useRef(0);
  const previousAttachmentRequest = useRef(0);
  // Bumped by every attachment change, so a read that finishes late cannot replace a newer one.
  const attachmentTicketRef = useRef(0);
  const cancelSourceRead = useCallback(() => {
    attachmentTicketRef.current += 1;
    sourcesAbortRef.current?.abort();
    sourcesAbortRef.current = null;
    setReadingSources(false);
  }, []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [keyStatus, setKeyStatus] = useState<ProviderKeyStatus | null>(null);
  const [retryDraft, setRetryDraft] = useState<RetryDraft | null>(null);
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
  const autoStartedRef = useRef(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const previousOpenRef = useRef(open);
  const focusCloseControl = open && !previousOpenRef.current;
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

  // The key prompt renders nothing until it has read its status, so it grows
  // after the scroll above ran; follow its height too.
  const promptVisible = error === KEY_MISSING;
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
      sourcesAbortRef.current?.abort();
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
    async (request: ProviderRunRequest) => {
      const runId = request.retryRunId ?? request.runId ?? createId();
      const nextRequest = { ...request, runId };
      setStreaming(true);
      setStreamText("");
      setError("");
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
        if (request.localFolder && approvedFolderRef.current?.projectId === request.projectId) {
          onLocalGenerationCommitted?.(request.projectId, approvedFolderRef.current.handle);
        }
        if (result.architecture) {
          await onArchitecture?.(result.architecture, {
            source: request.kind === "repository-generation" ? "scan" : "assistant",
            persisted: true,
            commit: {
              projectRevision: result.project.revision,
              vaultGeneration: result.generation,
            },
            ...(request.localFolder ? { project: result.project } : {}),
            ...(request.repositorySource
              ? {
                  provenance: {
                    repoUrl: request.repositorySource.repositoryUrl,
                    commitSha: request.repositorySource.commitSha,
                    scannedAt: result.project.updatedAt,
                    analysisStatus: request.repositorySource.analysisStatus,
                    analysisWarning: request.repositorySource.warning,
                    excludedPaths: request.repositorySource.excludedPaths,
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
          if (message === KEY_MISSING && (request.localFolder || request.repositorySource)) {
            setKeyStatus({
              provider: request.selection?.provider ?? DEFAULT_AI_SELECTION.provider,
              state: "absent",
              generation: "",
            });
            setRetryDraft({ request: { ...request, runId: undefined, retryRunId: undefined } });
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
      finishBarrier,
      onArchitecture,
      onArchitectureStreamStart,
      onProviderCommitStart,
      onProviderCommit,
      onLocalGenerationCommitted,
      projectId,
      publishStreamText,
      refreshMessages,
    ]
  );

  useEffect(() => {
    if (
      !generationRequest ||
      generationRequest.projectId !== projectId ||
      !ready ||
      streaming ||
      generationRequest.nonce === previousGenerationRequest.current
    )
      return;
    previousGenerationRequest.current = generationRequest.nonce;
    const { generation } = generationRequest;
    onConsumeGenerationRequest?.(generationRequest.nonce);
    const source =
      generationRequest.source === "local"
        ? { localFolder: generationRequest.localFolder }
        : { repositorySource: generationRequest.repository };
    if (generationRequest.source === "local") {
      approvedFolderRef.current = { projectId, handle: generationRequest.handle };
    }
    void runProvider({
      projectId,
      kind: "repository-generation",
      prompt: generation.summary,
      sourceContext: generation.context,
      citablePaths: generation.citablePaths,
      selection: generation.selection,
      customSubtypes: generation.customSubtypes,
      ...source,
    });
  }, [generationRequest, onConsumeGenerationRequest, projectId, ready, runProvider, streaming]);

  useEffect(() => {
    if (!autoStart || autoStartedRef.current) return;
    if (!ready || streaming || messages.length > 0) return;
    if (!keyStatus || keyStatus.state === "absent") return;
    autoStartedRef.current = true;
    void runProvider({ projectId, kind: "initialization" });
  }, [autoStart, keyStatus, messages.length, projectId, ready, runProvider, streaming]);

  const attachNodeSources = useCallback(
    async (nodeId: string) => {
      setSidebarOpen(true);
      setAttachmentError("");
      cancelSourceRead();
      const ticket = attachmentTicketRef.current;
      setReadingSources(true);
      const controller = new AbortController();
      sourcesAbortRef.current = controller;
      try {
        const sources = await coordinator.readNodeSources(projectId, nodeId, {
          signal: controller.signal,
        });
        if (controller.signal.aborted || ticket !== attachmentTicketRef.current) return;
        if (sources.files.length === 0) {
          setAttachmentError("GitHub returned none of this component's files.");
          return;
        }
        setAttachment(
          composeSourceAttachment({
            ...sources,
            origin: `${sources.repositoryUrl} at ${sources.commitSha}`,
          })
        );
        restoreComposerFocusRef.current = true;
      } catch (readError) {
        if (!controller.signal.aborted && ticket === attachmentTicketRef.current) {
          setAttachmentError(providerErrorDetails(readError).message);
        }
      } finally {
        if (sourcesAbortRef.current === controller) {
          sourcesAbortRef.current = null;
          setReadingSources(false);
        }
      }
    },
    [cancelSourceRead, coordinator, projectId, setSidebarOpen]
  );

  useEffect(() => {
    if (
      !sourceRequest ||
      sourceRequest.projectId !== projectId ||
      sourceRequest.nonce === previousSourceRequest.current
    )
      return;
    previousSourceRequest.current = sourceRequest.nonce;
    onConsumeSourceRequest?.(sourceRequest.nonce);
    void attachNodeSources(sourceRequest.nodeId);
  }, [sourceRequest, projectId, onConsumeSourceRequest, attachNodeSources]);

  useEffect(() => {
    if (
      !attachmentRequest ||
      attachmentRequest.projectId !== projectId ||
      attachmentRequest.nonce === previousAttachmentRequest.current
    )
      return;
    previousAttachmentRequest.current = attachmentRequest.nonce;
    const { handle, node, nonce } = attachmentRequest;
    onConsumeAttachmentRequest?.(nonce);
    cancelSourceRead();
    const ticket = attachmentTicketRef.current;
    const controller = new AbortController();
    sourcesAbortRef.current = controller;
    setReadingSources(true);
    setAttachmentError("");
    setSidebarOpen(true);
    void readLocalEvidence(handle, node.evidence ?? [], { signal: controller.signal })
      .then(({ files, omitted }) => {
        if (controller.signal.aborted || ticket !== attachmentTicketRef.current) return;
        if (!files.length) {
          setAttachmentError(`None of this component's files were found in ${handle.name}.`);
          return;
        }
        setAttachment(
          composeSourceAttachment({
            node,
            origin: `the local folder ${handle.name}`,
            files,
            omitted,
          })
        );
        restoreComposerFocusRef.current = true;
      })
      .catch(() => {
        if (!controller.signal.aborted && ticket === attachmentTicketRef.current)
          setAttachmentError("The local files could not be read.");
      })
      .finally(() => {
        if (sourcesAbortRef.current === controller) {
          sourcesAbortRef.current = null;
          setReadingSources(false);
        }
      });
  }, [attachmentRequest, cancelSourceRead, onConsumeAttachmentRequest, projectId, setSidebarOpen]);

  useEffect(() => {
    if (!open || streaming || readingSources || !ready || !restoreComposerFocusRef.current) return;
    restoreComposerFocusRef.current = false;
    textareaRef.current?.focus();
  }, [attachment, open, readingSources, ready, streaming]);

  async function attachFile(file: File | undefined) {
    if (!file || !ready || streaming) return;
    cancelSourceRead();
    const ticket = attachmentTicketRef.current;
    try {
      const read = await readChatAttachment(file);
      if (ticket !== attachmentTicketRef.current) return;
      setAttachment(read);
      setAttachmentError("");
    } catch (attachError) {
      if (ticket !== attachmentTicketRef.current) return;
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
    if ((!input.trim() && !attachment) || streaming || readingSources) return;
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

  function reviewAndRetry() {
    if (!retryDraft) return;
    const { localFolder, repositorySource } = retryDraft.request;
    if (repositorySource) {
      onReviewSource?.({
        source: "github",
        repositoryUrl: repositorySource.repositoryUrl,
        excludedPaths: repositorySource.excludedPaths,
      });
      return;
    }
    if (localFolder) {
      const approved = approvedFolderRef.current;
      if (approved?.projectId === projectId) {
        onReviewSource?.({ source: "local", handle: approved.handle, folder: localFolder });
      }
      return;
    }
    void runProvider({
      ...retryDraft.request,
      ...(retryDraft.runId ? { retryRunId: retryDraft.runId } : {}),
    });
  }

  const showApiKeyPrompt = error === KEY_MISSING;
  const providerName = keyStatus ? AI_PROVIDERS[keyStatus.provider].name : "your AI provider";
  // Exactly one next step at a time. Anything further along in the flow owns
  // the panel, so the opening card retires as soon as one of them appears.
  const showStartCard = messages.length === 0 && !streaming && !error;

  if (!open) return null;

  const hasTurns = messages.length > 0;
  const startAction = hasRequirementsBrief
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
                {hasRequirementsBrief
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
                provider={
                  retryDraft?.request.localFolder || retryDraft?.request.repositorySource
                    ? retryDraft.request.selection?.provider
                    : undefined
                }
                onReady={(status) => {
                  setKeyStatus(status);
                  if (status.state === "absent") return;
                  if (!retryDraft) setError("");
                  if (pendingKeySendRef.current && (input.trim() || attachment)) {
                    pendingKeySendRef.current = false;
                    const text = takeComposerMessage();
                    void runProvider({ projectId, kind: "chat", prompt: text });
                  }
                }}
              />
              {retryDraft && keyStatus?.state !== "absent" ? (
                <button
                  type="button"
                  className="btn btn--sm mt-3"
                  onClick={reviewAndRetry}
                  disabled={Boolean(
                    (retryDraft.request.localFolder || retryDraft.request.repositorySource) &&
                    !onReviewSource
                  )}
                >
                  Review and retry
                </button>
              ) : null}
            </div>
          ) : null}

          {error && !showApiKeyPrompt ? (
            <div
              role="alert"
              className="mt-3 border-l-[3px] border-danger bg-danger-surface py-3 pl-3.5 pr-3"
            >
              <p className="type-small text-ink">{error}</p>
              {retryDraft ? (
                <button
                  type="button"
                  onClick={reviewAndRetry}
                  disabled={Boolean(
                    (retryDraft.request.localFolder || retryDraft.request.repositorySource) &&
                    !onReviewSource
                  )}
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
                onClick={() => {
                  cancelSourceRead();
                  setAttachment(null);
                }}
              >
                <X />
              </IconControl>
            </div>
          ) : null}
          {readingSources ? (
            <p role="status" className="type-small mb-2 flex items-center gap-2 text-ink2">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              Reading files…
            </p>
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
                disabled={!ready || readingSources || (!input.trim() && !attachment)}
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
