import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ChatSidebar from "./ChatSidebar";

const { mockTrackEvent } = vi.hoisted(() => ({ mockTrackEvent: vi.fn() }));

vi.mock("@/lib/analytics", () => ({
  trackEvent: mockTrackEvent,
}));

// Mock react-markdown to render plain text (avoids ESM issues in jsdom)
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <span>{children}</span>,
}));

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

function createSSEResponse(
  events: Array<{ type: string; content?: unknown; code?: string; provenance?: unknown }>
) {
  const lines = events.map((e) => `data: ${JSON.stringify(e)}`).join("\n\n");
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(lines + "\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

function mockFetch(handlers: Record<string, () => Promise<Response> | Response>) {
  return vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    const url = String(input);
    for (const [pattern, handler] of Object.entries(handlers)) {
      if (url.includes(pattern)) {
        const method = options?.method ?? "GET";
        if (pattern.includes("chat/init") && method === "POST") return handler();
        if (pattern.includes("/chat") && !pattern.includes("init") && method === "POST")
          return handler();
        if (pattern.includes("repo-scan") && method === "POST") return handler();
        if (pattern.includes("/api/settings") && method === "PATCH") return handler();
        if (method === "GET") return handler();
      }
    }
    return new Response("Not found", { status: 404 });
  });
}

const emptyMessagesResponse = () =>
  Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));

const messagesWithHistory = () =>
  Promise.resolve(
    new Response(
      JSON.stringify([
        {
          id: "m1",
          role: "assistant",
          content: "Welcome! What are you building?",
          createdAt: 1000,
        },
        { id: "m2", role: "user", content: "A chat application", createdAt: 2000 },
        {
          id: "m3",
          role: "assistant",
          content: "Great choice! **Real-time** features are interesting.",
          createdAt: 3000,
        },
      ]),
      { status: 200 }
    )
  );

describe("ChatSidebar", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockTrackEvent.mockClear();
  });

  it("renders collapsed state with open button when defaultOpen is false", () => {
    global.fetch = mockFetch({
      "/messages": emptyMessagesResponse,
      "/chat/init": () => createSSEResponse([{ type: "done" }]),
    });

    render(<ChatSidebar projectId="p1" defaultOpen={false} />);
    expect(screen.getByLabelText("Open chat")).toBeInTheDocument();
    expect(screen.queryByText("Architecture Assistant")).not.toBeInTheDocument();
  });

  it("renders open state without title/status chrome and offers a controlled close control", async () => {
    global.fetch = mockFetch({
      "/messages": messagesWithHistory,
    });

    const onOpenChange = vi.fn();
    render(<ChatSidebar projectId="p1" open onOpenChange={onOpenChange} />);
    await waitFor(() => {
      expect(screen.getByText("Welcome! What are you building?")).toBeInTheDocument();
    });

    expect(screen.queryByText("Architecture Assistant")).not.toBeInTheDocument();
    expect(screen.queryByText("Ready")).not.toBeInTheDocument();
    expect(screen.queryByText("Starting")).not.toBeInTheDocument();
    expect(screen.queryByText("Thinking")).not.toBeInTheDocument();
    const closeButton = screen.getByRole("button", { name: "Close chat" });
    expect(closeButton).toHaveClass("icon-control");
    fireEvent.click(closeButton);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByTestId("chat-scroll-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("chat-scroll-overlay")).toHaveClass("h-[3.75rem]");
    expect(screen.getByPlaceholderText("Message...")).toBeInTheDocument();
  });

  it("opens from the collapsed trigger", async () => {
    global.fetch = mockFetch({
      "/messages": messagesWithHistory,
    });

    render(<ChatSidebar projectId="p1" defaultOpen={false} />);

    expect(screen.getByLabelText("Open chat")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Open chat"));
    expect(screen.queryByLabelText("Open chat")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Collapse chat")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Waiting for AI...")).toBeInTheDocument();
  });

  it("supports controlled open state without the collapsed fixed trigger", () => {
    const onOpenChange = vi.fn();
    global.fetch = mockFetch({
      "/messages": messagesWithHistory,
    });

    const { rerender } = render(
      <ChatSidebar
        projectId="p1"
        open={true}
        onOpenChange={onOpenChange}
        showCollapsedButton={false}
      />
    );

    expect(screen.getByRole("button", { name: "Close chat" })).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();

    rerender(
      <ChatSidebar
        projectId="p1"
        open={false}
        onOpenChange={onOpenChange}
        showCollapsedButton={false}
      />
    );
    expect(screen.queryByLabelText("Open chat")).not.toBeInTheDocument();
  });

  it("moves focus into the sidebar when a controlled chat opens", async () => {
    const onOpenChange = vi.fn();
    global.fetch = mockFetch({
      "/messages": messagesWithHistory,
    });

    const { rerender } = render(
      <ChatSidebar
        projectId="p1"
        open={false}
        onOpenChange={onOpenChange}
        showCollapsedButton={false}
      />
    );

    rerender(
      <ChatSidebar
        projectId="p1"
        open={true}
        onOpenChange={onOpenChange}
        showCollapsedButton={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Close chat" })).toHaveFocus();
    });
  });

  it("loads and displays message history", async () => {
    global.fetch = mockFetch({
      "/messages": messagesWithHistory,
    });

    render(<ChatSidebar projectId="p1" defaultOpen={true} />);

    await waitFor(() => {
      expect(screen.getByText("Welcome! What are you building?")).toBeInTheDocument();
    });
    expect(screen.getByText("A chat application")).toBeInTheDocument();
    expect(screen.getByText(/Real-time/)).toBeInTheDocument();
  });

  it("renders user messages as readable transcript entries", async () => {
    global.fetch = mockFetch({
      "/messages": messagesWithHistory,
    });

    render(<ChatSidebar projectId="p1" defaultOpen={true} />);

    await waitFor(() => {
      expect(screen.getByText("A chat application")).toBeInTheDocument();
    });

    const userMsg = screen.getByText("A chat application");
    const userEntry = screen.getByTestId("chat-message-user");
    expect(userEntry).toContainElement(userMsg);
    expect(userEntry).toHaveTextContent("You");
    expect(userMsg.closest("[class*='text-right']")).not.toBeInTheDocument();
  });

  it("renders assistant messages as readable transcript entries", async () => {
    global.fetch = mockFetch({
      "/messages": messagesWithHistory,
    });

    render(<ChatSidebar projectId="p1" defaultOpen={true} />);

    await waitFor(() => {
      expect(screen.getByText("Welcome! What are you building?")).toBeInTheDocument();
    });

    const assistantMsg = screen.getByText("Welcome! What are you building?");
    const assistantEntries = screen.getAllByTestId("chat-message-assistant");
    expect(assistantEntries[0]).toContainElement(assistantMsg);
    expect(assistantEntries[0]).toHaveTextContent("StackHatch");
  });

  it("renders markdown in assistant messages", async () => {
    global.fetch = mockFetch({
      "/messages": messagesWithHistory,
    });

    render(<ChatSidebar projectId="p1" defaultOpen={true} />);

    await waitFor(() => {
      // ReactMarkdown mock renders the raw markdown as text
      expect(screen.getByText(/Real-time/)).toBeInTheDocument();
    });
  });

  it("sends message on Enter key", async () => {
    let chatCalled = false;
    global.fetch = mockFetch({
      "/messages": messagesWithHistory,
      "/chat": () => {
        chatCalled = true;
        return createSSEResponse([{ type: "text", content: "Interesting!" }, { type: "done" }]);
      },
    });

    render(<ChatSidebar projectId="p1" defaultOpen={true} />);

    await waitFor(() => {
      expect(screen.getByText("A chat application")).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText("Message...");
    fireEvent.change(textarea, { target: { value: "I need WebSocket support" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(chatCalled).toBe(true);
    });

    // User message should appear immediately
    expect(screen.getByText("I need WebSocket support")).toBeInTheDocument();
  });

  it("includes the latest canvas state when sending a message", async () => {
    let chatBody: { message?: string; canvasState?: unknown } | null = null;
    global.fetch = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      const method = options?.method ?? "GET";

      if (url.includes("/messages")) {
        return messagesWithHistory();
      }
      if (url.includes("/chat") && method === "POST") {
        chatBody = JSON.parse(options?.body as string);
        return createSSEResponse([{ type: "text", content: "Updated" }, { type: "done" }]);
      }
      return new Response("Not found", { status: 404 });
    }) as typeof fetch;

    render(
      <ChatSidebar
        projectId="p1"
        defaultOpen={true}
        canvasState={{
          nodes: [
            {
              id: "note-1",
              category: "note",
              subtype: "note",
              name: "Live Note",
              technology: "",
              description: "Unsaved edit",
              reasoning: "",
              locked: false,
              noteColor: "lilac",
            },
          ],
          edges: [],
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("A chat application")).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText("Message...");
    fireEvent.change(textarea, { target: { value: "Use latest note" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(chatBody?.message).toBe("Use latest note");
      expect(chatBody?.canvasState).toEqual({
        nodes: [
          {
            id: "note-1",
            category: "note",
            subtype: "note",
            name: "Live Note",
            technology: "",
            description: "Unsaved edit",
            reasoning: "",
            locked: false,
            noteColor: "lilac",
          },
        ],
        edges: [],
      });
    });
  });

  it("does not send message on Shift+Enter", async () => {
    let chatCalled = false;
    global.fetch = mockFetch({
      "/messages": messagesWithHistory,
      "/chat": () => {
        chatCalled = true;
        return createSSEResponse([{ type: "done" }]);
      },
    });

    render(<ChatSidebar projectId="p1" defaultOpen={true} />);

    await waitFor(() => {
      expect(screen.getByText("A chat application")).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText("Message...");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    // Wait briefly and verify chat was NOT called
    await new Promise((r) => setTimeout(r, 50));
    expect(chatCalled).toBe(false);
  });

  it("shows typing indicator during streaming before text arrives", async () => {
    // Return a stream that never finishes to keep streaming state
    global.fetch = mockFetch({
      "/messages": emptyMessagesResponse,
      "/chat/init": () => {
        const stream = new ReadableStream({
          start() {
            // Never close — keeps streaming state active
          },
        });
        return new Response(stream, {
          headers: { "Content-Type": "text/event-stream" },
        });
      },
    });

    render(<ChatSidebar projectId="p1" defaultOpen={true} />);

    await waitFor(() => {
      expect(screen.getByTestId("typing-indicator")).toBeInTheDocument();
    });

    const sendButton = screen.getByLabelText("Send message");
    expect(sendButton).toContainElement(screen.getByTestId("send-button-spinner"));
  });

  it("clears input after sending a message", async () => {
    global.fetch = mockFetch({
      "/messages": messagesWithHistory,
      "/chat": () => createSSEResponse([{ type: "text", content: "Response" }, { type: "done" }]),
    });

    render(<ChatSidebar projectId="p1" defaultOpen={true} />);

    await waitFor(() => {
      expect(screen.getByText("A chat application")).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText("Message...") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Test message" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(textarea.value).toBe("");
  });

  it("disables input while streaming", async () => {
    global.fetch = mockFetch({
      "/messages": emptyMessagesResponse,
      "/chat/init": () => {
        const stream = new ReadableStream({
          start() {
            // Never close — keeps streaming state
          },
        });
        return new Response(stream, {
          headers: { "Content-Type": "text/event-stream" },
        });
      },
    });

    render(<ChatSidebar projectId="p1" defaultOpen={true} />);

    await waitFor(() => {
      const textarea = screen.getByPlaceholderText("Waiting for AI...");
      expect(textarea).toBeDisabled();
    });
  });

  it("shows the BYOK settings prompt when the key is missing", async () => {
    global.fetch = mockFetch({
      "/messages": emptyMessagesResponse,
      "/chat/init": () => createSSEResponse([{ type: "error", content: "API key not configured" }]),
    });

    render(<ChatSidebar projectId="p1" defaultOpen={true} />);

    await waitFor(() => {
      expect(
        screen.getByText("Connect your Anthropic account to use AI features.")
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Open Settings" })).toHaveAttribute(
      "href",
      "/settings?setup=anthropic"
    );
  });

  it("discards transient assistant text when the project becomes unavailable", async () => {
    global.fetch = mockFetch({
      "/messages": messagesWithHistory,
      "/chat": () =>
        createSSEResponse([
          { type: "text", content: "Uncommitted private response" },
          {
            type: "error",
            code: "PROJECT_UNAVAILABLE",
            content: "server-controlled copy must not be trusted",
          },
        ]),
    });

    render(<ChatSidebar projectId="p1" defaultOpen={true} />);

    const textarea = await screen.findByPlaceholderText("Message...");
    fireEvent.change(textarea, { target: { value: "Continue" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await screen.findByText(
      "This project is no longer available. Return to your maps or sign in again."
    );
    expect(screen.queryByText("Uncommitted private response")).not.toBeInTheDocument();
    expect(
      screen.queryByText("server-controlled copy must not be trusted")
    ).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Waiting for AI...")).toBeDisabled();
  });

  it("never asks for an Anthropic key inside the project editor", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      const method = options?.method ?? "GET";

      if (url.includes("/messages")) {
        return emptyMessagesResponse();
      }

      if (url.includes("/chat/init") && method === "POST") {
        return createSSEResponse([
          {
            type: "error",
            content: "Add your Anthropic API key in Settings to use StackHatch AI.",
          },
        ]);
      }

      return new Response("Not found", { status: 404 });
    }) as typeof fetch;

    render(<ChatSidebar projectId="p1" defaultOpen={true} />);

    await screen.findByRole("link", { name: "Open Settings" });
    expect(screen.queryByLabelText("Anthropic API key")).not.toBeInTheDocument();
    expect(
      (global.fetch as ReturnType<typeof vi.fn>).mock.calls.some(
        (call) => call[0] === "/api/settings"
      )
    ).toBe(false);
  });

  it("displays error when message load fails", async () => {
    global.fetch = vi.fn(async (_input: RequestInfo | URL) => {
      throw new Error("Network error");
    }) as typeof fetch;

    render(<ChatSidebar projectId="p1" defaultOpen={true} />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load messages")).toBeInTheDocument();
    });
  });

  it("triggers chat init when no messages exist", async () => {
    let initCalled = false;
    global.fetch = mockFetch({
      "/messages": emptyMessagesResponse,
      "/chat/init": () => {
        initCalled = true;
        return createSSEResponse([
          { type: "text", content: "Welcome! What are you building?" },
          { type: "done" },
        ]);
      },
    });

    render(<ChatSidebar projectId="p1" defaultOpen={true} />);

    await waitFor(() => {
      expect(initCalled).toBe(true);
    });

    await waitFor(() => {
      expect(screen.getByText("Welcome! What are you building?")).toBeInTheDocument();
    });
  });

  it("tracks a successful repository scan without repository details", async () => {
    const onScanStateChange = vi.fn();
    global.fetch = mockFetch({
      "/messages": emptyMessagesResponse,
      "/repo-scan": () =>
        createSSEResponse([
          { type: "text", content: "Mapped the repository." },
          {
            type: "architecture",
            content: {
              nodes: [
                {
                  id: "api",
                  category: "api",
                  subtype: "rest-api",
                  name: "API",
                  technology: "Next.js",
                  description: "Routes",
                  reasoning: "Observed",
                  locked: false,
                },
              ],
              edges: [],
            },
          },
          { type: "done" },
        ]),
    });

    render(
      <ChatSidebar
        projectId="p1"
        repoUrl="owner/repo"
        defaultOpen={true}
        onScanStateChange={onScanStateChange}
      />
    );

    await screen.findByText("Mapped the repository.");
    expect(mockTrackEvent).toHaveBeenCalledWith("repository_scan_started", {
      location: "editor",
    });
    expect(mockTrackEvent).toHaveBeenCalledWith("repository_scan_succeeded", {
      location: "editor",
    });
    expect(JSON.stringify(mockTrackEvent.mock.calls)).not.toContain("owner/repo");
    expect(onScanStateChange.mock.calls).toEqual([[true], [false]]);
  });

  it("treats a completed scan without architecture as a recoverable failure", async () => {
    global.fetch = mockFetch({
      "/messages": messagesWithHistory,
      "/repo-scan": () =>
        createSSEResponse([{ type: "text", content: "No structured map." }, { type: "done" }]),
    });

    render(<ChatSidebar projectId="p1" repoUrl="owner/repo" defaultOpen={true} scanTrigger={1} />);

    await screen.findByText(
      "StackHatch could not produce a usable map. Your current map was kept."
    );
    expect(mockTrackEvent).toHaveBeenCalledWith("repository_scan_failed", {
      location: "editor",
      error_category: "unknown",
    });
    expect(mockTrackEvent).not.toHaveBeenCalledWith("repository_scan_succeeded", expect.anything());
    expect(screen.getByText("Welcome! What are you building?")).toBeInTheDocument();
  });

  it("tracks a typed repository scan failure", async () => {
    global.fetch = mockFetch({
      "/messages": emptyMessagesResponse,
      "/repo-scan": () =>
        createSSEResponse([
          {
            type: "error",
            code: "github_rate_limited",
            content: "GitHub's API limit was reached.",
          },
        ]),
    });

    render(<ChatSidebar projectId="p1" repoUrl="owner/repo" defaultOpen={true} />);

    await screen.findByText("GitHub's API limit was reached.");
    expect(mockTrackEvent).toHaveBeenCalledWith("repository_scan_failed", {
      location: "editor",
      error_category: "github_rate_limit",
    });
  });

  it("treats blank repo URLs as scratch projects instead of scanning", async () => {
    let initCalled = false;
    let scanCalled = false;
    global.fetch = mockFetch({
      "/messages": emptyMessagesResponse,
      "/chat/init": () => {
        initCalled = true;
        return createSSEResponse([
          { type: "text", content: "Welcome! What are you building?" },
          { type: "done" },
        ]);
      },
      "/repo-scan": () => {
        scanCalled = true;
        return createSSEResponse([
          { type: "error", content: "Repository not found or is private" },
        ]);
      },
    });

    render(<ChatSidebar projectId="p1" repoUrl="   " defaultOpen={true} />);

    await waitFor(() => {
      expect(initCalled).toBe(true);
    });

    expect(scanCalled).toBe(false);
    expect(screen.getByText("Welcome! What are you building?")).toBeInTheDocument();
    expect(screen.queryByText("Repository not found or is private")).not.toBeInTheDocument();
  });

  it("filters out init instruction messages from display", async () => {
    global.fetch = mockFetch({
      "/messages": () =>
        Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: "m1",
                role: "user",
                content: "Begin the architecture interview for a new project",
                createdAt: 1000,
              },
              {
                id: "m2",
                role: "assistant",
                content: "Welcome! What are you building?",
                createdAt: 2000,
              },
            ]),
            { status: 200 }
          )
        ),
    });

    render(<ChatSidebar projectId="p1" defaultOpen={true} />);

    await waitFor(() => {
      expect(screen.getByText("Welcome! What are you building?")).toBeInTheDocument();
    });

    expect(screen.queryByText(/Begin the architecture interview/)).not.toBeInTheDocument();
  });

  it("disables send button when input is empty", async () => {
    global.fetch = mockFetch({
      "/messages": messagesWithHistory,
    });

    render(<ChatSidebar projectId="p1" defaultOpen={true} />);

    await waitFor(() => {
      expect(screen.getByText("A chat application")).toBeInTheDocument();
    });

    const sendBtn = screen.getByLabelText("Send message");
    expect(sendBtn).toBeDisabled();
  });
});
