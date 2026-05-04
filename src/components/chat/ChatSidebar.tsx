"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import UpgradePrompt from "@/components/UpgradePrompt";

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

interface ChatSidebarProps {
  projectId: string;
  repoUrl?: string | null;
  defaultOpen?: boolean;
  scanTrigger?: number;
  onArchitecture?: (architecture: import("@/types/stack").StackArchitecture) => void;
  onStreaming?: (streaming: boolean) => void;
}

type AiAction = "init" | "scan" | "message";

function isMissingApiKeyError(message: string) {
  return /anthropic api key|api key not configured/i.test(message);
}

export default function ChatSidebar({
  projectId,
  repoUrl,
  defaultOpen = false,
  scanTrigger = 0,
  onArchitecture,
  onStreaming,
}: ChatSidebarProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState("");
  const [upgradeFeature, setUpgradeFeature] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [apiKeySaveError, setApiKeySaveError] = useState("");
  const [apiKeyRetryAction, setApiKeyRetryAction] = useState<AiAction | null>(null);
  const [initialized, setInitialized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initCalledRef = useRef(false);
  const lastFailedMessageRef = useRef<string | null>(null);

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
            if (repoUrl) {
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
    if (scanTrigger > 0 && repoUrl) {
      scanRepo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanTrigger]);

  async function processSSEStream(response: Response, action?: AiAction) {
    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let accumulated = "";
    let buffer = "";

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
              onArchitecture?.(event.content);
            } else if (event.type === "error") {
              setError(event.content);
              if (typeof event.content === "string" && isMissingApiKeyError(event.content)) {
                setApiKeyRetryAction(action ?? null);
              }
              setStreaming(false);
              return;
            } else if (event.type === "done") {
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
              setApiKeyRetryAction(null);
              lastFailedMessageRef.current = null;
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
      });
      if (res.status === 403) {
        setUpgradeFeature("access AI chat");
        setStreaming(false);
        return;
      }
      await processSSEStream(res, "init");
    } catch {
      setError("Failed to start conversation");
      setStreaming(false);
    }
  }

  async function scanRepo() {
    setMessages([]);
    setStreaming(true);
    setOpen(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/repo-scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl }),
      });
      if (res.status === 403) {
        setUpgradeFeature("access repo scanning");
        setStreaming(false);
        return;
      }
      if (!res.ok && !res.headers.get("content-type")?.includes("text/event-stream")) {
        const data = await res.json().catch(() => ({ error: "Failed to scan repository" }));
        setError(data.error || "Failed to scan repository");
        if (typeof data.error === "string" && isMissingApiKeyError(data.error)) {
          setApiKeyRetryAction("scan");
        }
        setStreaming(false);
        return;
      }
      await processSSEStream(res, "scan");
    } catch {
      setError("Failed to scan repository");
      setStreaming(false);
    }
  }

  async function sendMessageText(text: string, appendUserMessage: boolean) {
    if (!text || streaming) return;

    if (appendUserMessage) {
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
    setApiKeySaveError("");
    lastFailedMessageRef.current = text;

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (res.status === 403) {
        setUpgradeFeature("continue chatting");
        setStreaming(false);
        return;
      }
      await processSSEStream(res, "message");
    } catch {
      setError("Failed to send message");
      setStreaming(false);
    }
  }

  async function sendMessage() {
    const text = input.trim();
    await sendMessageText(text, true);
  }

  async function saveApiKeyInline(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      setApiKeySaveError("Enter an Anthropic API key first.");
      return;
    }

    setSavingApiKey(true);
    setApiKeySaveError("");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setApiKeySaveError(data.error || "Failed to save API key.");
        return;
      }

      const retryAction = apiKeyRetryAction;
      const retryMessage = lastFailedMessageRef.current;
      setApiKeyInput("");
      setError("");
      setApiKeyRetryAction(null);

      if (retryAction === "scan" && repoUrl) {
        await scanRepo();
      } else if (retryAction === "message" && retryMessage) {
        await sendMessageText(retryMessage, false);
      } else if (retryAction === "init") {
        await initChat();
      }
    } catch {
      setApiKeySaveError("Failed to save API key.");
    } finally {
      setSavingApiKey(false);
    }
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

  const showApiKeyForm = Boolean(error && !upgradeFeature && isMissingApiKeyError(error));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed left-0 top-1/2 z-10 -translate-y-1/2 rounded-r-lg bg-[var(--color-client)] px-2 py-4 text-white shadow-md hover:opacity-90"
        aria-label="Open chat"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="flex h-[45vh] w-full flex-shrink-0 flex-col border-b border-[var(--border)] bg-[var(--background)] md:h-full md:w-[400px] md:border-b-0 md:border-r">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h2 className="font-semibold">Architecture Assistant</h2>
        <button
          onClick={() => setOpen(false)}
          className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          aria-label="Collapse chat"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`mb-4 ${msg.role === "user" ? "text-right" : "text-left"}`}>
            <div
              className={`inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-[var(--color-client)] text-white"
                  : "bg-[var(--muted)] text-[var(--foreground)]"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-sm max-w-none dark:prose-invert [&_p]:m-0 [&_p]:mb-2 [&_p:last-child]:mb-0">
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
          <div className="mb-4 text-left">
            <div className="inline-block max-w-[85%] rounded-lg bg-[var(--muted)] px-3 py-2 text-sm text-[var(--foreground)]">
              <div className="prose prose-sm max-w-none dark:prose-invert [&_p]:m-0 [&_p]:mb-2 [&_p:last-child]:mb-0">
                <ReactMarkdown>{stripStackTags(streamText)}</ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        {/* Typing indicator */}
        {streaming && !streamText && (
          <div className="mb-4 text-left">
            <div className="inline-block rounded-lg bg-[var(--muted)] px-3 py-2">
              <div className="flex space-x-1" data-testid="typing-indicator">
                <span className="inline-block h-2 w-2 rounded-full bg-[var(--muted-foreground)] motion-safe:animate-bounce [animation-delay:0ms]" />
                <span className="inline-block h-2 w-2 rounded-full bg-[var(--muted-foreground)] motion-safe:animate-bounce [animation-delay:150ms]" />
                <span className="inline-block h-2 w-2 rounded-full bg-[var(--muted-foreground)] motion-safe:animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        {upgradeFeature && (
          <div className="mb-4">
            <UpgradePrompt feature={upgradeFeature} onDismiss={() => setUpgradeFeature(null)} />
          </div>
        )}

        {showApiKeyForm && (
          <form
            onSubmit={saveApiKeyInline}
            className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900/60 dark:bg-red-950"
          >
            <p className="font-medium text-red-700 dark:text-red-300">{error}</p>
            <div className="mt-3 flex flex-col gap-2">
              <label
                className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300"
                htmlFor="chat-anthropic-api-key"
              >
                Anthropic API key
              </label>
              <input
                id="chat-anthropic-api-key"
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="sk-ant-..."
                autoComplete="off"
                disabled={savingApiKey}
                className="min-h-10 rounded-md border border-red-200 bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-client)] disabled:opacity-50 dark:border-red-900/70"
              />
              <button
                type="submit"
                disabled={savingApiKey || !apiKeyInput.trim()}
                className="min-h-10 rounded-md bg-[var(--color-client)] px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {savingApiKey ? "Saving..." : "Save and retry"}
              </button>
            </div>
            {apiKeySaveError && (
              <p className="mt-2 text-xs text-red-700 dark:text-red-300">{apiKeySaveError}</p>
            )}
          </form>
        )}

        {error && !upgradeFeature && !showApiKeyForm && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[var(--border)] p-4">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={initialized ? "Describe your application..." : "Waiting for AI..."}
            disabled={streaming || !initialized}
            rows={1}
            className="flex-1 resize-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-client)] disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={streaming || !input.trim()}
            className="rounded-lg bg-[var(--color-client)] p-2 text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            aria-label="Send message"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
