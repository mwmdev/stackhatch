import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ChatSidebar from "@/components/chat/ChatSidebar";
import { ProviderError } from "@/lib/ai/provider-errors";
import type {
  ProviderRunCoordinator,
  ProviderRunOutcome,
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
    getKeyStatus: vi.fn(async () => ({ state: "session" as const, generation: "key-1" })),
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
  const input = await screen.findByPlaceholderText("Ask about this architecture…");
  fireEvent.change(input, { target: { value: message } });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
}

describe("local-first ChatSidebar", () => {
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

  it("discloses Anthropic context before the first chat request and retains a reminder", async () => {
    const run = vi.fn(async (request) => {
      request.onText?.("Streaming locally", "Streaming locally");
      return runOutcome();
    });
    const localCoordinator = coordinator({ run });

    renderSidebar(localCoordinator);
    await send("What should I add?");

    expect(screen.getByRole("dialog", { name: "Anthropic data disclosure" })).toHaveTextContent(
      "latest committed nodes and connections"
    );
    expect(run).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continue to Anthropic" }));

    await waitFor(() => expect(run).toHaveBeenCalledOnce());
    expect(await screen.findByText(/key available for this session/)).toBeInTheDocument();
  });

  it("does not persist consent and avoids repeating the modal within the current document", async () => {
    const run = vi.fn(async () => runOutcome());
    const localCoordinator = coordinator({ run });
    renderSidebar(localCoordinator);

    await send("First");
    fireEvent.click(screen.getByRole("button", { name: "Continue to Anthropic" }));
    await waitFor(() => expect(run).toHaveBeenCalledOnce());

    await send("Second");
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    expect(
      screen.queryByRole("dialog", { name: "Anthropic data disclosure" })
    ).not.toBeInTheDocument();
  });

  it("keeps GitHub evidence review separate from Anthropic generation", async () => {
    const onProviderCommit = vi.fn();
    const onProviderCommitStart = vi.fn();
    const scanRepository = vi.fn(async (_projectId, _repositoryUrl, options) => {
      await options?.beforeCommit?.();
      return evidenceOutcome();
    });
    const localCoordinator = coordinator({ scanRepository });
    renderSidebar(localCoordinator, { onProviderCommit, onProviderCommitStart });

    fireEvent.click(await screen.findByRole("button", { name: "Review GitHub evidence" }));
    expect(screen.getByRole("dialog", { name: "GitHub data disclosure" })).toHaveTextContent(
      "No Anthropic key is sent"
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue to GitHub" }));

    expect(await screen.findByText("GitHub evidence is ready")).toBeInTheDocument();
    expect(onProviderCommitStart).toHaveBeenCalledOnce();
    expect(onProviderCommit).toHaveBeenCalledWith({
      projectRevision: 2,
      vaultGeneration: "vault-1",
    });
    expect(localCoordinator.run).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Generate map with Anthropic" }));
    expect(screen.getByRole("dialog", { name: "Anthropic data disclosure" })).toHaveTextContent(
      "bounded GitHub evidence"
    );
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
    fireEvent.click(screen.getByRole("button", { name: "Continue to Anthropic" }));

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

  it("routes a missing key to private device settings without asking for it inline", async () => {
    const localCoordinator = coordinator({
      run: vi.fn(async () => {
        throw new ProviderError(
          "authentication",
          "Add an Anthropic API key in Settings before starting this request."
        );
      }),
    });
    renderSidebar(localCoordinator);

    await send("Hello");
    fireEvent.click(screen.getByRole("button", { name: "Continue to Anthropic" }));

    expect(await screen.findByText("Add your Anthropic key")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open device settings" })).toHaveAttribute(
      "href",
      "/settings?setup=anthropic"
    );
    expect(screen.queryByLabelText("Anthropic API key")).not.toBeInTheDocument();
  });

  it("cancels an in-flight request and keeps partial text transient", async () => {
    const run = vi.fn(
      (request) =>
        new Promise<ProviderRunOutcome>((_resolve, reject) => {
          request.onText?.("Partial private output", "Partial private output");
          request.signal?.addEventListener(
            "abort",
            () => reject(new ProviderError("aborted", "The Anthropic request was cancelled.")),
            { once: true }
          );
        })
    );
    renderSidebar(coordinator({ run }));

    await send("Long request");
    fireEvent.click(screen.getByRole("button", { name: "Continue to Anthropic" }));
    expect(await screen.findByText("Partial private output")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("cancelled");
    expect(screen.queryByText("Partial private output")).not.toBeInTheDocument();
  });

  it("shows remembered-key state without exposing the credential", async () => {
    renderSidebar(
      coordinator({
        getKeyStatus: vi.fn(async () => ({
          state: "remembered" as const,
          generation: "key-1",
        })),
      })
    );

    expect(await screen.findByText(/key remembered on this device/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("sk-ant");
  });
});
