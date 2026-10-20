import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ChatSidebar from "@/components/chat/ChatSidebar";
import { ProviderError } from "@/lib/ai/provider-errors";
import { RepoAnalysisError } from "@/lib/github-analyzer";
import { composeAttachedMessage } from "@/lib/chat-attachment";
import { ProviderKeyUnavailableError, type ProviderKeyManager } from "@/lib/provider-key";
import type {
  ProviderRunCoordinator,
  ProviderRunOutcome,
  ProviderRunRequest,
  RepositoryEvidenceOutcome,
} from "@/lib/ai/provider-run";
import type { VaultProjectRecord } from "@/lib/vault/schema";

const project: VaultProjectRecord = {
  id: "project-1",
  name: "Private map",
  description: null,
  repoUrl: "https://github.com/acme/app",
  canvasState: { nodes: [], edges: [] },
  revision: 2,
  createdAt: 1,
  updatedAt: 2,
};

function runOutcome(overrides: Partial<ProviderRunOutcome> = {}): ProviderRunOutcome {
  return {
    run: {
      id: "run-1",
      projectId: "project-1",
      kind: "chat",
      status: "completed",
      prompt: "Hello",
      model: "claude-sonnet-5",
      requestId: "req-1",
      errorCode: null,
      expectedProjectRevision: 1,
      expectedVaultGeneration: "vault-1",
      revision: 1,
      createdAt: 1,
      updatedAt: 2,
    },
    project,
    generation: "vault-1",
    text: "Hello back",
    message: "Hello back",
    architecture: null,
    alternatives: null,
    prd: null,
    ...overrides,
  };
}

function evidenceOutcome(): RepositoryEvidenceOutcome {
  return {
    project,
    generation: "vault-1",
    analysis: {
      owner: "acme",
      repo: "app",
      normalizedUrl: "https://github.com/acme/app",
      description: "App",
      primaryLanguage: "TypeScript",
      languages: { TypeScript: 1 },
      topics: [],
      defaultBranch: "main",
      commitSha: "abcdef1234567890",
      treePaths: ["src/app.ts"],
      readme: "# App",
      evidenceFiles: [],
      status: "complete",
      warnings: [],
    },
  };
}

function coordinator(overrides: Partial<ProviderRunCoordinator> = {}): ProviderRunCoordinator {
  return {
    getKeyStatus: vi.fn(async () => ({
      provider: "anthropic" as const,
      state: "session" as const,
      generation: "key-1",
    })),
    listMessages: vi.fn(async () => []),
    scanRepository: vi.fn(async () => evidenceOutcome()),
    run: vi.fn(async () => runOutcome()),
    close: vi.fn(),
    ...overrides,
  };
}

function renderSidebar(localCoordinator: ProviderRunCoordinator, props = {}) {
  return render(
    <ChatSidebar
      projectId="project-1"
      repoUrl="https://github.com/acme/app"
      defaultOpen
      coordinator={localCoordinator}
      {...props}
    />
  );
}

async function send(message: string) {
  const input = await screen.findByPlaceholderText("Ask anything…");
  fireEvent.change(input, { target: { value: message } });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
}

describe("local-first ChatSidebar", () => {
  it("renders no panel and no chat trigger of its own while closed", () => {
    // The editor rail owns the only "Open chat" control.
    render(
      <ChatSidebar
        projectId="project-1"
        open={false}
        onOpenChange={vi.fn()}
        coordinator={coordinator()}
      />
    );

    expect(screen.queryByRole("complementary", { name: "Assistant" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open chat" })).not.toBeInTheDocument();
  });

  it("keeps the blank-map starter copy concise", () => {
    render(<ChatSidebar projectId="project-1" defaultOpen coordinator={coordinator()} />);

    expect(
      screen.getByText("Describe what you're building and the assistant drafts a map you can edit.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();
    expect(screen.queryByText(/Nothing is sent until you send a message/)).not.toBeInTheDocument();
  });

  it("loads only local messages and never starts a provider action on open", async () => {
    const localCoordinator = coordinator({
      listMessages: vi.fn(async () => [
        {
          id: "hidden",
          projectId: "project-1",
          role: "user" as const,
          content: "Begin the architecture interview now",
          revision: 1,
          createdAt: 1,
        },
        {
          id: "assistant",
          projectId: "project-1",
          role: "assistant" as const,
          content: "**Stored locally**",
          revision: 1,
          createdAt: 2,
        },
      ]),
    });

    renderSidebar(localCoordinator);

    expect(await screen.findByText("Stored locally")).toBeInTheDocument();
    expect(screen.queryByText(/Begin the architecture/)).not.toBeInTheDocument();
    expect(localCoordinator.run).not.toHaveBeenCalled();
    expect(localCoordinator.scanRepository).not.toHaveBeenCalled();
  });

  it("renders assistant Markdown paragraphs and lists, keeping an ordered list's start", async () => {
    const localCoordinator = coordinator({
      listMessages: vi.fn(async () => [
        {
          id: "assistant",
          projectId: "project-1",
          role: "assistant" as const,
          content:
            "First paragraph.\n\nSecond paragraph.\n\n- First item\n- Second item\n\n3. Third item\n4. Fourth item",
          revision: 1,
          createdAt: 1,
        },
      ]),
    });

    renderSidebar(localCoordinator);

    expect(await screen.findByText("First paragraph.")).toBeInTheDocument();
    expect(screen.getByText("Second paragraph.")).toBeInTheDocument();

    const [unorderedList, orderedList] = screen.getAllByRole("list");
    expect(unorderedList.tagName).toBe("UL");
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(orderedList.tagName).toBe("OL");
    expect(orderedList).toHaveAttribute("start", "3");
  });

  it("renders assistant Markdown tables as responsive semantic tables", async () => {
    const localCoordinator = coordinator({
      listMessages: vi.fn(async () => [
        {
          id: "assistant",
          projectId: "project-1",
          role: "assistant" as const,
          content: [
            "Technology Choices Summary",
            "",
            "| Component | Technology | Reasoning |",
            "| --- | --- | --- |",
            "| Web App | Next.js 16 | Produces a static export. |",
            "| Storage | IndexedDB | Works offline. |",
          ].join("\n"),
          revision: 1,
          createdAt: 1,
        },
      ]),
    });

    renderSidebar(localCoordinator);

    const table = await screen.findByRole("table");
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
    expect(screen.getByRole("cell", { name: "Next.js 16" })).toBeInTheDocument();
    expect(table.parentElement).toHaveAttribute("role", "region");
    expect(table.parentElement).toHaveAttribute("aria-label", "Scrollable table");
    expect(table.parentElement).toHaveAttribute("tabindex", "0");
  });

  it("starts no provider action on a fresh empty map, even though the panel is mounted", async () => {
    // The panel is now mounted eagerly and opens by default on an empty map,
    // so this is what stands in for the old "not rendered until you ask"
    // guarantee: mounting is not an action, and only an action reaches out.
    const localCoordinator = coordinator({ listMessages: vi.fn(async () => []) });
    renderSidebar(localCoordinator, { repoUrl: null });

    expect(await screen.findByPlaceholderText("Ask anything…")).toBeInTheDocument();
    expect(localCoordinator.run).not.toHaveBeenCalled();
    expect(localCoordinator.scanRepository).not.toHaveBeenCalled();
    expect(
      screen.queryByText("Local until you ask for a provider request")
    ).not.toBeInTheDocument();
  });

  it("sends the first chat message without an extra confirmation or key-status helper", async () => {
    const run = vi.fn(async (request) => {
      request.onText?.("Streaming locally", "Streaming locally");
      return runOutcome();
    });
    const localCoordinator = coordinator({ run });

    renderSidebar(localCoordinator);
    await send("What should I add?");

    // Entering the key was the consent; asking again on every send was theatre.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await waitFor(() => expect(run).toHaveBeenCalledOnce());
    expect(screen.queryByText(/key available for this session/)).not.toBeInTheDocument();
  });

  it("issues a second request with no extra step", async () => {
    const run = vi.fn(async () => runOutcome());
    const localCoordinator = coordinator({ run });
    renderSidebar(localCoordinator);

    await send("First");
    await waitFor(() => expect(run).toHaveBeenCalledOnce());

    await send("Second");
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reports mapping only once the streamed reply starts writing the map", async () => {
    let continueToMap!: () => void;
    let finish!: () => void;
    const run = vi.fn(async (request: ProviderRunRequest) => {
      request.onText?.("What are you building?", "What are you building?");
      await new Promise<void>((resolve) => (continueToMap = resolve));
      request.onText?.("Mapped.\n<stack>{", "Mapped.\n<stack>{");
      await new Promise<void>((resolve) => (finish = resolve));
      return runOutcome();
    });
    const onMapping = vi.fn();
    renderSidebar(coordinator({ run }), { onMapping });

    await send("Map my checkout");
    await screen.findByText("What are you building?");
    expect(onMapping).not.toHaveBeenCalledWith(true);

    continueToMap();
    await waitFor(() => expect(onMapping).toHaveBeenLastCalledWith(true));

    finish();
    await waitFor(() => expect(onMapping).toHaveBeenLastCalledWith(false));
  });

  it("scans and generates from one action, in that order", async () => {
    // Reading the repository and turning it into a map used to be two clicks
    // with a confirmation on each. They are still two network events; the user
    // step between them is gone.
    const calls: string[] = [];
    const onProviderCommit = vi.fn();
    const onProviderCommitStart = vi.fn();
    const scanRepository = vi.fn(async (_projectId, _repositoryUrl, options) => {
      calls.push("github");
      await options?.beforeCommit?.();
      return evidenceOutcome();
    });
    const run = vi.fn(async (_request: ProviderRunRequest) => {
      calls.push("anthropic");
      return runOutcome();
    });
    const localCoordinator = coordinator({ scanRepository, run });
    renderSidebar(localCoordinator, { onProviderCommit, onProviderCommitStart });

    fireEvent.click(await screen.findByRole("button", { name: "Map this repository" }));

    await waitFor(() => expect(run).toHaveBeenCalledOnce());
    expect(calls).toEqual(["github", "anthropic"]);
    expect(run.mock.calls[0][0]).toMatchObject({ kind: "repository-generation" });
    expect(onProviderCommitStart).toHaveBeenCalled();
    expect(onProviderCommit).toHaveBeenCalledWith({
      projectRevision: 2,
      vaultGeneration: "vault-1",
    });
    expect(screen.queryByText("Read from GitHub")).not.toBeInTheDocument();
  });

  it("does not generate when the scan fails", async () => {
    const run = vi.fn(async () => runOutcome());
    const localCoordinator = coordinator({
      scanRepository: vi.fn(async () => {
        throw new Error("GitHub was unreachable.");
      }),
      run,
    });
    renderSidebar(localCoordinator);

    fireEvent.click(await screen.findByRole("button", { name: "Map this repository" }));

    expect(await screen.findByText("GitHub was unreachable.")).toBeInTheDocument();
    expect(run).not.toHaveBeenCalled();
  });

  function githubKeyManager(
    state: "absent" | "session" = "absent",
    aiKey: "absent" | "session" = "session"
  ) {
    let current = state;
    return {
      getStatus: vi.fn(async (provider: string) => ({
        provider,
        state: provider === "github" ? current : aiKey,
        generation: "g",
      })),
      useSessionKey: vi.fn(async (provider: string) => {
        current = "session";
        return { provider, state: current, generation: "g" };
      }),
      rememberKey: vi.fn(),
      forgetKey: vi.fn(async (provider: string) => {
        current = "absent";
        return { provider, state: current, generation: "g2" };
      }),
    } as unknown as ProviderKeyManager;
  }

  it("offers a GitHub token in place when a scan can't read the repository, then scans again", async () => {
    const run = vi.fn(async () => runOutcome());
    const scanRepository = vi
      .fn()
      .mockRejectedValueOnce(
        new RepoAnalysisError(
          "not_found_or_private",
          "StackHatch can't read acme/app. If it's private, add a read-only GitHub token."
        )
      )
      .mockResolvedValueOnce(evidenceOutcome());
    const keyManager = githubKeyManager();
    renderSidebar(coordinator({ scanRepository, run }), { keyManager });

    fireEvent.click(await screen.findByRole("button", { name: "Map this repository" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("StackHatch can't read acme/app.");
    expect(
      await screen.findByRole("link", { name: "Create a read-only token for acme" })
    ).toHaveAttribute("href", expect.stringContaining("target_name=acme"));
    expect(screen.queryByRole("button", { name: "Forget token" })).not.toBeInTheDocument();

    const token = await screen.findByLabelText("GitHub token");
    fireEvent.change(token, { target: { value: "ghp_classic" } });
    fireEvent.click(screen.getByRole("button", { name: "Use token" }));
    expect(await screen.findByText(/only accepts fine-grained tokens/)).toBeInTheDocument();
    expect(scanRepository).toHaveBeenCalledTimes(1);

    fireEvent.change(token, { target: { value: "github_pat_private" } });
    fireEvent.click(screen.getByRole("button", { name: "Use token" }));

    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(keyManager.useSessionKey).toHaveBeenCalledWith("github", "github_pat_private");
    expect(scanRepository).toHaveBeenCalledTimes(2);
    expect(screen.queryByLabelText("GitHub token")).not.toBeInTheDocument();
  });

  it("offers Forget only when GitHub rejected the token, and scans again after it", async () => {
    const cannotRead = vi
      .fn()
      .mockRejectedValue(
        new RepoAnalysisError(
          "github_token_cannot_read",
          "Your GitHub token can't read acme/app.",
          null,
          null,
          true
        )
      );
    const first = renderSidebar(coordinator({ scanRepository: cannotRead }), {
      keyManager: githubKeyManager("session"),
    });
    fireEvent.click(await screen.findByRole("button", { name: "Map this repository" }));
    expect(await screen.findByRole("button", { name: "Replace token" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Forget token" })).not.toBeInTheDocument();
    first.unmount();

    const run = vi.fn(async () => runOutcome());
    const rejected = vi
      .fn()
      .mockRejectedValueOnce(
        new RepoAnalysisError(
          "github_token_rejected",
          "GitHub rejected the token.",
          null,
          null,
          true
        )
      )
      .mockResolvedValueOnce(evidenceOutcome());
    const keyManager = githubKeyManager("session");
    renderSidebar(coordinator({ scanRepository: rejected, run }), { keyManager });
    fireEvent.click(await screen.findByRole("button", { name: "Map this repository" }));
    fireEvent.click(await screen.findByRole("button", { name: "Forget token" }));

    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(keyManager.forgetKey).toHaveBeenCalledWith("github");
    expect(rejected).toHaveBeenCalledTimes(2);
  });

  it("replaces the token prompt when a later error takes over the panel", async () => {
    const scanRepository = vi
      .fn()
      .mockRejectedValue(
        new RepoAnalysisError(
          "not_found_or_private",
          "StackHatch can't read acme/app. If it's private, add a read-only GitHub token."
        )
      );
    renderSidebar(
      coordinator({
        scanRepository,
        getKeyStatus: vi.fn(async () => ({
          provider: "anthropic" as const,
          state: "absent" as const,
          generation: "key-1",
        })),
      }),
      { keyManager: githubKeyManager("absent", "absent") }
    );

    fireEvent.click(await screen.findByRole("button", { name: "Map this repository" }));
    expect(await screen.findByLabelText("GitHub token")).toBeInTheDocument();

    await send("Hello");

    expect(await screen.findByLabelText("Anthropic API key")).toBeInTheDocument();
    expect(screen.queryByLabelText("GitHub token")).not.toBeInTheDocument();
    expect(screen.queryByText("credentials-missing")).not.toBeInTheDocument();
  });

  it("points an anonymous rate-limited scan to the GitHub token, but not one that used it", async () => {
    const limited = (tokenUsed: boolean) =>
      new RepoAnalysisError(
        "github_rate_limited",
        "GitHub's API limit was reached.",
        null,
        null,
        tokenUsed
      );
    const scanRepository = vi
      .fn()
      .mockRejectedValueOnce(limited(false))
      .mockRejectedValueOnce(limited(true));
    const { unmount } = renderSidebar(coordinator({ scanRepository }));

    fireEvent.click(await screen.findByRole("button", { name: "Map this repository" }));
    expect(await screen.findByRole("link", { name: "Add a GitHub token" })).toHaveAttribute(
      "href",
      "/settings#github-token"
    );
    expect(screen.queryByLabelText("GitHub token")).not.toBeInTheDocument();
    unmount();

    renderSidebar(coordinator({ scanRepository }));
    fireEvent.click(await screen.findByRole("button", { name: "Map this repository" }));
    expect(await screen.findByText("GitHub's API limit was reached.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Add a GitHub token" })).not.toBeInTheDocument();
  });

  it("updates the editor only with the coordinator's committed architecture", async () => {
    const onArchitecture = vi.fn();
    const architecture = {
      nodes: [
        {
          id: "api",
          category: "api" as const,
          subtype: "rest-api" as const,
          name: "API",
          technology: "Hono",
          description: "API",
          reasoning: "Small",
          locked: false,
        },
      ],
      edges: [],
    };
    const localCoordinator = coordinator({
      run: vi.fn(async () => runOutcome({ architecture })),
    });
    renderSidebar(localCoordinator, { onArchitecture });

    await send("Generate it");

    await waitFor(() =>
      expect(onArchitecture).toHaveBeenCalledWith(
        architecture,
        expect.objectContaining({
          persisted: true,
          commit: { projectRevision: 2, vaultGeneration: "vault-1" },
        })
      )
    );
  });

  it("preserves a draft without dispatching when the key is absent, then sends it after inline setup", async () => {
    let state: "absent" | "session" = "absent";
    const manager = {
      getStatus: vi.fn(async () => ({ provider: "anthropic", state, generation: "key-1" })),
      useSessionKey: vi.fn(async () => {
        state = "session";
        return { provider: "anthropic", state, generation: "key-1" };
      }),
      rememberKey: vi.fn(),
    } as unknown as ProviderKeyManager;
    const run = vi.fn(async () => runOutcome());
    renderSidebar(
      coordinator({
        getKeyStatus: vi.fn(async () => ({
          provider: "anthropic" as const,
          state: "absent" as const,
          generation: "key-1",
        })),
        run,
      }),
      { keyManager: manager }
    );
    await send("Keep this draft");
    expect(screen.getByRole("complementary", { name: "Assistant" })).toBeInTheDocument();
    expect(screen.getByRole("log", { name: "Messages" })).toHaveAttribute("aria-live", "polite");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ask anything…")).toHaveValue("Keep this draft");
    expect(run).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Anthropic API key"), {
      target: { value: "hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Use key" }));
    expect(manager.useSessionKey).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Anthropic API key"), {
      target: { value: "sk-ant-local-test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Use key" }));
    await waitFor(() => expect(run).toHaveBeenCalledOnce());
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ prompt: "Keep this draft" }));
    expect(screen.getByPlaceholderText("Ask anything…")).toHaveValue("");
  });

  it("scrolls the key prompt into view again when its field finishes rendering", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const callbacks: Array<() => void> = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          callbacks.push(callback);
        }
        observe() {}
        disconnect() {}
      }
    );
    try {
      renderSidebar(
        coordinator({
          run: vi.fn(async () => {
            throw new ProviderKeyUnavailableError("Enter an Anthropic API key", "anthropic");
          }),
        }),
        {
          keyManager: {
            getStatus: vi.fn(async () => ({
              provider: "anthropic",
              state: "absent",
              generation: "key-1",
            })),
          } as unknown as ProviderKeyManager,
        }
      );
      await send("Hello");
      await screen.findByLabelText("Anthropic API key");
      const before = scrollIntoView.mock.calls.length;

      callbacks.forEach((callback) => callback());

      expect(scrollIntoView.mock.calls.length).toBeGreaterThan(before);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("recovers the draft when a stale key status fails at dispatch", async () => {
    const localCoordinator = coordinator({
      run: vi.fn(async () => {
        throw new ProviderKeyUnavailableError("Enter an Anthropic API key", "anthropic");
      }),
    });
    renderSidebar(localCoordinator, {
      keyManager: {
        getStatus: vi.fn(async () => ({
          provider: "anthropic",
          state: "absent",
          generation: "key-1",
        })),
      } as unknown as ProviderKeyManager,
    });
    await send("Hello");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ask anything…")).toHaveValue("Hello");
  });

  it("says a rejected key was rejected instead of asking for one again", async () => {
    // A typo'd or revoked key used to be reported as a missing key, sending the
    // user to add the key they had already added.
    const localCoordinator = coordinator({
      run: vi.fn(async () => {
        throw new ProviderError(
          "authentication",
          "Anthropic rejected the API key. Check it and try again."
        );
      }),
    });
    renderSidebar(localCoordinator);

    await send("Hello");

    expect(
      await screen.findByText("Anthropic rejected the API key. Check it and try again.")
    ).toBeInTheDocument();
  });

  it("cancels an in-flight request and keeps partial text transient", async () => {
    const partialMarkdown =
      "Streaming paragraph.\n\nSecond paragraph.\n\n- First live item\n- Second live item";
    const run = vi.fn(
      (request) =>
        new Promise<ProviderRunOutcome>((_resolve, reject) => {
          request.onText?.(partialMarkdown, partialMarkdown);
          request.signal?.addEventListener(
            "abort",
            () => reject(new ProviderError("aborted", "The Anthropic request was cancelled.")),
            { once: true }
          );
        })
    );
    renderSidebar(coordinator({ run }));

    const input = await screen.findByPlaceholderText("Ask anything…");
    fireEvent.change(input, { target: { value: "Long request" } });
    const sendButton = screen.getByRole("button", { name: "Send message" });
    sendButton.focus();
    fireEvent.click(sendButton, { detail: 0 });

    const streamingMessage = await screen.findByTestId("chat-message-assistant-streaming");
    expect(screen.getByRole("log", { name: "Messages" })).not.toContainElement(streamingMessage);
    expect(streamingMessage).toHaveTextContent("First live item");
    expect(screen.queryByRole("button", { name: "Cancel request" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send message" })).not.toBeInTheDocument();
    const stopButton = screen.getByRole("button", { name: "Stop request" });
    expect(stopButton).toHaveFocus();
    fireEvent.click(stopButton, { detail: 0 });

    expect(await screen.findByRole("alert")).toHaveTextContent("cancelled");
    expect(streamingMessage).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop request" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
    expect(input).toHaveFocus();
  });
  it("shows the user's message and the thinking state as soon as it is sent", async () => {
    const run = vi.fn(() => new Promise<ProviderRunOutcome>(() => {}));
    renderSidebar(coordinator({ run }));

    await send("A SaaS for finding deals");

    expect(await screen.findByTestId("chat-message-user")).toHaveTextContent(
      "A SaaS for finding deals"
    );
    expect(screen.getByText("Thinking...")).toBeInTheDocument();
  });

  it("replaces the immediate message with the stored one instead of duplicating it", async () => {
    const stored = [
      {
        id: "m1",
        projectId: "project-1",
        role: "user" as const,
        content: "Hello there",
        revision: 1,
        createdAt: 1,
      },
      {
        id: "m2",
        projectId: "project-1",
        role: "assistant" as const,
        content: "Hi",
        revision: 2,
        createdAt: 2,
      },
    ];
    let messages: typeof stored = [];
    const run = vi.fn(async () => {
      messages = stored;
      return runOutcome();
    });
    renderSidebar(coordinator({ run, listMessages: vi.fn(async () => messages) }));

    await send("Hello there");

    expect(await screen.findByText("Hi")).toBeInTheDocument();
    expect(screen.getAllByTestId("chat-message-user")).toHaveLength(1);
  });

  it("does not expose remembered-key status or the credential", async () => {
    renderSidebar(
      coordinator({
        getKeyStatus: vi.fn(async () => ({
          provider: "anthropic" as const,
          state: "remembered" as const,
          generation: "key-1",
        })),
      })
    );

    expect(await screen.findByPlaceholderText("Ask anything…")).toBeInTheDocument();
    expect(screen.queryByText(/key remembered on this device/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("sk-ant");
  });

  describe("attachments", () => {
    const attach = async (file: File) => {
      await screen.findByPlaceholderText("Ask anything…");
      fireEvent.change(screen.getByTestId("chat-attachment-input"), { target: { files: [file] } });
    };

    it("sends the attached file with the message and clears the composer", async () => {
      const localCoordinator = coordinator();
      renderSidebar(localCoordinator);

      await attach(new File(["# PRD\n\nKeep data local."], "prd.md"));
      expect(await screen.findByTestId("chat-attachment-chip")).toHaveTextContent("prd.md");
      fireEvent.change(screen.getByPlaceholderText("Ask anything…"), {
        target: { value: "Draft a map" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Send message" }));

      await waitFor(() => expect(localCoordinator.run).toHaveBeenCalledOnce());
      const { prompt } = vi.mocked(localCoordinator.run).mock.calls[0][0];
      expect(prompt).toContain("Draft a map");
      expect(prompt).toContain("Keep data local.");
      expect(screen.queryByTestId("chat-attachment-chip")).not.toBeInTheDocument();
    });

    it("lets a file be sent without any typed text", async () => {
      const localCoordinator = coordinator();
      renderSidebar(localCoordinator);

      await attach(new File(["# PRD"], "prd.md"));
      await screen.findByTestId("chat-attachment-chip");
      fireEvent.click(screen.getByRole("button", { name: "Send message" }));

      await waitFor(() => expect(localCoordinator.run).toHaveBeenCalledOnce());
      expect(vi.mocked(localCoordinator.run).mock.calls[0][0].prompt).toContain("# PRD");
    });

    it("removes an attached file before sending", async () => {
      const localCoordinator = coordinator();
      renderSidebar(localCoordinator);

      await attach(new File(["# PRD"], "prd.md"));
      fireEvent.click(await screen.findByRole("button", { name: "Remove prd.md" }));

      expect(screen.queryByTestId("chat-attachment-chip")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    });

    it("rejects a file that is not Markdown or text", async () => {
      renderSidebar(coordinator());

      await attach(new File(["%PDF"], "prd.pdf"));

      expect(await screen.findByRole("alert")).toHaveTextContent("Markdown (.md) or text (.txt)");
      expect(screen.queryByTestId("chat-attachment-chip")).not.toBeInTheDocument();
    });

    it("shows a stored attachment as its file name, not its text", async () => {
      const stored = composeAttachedMessage("Draft a map", {
        name: "prd.md",
        content: "SECRET-BODY-TEXT",
      });
      renderSidebar(
        coordinator({
          listMessages: vi.fn(async () => [
            {
              id: "m1",
              projectId: "project-1",
              role: "user" as const,
              content: stored,
              revision: 1,
              createdAt: 1,
            },
          ]),
        })
      );

      expect(await screen.findByTestId("chat-message-attachment")).toHaveTextContent("prd.md");
      expect(screen.getByText("Draft a map")).toBeInTheDocument();
      expect(screen.queryByText(/SECRET-BODY-TEXT/)).not.toBeInTheDocument();
    });
  });
});
