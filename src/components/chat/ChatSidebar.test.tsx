import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ChatSidebar from "./ChatSidebar";

// Mock react-markdown to render plain text (avoids ESM issues in jsdom)
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <span>{children}</span>,
}));

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

function createSSEResponse(events: Array<{ type: string; content?: string }>) {
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

  it("renders open state without title/status chrome or a built-in collapse control", async () => {
    global.fetch = mockFetch({
      "/messages": messagesWithHistory,
    });

    render(<ChatSidebar projectId="p1" defaultOpen={true} />);
    await waitFor(() => {
      expect(screen.getByText("Welcome! What are you building?")).toBeInTheDocument();
    });

    expect(screen.queryByText("Architecture Assistant")).not.toBeInTheDocument();
    expect(screen.queryByText("Ready")).not.toBeInTheDocument();
    expect(screen.queryByText("Starting")).not.toBeInTheDocument();
    expect(screen.queryByText("Thinking")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Collapse chat")).not.toBeInTheDocument();
    expect(screen.getByTestId("chat-scroll-overlay")).toBeInTheDocument();
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

    expect(screen.queryByLabelText("Collapse chat")).not.toBeInTheDocument();
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

  it("displays error message from SSE stream", async () => {
    global.fetch = mockFetch({
      "/messages": emptyMessagesResponse,
      "/chat/init": () => createSSEResponse([{ type: "error", content: "API key not configured" }]),
    });

    render(<ChatSidebar projectId="p1" defaultOpen={true} />);

    await waitFor(() => {
      expect(screen.getByText("API key not configured")).toBeInTheDocument();
    });
  });

  it("saves an Anthropic key inline when chat init is blocked and retries", async () => {
    let initCalls = 0;
    let savedBody: Record<string, unknown> | null = null;
    global.fetch = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      const method = options?.method ?? "GET";

      if (url.includes("/messages")) {
        return emptyMessagesResponse();
      }

      if (url.includes("/chat/init") && method === "POST") {
        initCalls += 1;
        if (initCalls === 1) {
          return createSSEResponse([
            {
              type: "error",
              content: "Add your Anthropic API key in Settings to use StackHatch AI.",
            },
          ]);
        }
        return createSSEResponse([
          { type: "text", content: "Welcome back. What are you building?" },
          { type: "done" },
        ]);
      }

      if (url === "/api/settings" && method === "PATCH") {
        savedBody = JSON.parse(options?.body as string);
        return new Response(
          JSON.stringify({
            hasAnthropicKey: true,
            hasUserAnthropicKey: true,
          }),
          { status: 200 }
        );
      }

      return new Response("Not found", { status: 404 });
    }) as typeof fetch;

    render(<ChatSidebar projectId="p1" defaultOpen={true} />);

    const keyInput = await screen.findByLabelText("Anthropic API key");
    const apiKeyForm = keyInput.closest("form");
    expect(apiKeyForm).toHaveClass("bg-[var(--warning-surface)]", "border-[var(--warning-border)]");
    expect(apiKeyForm).not.toHaveClass("border-l-4");
    fireEvent.change(keyInput, { target: { value: "sk-ant-test-inline-key-1234567890" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and retry" }));

    await waitFor(() => {
      expect(savedBody).toEqual({ apiKey: "sk-ant-test-inline-key-1234567890" });
      expect(initCalls).toBe(2);
    });
    await waitFor(() => {
      expect(screen.getByText("Welcome back. What are you building?")).toBeInTheDocument();
    });
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
