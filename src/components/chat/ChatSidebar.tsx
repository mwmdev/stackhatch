"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { Loader2, MessageSquareText, SendHorizontal, X } from "lucide-react";
import IconControl from "@/components/ui/IconControl";
import type { StackArchitecture } from "@/types/stack";
import { trackEvent, type AnalyticsErrorCategory } from "@/lib/analytics";

function stripStackTags(text: string): string {
  return text
    .replace(/<stack>\s*[\s\S]*?\s*<\/stack>/g, "")
    .replace(/<stack>[\s\S]*$/g, "")
    .trim();
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface RepositoryScanProvenance {
  repoUrl: string;
  commitSha: string;
  scannedAt: number;
  analysisStatus: "complete" | "partial";
  analysisWarning: string | null;
}

export interface ArchitectureUpdateMeta {
  source: "scan";
  provenance?: RepositoryScanProvenance;
}

interface ChatSidebarProps {
  projectId: string;
  repoUrl?: string | null;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showCollapsedButton?: boolean;
  scanTrigger?: number;
  canvasState?: StackArchitecture | null;
  onArchitecture?: (architecture: StackArchitecture, meta?: ArchitectureUpdateMeta) => void;
  onStreaming?: (streaming: boolean) => void;
  onScanStateChange?: (scanning: boolean) => void;
}

function isMissingApiKeyError(message: string) {
  return /AI_NOT_CONFIGURED|anthropic api key|api key not configured/i.test(message);
}

function normalizeRepoUrl(repoUrl?: string | null) {
  const value = repoUrl?.trim();
  if (!value || value === "null" || value === "undefined") return "";
  return value;
}

function scanErrorCategory(code?: string): AnalyticsErrorCategory {
  switch (code) {
    case "invalid_url":
      return "invalid_url";
    case "not_found_or_private":
      return "not_found_or_private";
    case "github_rate_limited":
      return "github_rate_limit";
    case "github_unavailable":
      return "provider_unavailable";
    case "analysis_limit":
      return "analysis_limit";
    case "AI_NOT_CONFIGURED":
      return "missing_key";
    case "AI_AUTH_FAILED":
      return "provider_auth";
    case "AI_RATE_LIMITED":
      return "provider_rate_limit";
    case "AI_MODEL_UNAVAILABLE":
      return "provider_unavailable";
    case "AI_REQUEST_FAILED":
      return "provider_unavailable";
    default:
      return "unknown";
  }
}

export default function ChatSidebar({
  projectId,
  repoUrl,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  showCollapsedButton = true,
  scanTrigger = 0,
  canvasState,
  onArchitecture,
  onStreaming,
  onScanStateChange,
}: ChatSidebarProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState("");
  const [initialized, setInitialized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initCalledRef = useRef(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const normalizedRepoUrl = normalizeRepoUrl(repoUrl);

  const setSidebarOpen = useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange]
  );

  useEffect(() => {
    onStreaming?.(streaming);
  }, [streaming, onStreaming]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamText, scrollToBottom]);

  // Load existing messages
  useEffect(() => {
    let cancelled = false;

    async function loadMessages() {
      try {
        const res = await fetch(`/api/projects/${projectId}/messages`);
        if (res.ok) {
          const data = await res.json();
          if (cancelled) return;
          // Filter out the init instruction message from display
          const displayMessages = data.filter(
            (m: Message) =>
              !(
                m.role === "user" &&
                (m.content.startsWith("Begin the architecture interview") ||
                  m.content.startsWith("Analyze this GitHub repository"))
              )
          );
          setMessages(displayMessages);
          setInitialized(data.length > 0);

          // If no messages, trigger chat init or repo scan
          if (data.length === 0 && !initCalledRef.current) {
            initCalledRef.current = true;
            if (normalizedRepoUrl) {
              scanRepo();
            } else {
              initChat();
            }
          }
        }
      } catch {
        if (cancelled) return;
        setError("Failed to load messages");
      }
    }
    loadMessages();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Re-scan when toolbar button triggers it
  useEffect(() => {
    if (scanTrigger > 0 && normalizedRepoUrl) {
      scanRepo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanTrigger]);

  async function processSSEStream(response: Response, context?: "scan") {
    const reader = response.body?.getReader();
    if (!reader) {
      if (context === "scan") {
        trackEvent("repository_scan_failed", {
          location: "editor",
          error_category: "server",
        });
      }
      return;
    }

    const decoder = new TextDecoder();
    let accumulated = "";
    let buffer = "";
    let receivedArchitecture = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6);
          try {
            const event = JSON.parse(jsonStr);
            if (event.type === "text") {
              accumulated += event.content;
              setStreamText(accumulated);
            } else if (event.type === "architecture") {
              const usableArchitecture =
                event.content &&
                Array.isArray(event.content.nodes) &&
                event.content.nodes.length > 0 &&
                Array.isArray(event.content.edges);
              if (context === "scan" && !usableArchitecture) {
                setError("StackHatch could not produce a usable map. Your current map was kept.");
                trackEvent("repository_scan_failed", {
                  location: "editor",
                  error_category: "unknown",
                });
                setStreaming(false);
                return;
              }
              if (usableArchitecture) {
                receivedArchitecture = true;
                if (context === "scan") setMessages([]);
                onArchitecture?.(
                  event.content,
                  context === "scan" ? { source: "scan", provenance: event.provenance } : undefined
                );
              }
            } else if (event.type === "error") {
              setError(event.content);
              if (context === "scan") {
                trackEvent("repository_scan_failed", {
                  location: "editor",
                  error_category: scanErrorCategory(event.code),
                });
              }
              setStreaming(false);
              return;
            } else if (event.type === "done") {
              if (context === "scan" && !receivedArchitecture) {
                setError("StackHatch could not produce a usable map. Your current map was kept.");
                trackEvent("repository_scan_failed", {
                  location: "editor",
                  error_category: "unknown",
                });
                setStreamText("");
                setStreaming(false);
                return;
              }
              // Add the completed message to messages list
              if (accumulated) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: `stream-${Date.now()}`,
                    role: "assistant",
                    content: accumulated,
                    createdAt: Date.now(),
                  },
                ]);
              }
              setStreamText("");
              setStreaming(false);
              setInitialized(true);
              if (context === "scan") {
                trackEvent("repository_scan_succeeded", { location: "editor" });
              }
              return;
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
      setStreaming(false);
    }
  }

  async function initChat() {
    setStreaming(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/chat/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(canvasState ? { canvasState } : {}),
      });
      if (!res.ok && !res.headers.get("content-type")?.includes("text/event-stream")) {
        const data = await res.json().catch(() => ({ error: "Failed to start conversation" }));
        setError(
          data.code === "AI_NOT_CONFIGURED"
            ? "AI_NOT_CONFIGURED"
            : data.error || "Failed to start conversation"
        );
        setStreaming(false);
        return;
      }
      await processSSEStream(res);
    } catch {
      setError("Failed to start conversation");
      setStreaming(false);
    }
  }

  async function scanRepo() {
    setStreaming(true);
    setSidebarOpen(true);
    setError("");
    onScanStateChange?.(true);
    trackEvent("repository_scan_started", { location: "editor" });
    try {
      const res = await fetch(`/api/projects/${projectId}/repo-scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: normalizedRepoUrl }),
      });
      if (!res.ok && !res.headers.get("content-type")?.includes("text/event-stream")) {
        const data = await res.json().catch(() => ({ error: "Failed to scan repository" }));
        setError(
          data.code === "AI_NOT_CONFIGURED"
            ? "AI_NOT_CONFIGURED"
            : data.error || "Failed to scan repository"
        );
        trackEvent("repository_scan_failed", {
          location: "editor",
          error_category: scanErrorCategory(data.code),
        });
        setStreaming(false);
        return;
      }
      await processSSEStream(res, "scan");
    } catch {
      setError("Failed to scan repository");
      trackEvent("repository_scan_failed", {
        location: "editor",
        error_category: "network",
      });
      setStreaming(false);
    } finally {
      onScanStateChange?.(false);
    }
  }

  async function sendMessageText(text: string, appendUserMessage: boolean) {
    if (!text || streaming) return;

    if (appendUserMessage) {
      trackEvent("architecture_question_sent", { location: "editor" });
      const userMsg: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
    }
    setInput("");
    setStreaming(true);
    setError("");

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(canvasState ? { message: text, canvasState } : { message: text }),
      });
      if (!res.ok && !res.headers.get("content-type")?.includes("text/event-stream")) {
        const data = await res.json().catch(() => ({ error: "Failed to send message" }));
        setError(
          data.code === "AI_NOT_CONFIGURED"
            ? "AI_NOT_CONFIGURED"
            : data.error || "Failed to send message"
        );
        setStreaming(false);
        return;
      }
      await processSSEStream(res);
    } catch {
      setError("Failed to send message");
      setStreaming(false);
    }
  }

  async function sendMessage() {
    const text = input.trim();
    await sendMessageText(text, true);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    // Auto-grow textarea
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  const showApiKeyPrompt = Boolean(error && isMissingApiKeyError(error));

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
    <div className="relative flex h-[45vh] w-full flex-shrink-0 flex-col border-b border-[var(--border)] bg-[var(--background)] md:h-full md:w-[400px] md:border-b-0 md:border-r">
      <div
        aria-hidden="true"
        data-testid="chat-scroll-overlay"
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[3.75rem] border-b border-[var(--border)] bg-[var(--background)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--background)]/85"
      />
      {controlledOpen !== undefined && onOpenChange && (
        <div className="absolute right-2 top-2 z-20">
          <IconControl
            label="Close chat"
            tooltipPlacement="left"
            onClick={() => setSidebarOpen(false)}
          >
            <X />
          </IconControl>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-[4.25rem]">
        <div className="space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              data-testid={`chat-message-${msg.role}`}
              className="border-b border-[var(--border)] pb-4 last:border-b-0"
            >
              <div className="mb-1.5 flex items-center gap-2">
                <span
                  className={`text-[0.6875rem] font-semibold uppercase tracking-[0.08em] ${
                    msg.role === "user"
                      ? "text-[var(--color-client)]"
                      : "text-[var(--muted-foreground)]"
                  }`}
                >
                  {msg.role === "user" ? "You" : "StackHatch"}
                </span>
              </div>
              <div
                className={`max-w-[72ch] text-[0.9375rem] leading-7 text-[var(--foreground)] ${
                  msg.role === "user" ? "whitespace-pre-wrap" : ""
                }`}
              >
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert [&_li]:my-1 [&_ol]:my-3 [&_p]:m-0 [&_p+p]:mt-3 [&_ul]:my-3">
                    <ReactMarkdown>{stripStackTags(msg.content)}</ReactMarkdown>
                  </div>
                ) : (
                  <span>{msg.content}</span>
                )}
              </div>
            </div>
          ))}

          {/* Streaming response */}
          {streaming && streamText && (
            <div
              data-testid="chat-message-assistant-streaming"
              className="border-b border-[var(--border)] pb-4 last:border-b-0"
            >
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
                  StackHatch
                </span>
              </div>
              <div className="prose prose-sm max-w-[72ch] text-[0.9375rem] leading-7 dark:prose-invert [&_li]:my-1 [&_ol]:my-3 [&_p]:m-0 [&_p+p]:mt-3 [&_ul]:my-3">
                <ReactMarkdown>{stripStackTags(streamText)}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* Typing indicator */}
          {streaming && !streamText && (
            <div className="border-b border-[var(--border)] pb-4 last:border-b-0">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
                  StackHatch
                </span>
              </div>
              <div className="flex min-h-7 items-center">
                <div className="flex space-x-1" data-testid="typing-indicator">
                  <span className="inline-block h-2 w-2 rounded-full bg-[var(--muted-foreground)] motion-safe:animate-bounce [animation-delay:0ms]" />
                  <span className="inline-block h-2 w-2 rounded-full bg-[var(--muted-foreground)] motion-safe:animate-bounce [animation-delay:150ms]" />
                  <span className="inline-block h-2 w-2 rounded-full bg-[var(--muted-foreground)] motion-safe:animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          {showApiKeyPrompt && (
            <div className="rounded-lg border border-[var(--warning-border)] bg-[var(--warning-surface)] p-3 text-sm shadow-sm shadow-[var(--shadow-color)]">
              <p className="font-medium text-[var(--foreground)]">
                Connect your Anthropic account to use AI features.
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">
                Your API key is encrypted and stored with your account.
              </p>
              <Link
                href="/settings?setup=anthropic"
                className="mt-3 inline-flex min-h-10 items-center rounded-md bg-[var(--brand)] px-3 py-2 text-sm font-bold text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)]"
              >
                Open Settings
              </Link>
            </div>
          )}

          {error && !showApiKeyPrompt && (
            <div className="rounded-lg border border-[var(--danger-border)] bg-[var(--danger-surface)] px-3 py-2 text-sm text-[var(--danger)]">
              {error}
            </div>
          )}
        </div>

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-[var(--border)] bg-[var(--card)] p-3">
        <div className="flex items-end gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 transition-colors focus-within:border-[var(--color-client)] focus-within:ring-2 focus-within:ring-[var(--color-client)]/20">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={initialized ? "Message..." : "Waiting for AI..."}
            disabled={streaming || !initialized}
            rows={1}
            className="max-h-[120px] min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-5 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={streaming || !input.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--brand)] text-[var(--brand-foreground)] transition-colors hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send message"
          >
            {streaming ? (
              <Loader2
                className="h-[18px] w-[18px] animate-spin"
                data-testid="send-button-spinner"
              />
            ) : (
              <SendHorizontal className="h-[18px] w-[18px]" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
