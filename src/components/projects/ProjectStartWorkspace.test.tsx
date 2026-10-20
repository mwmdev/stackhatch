import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { markProjectStart } from "@/lib/project-start";
import type { ProviderKeyManager } from "@/lib/provider-key";
import type { WorkspaceVault } from "@/lib/vault/workspace";
import ProjectStartWorkspace from "./ProjectStartWorkspace";
import { MAX_REQUIREMENTS_CHARACTERS, MAX_REQUIREMENTS_FILE_BYTES } from "@/lib/requirements-file";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark", setTheme: vi.fn() }),
}));

function project(id: string) {
  return {
    id,
    name: "Map",
    description: null,
    repoUrl: null,
    canvasState: null,
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
  };
}

function makeVault(overrides: Partial<WorkspaceVault> = {}) {
  return {
    createProject: vi.fn().mockResolvedValue(project("local-map")),
    getAiSelection: vi.fn().mockResolvedValue({ provider: "anthropic", model: "claude-sonnet-5" }),
    selectAiProvider: vi.fn(),
    subscribeInvalidation: vi.fn(() => () => undefined),
    ...overrides,
  } as unknown as WorkspaceVault;
}
function keyManager(initial: "absent" | "session" = "session") {
  let state = initial;
  // No GitHub token unless a test sets one.
  let githubState: "absent" | "session" | "remembered" = "absent";
  const status = (provider = "anthropic") =>
    provider === "github"
      ? { provider, state: githubState, generation: "test" }
      : { provider: "anthropic", state, generation: "test" };
  const manager = {
    getStatus: vi.fn(async (provider?: string) => status(provider)),
    useSessionKey: vi.fn(async (provider?: string) => {
      if (provider === "github") githubState = "session";
      else state = "session";
      return status(provider);
    }),
    rememberKey: vi.fn(async (provider?: string) => {
      if (provider === "github") githubState = "remembered";
      else state = "session";
      return status(provider);
    }),
    /** Simulates the key being forgotten elsewhere, e.g. in another tab. */
    forgetElsewhere() {
      state = "absent";
    },
  };
  return manager as unknown as ProviderKeyManager & { forgetElsewhere(): void };
}

/** Renders and waits for the key status read that decides what the page shows. */
async function renderWorkspace(
  props: Partial<React.ComponentProps<typeof ProjectStartWorkspace>> = {},
  vault = makeVault()
) {
  const result = render(
    <ProjectStartWorkspace initialMode={null} vault={vault} keyManager={keyManager()} {...props} />
  );
  await waitFor(() =>
    expect(
      screen.queryAllByRole("button", {
        name: /^(Create blank map|Creating map\.\.\.)$/,
      })
    ).not.toHaveLength(0)
  );
  return { vault, ...result };
}

describe("ProjectStartWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/project/new");
    window.sessionStorage.clear();
  });

  it("offers only the three supported starting points without account or decorative UI", async () => {
    await renderWorkspace();
    expect(screen.getByRole("heading", { name: "Start a new map" })).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Create blank map" })).toBeInTheDocument();
    expect(screen.getByLabelText("Choose .md or .txt file")).toBeInTheDocument();
    expect(screen.getByLabelText("GitHub repository")).toBeInTheDocument();
    expect(screen.queryByText("Start from a worked example")).not.toBeInTheDocument();
    expect(screen.queryByText("Or bring your own")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Copy one of your saved maps instead" })
    ).not.toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "Account" })).not.toBeInTheDocument();
    expect(document.querySelector("[data-stack-illustration]")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All maps" })).toHaveAttribute("href", "/app/maps");
  });
  it("rejects a malformed key and discloses the remembered-key risk", async () => {
    const manager = keyManager("absent");
    await renderWorkspace({ keyManager: manager });
    const input = await screen.findByLabelText("Anthropic API key");
    expect(
      screen.getByText(/extensions, same-origin scripts and anyone using/)
    ).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Use key" }));
    expect(screen.getByRole("alert")).toHaveTextContent("It starts with sk-ant-");
    expect(manager.useSessionKey).not.toHaveBeenCalled();
  });

  it("shows each start's error beside the control that caused it", async () => {
    await renderWorkspace(
      {},
      makeVault({ createProject: vi.fn().mockRejectedValue(new Error("quota")) })
    );

    const repository = screen.getByLabelText("GitHub repository");
    fireEvent.change(repository, { target: { value: "not a repo" } });
    fireEvent.click(screen.getByRole("button", { name: "Map repository" }));
    const repositoryAlert = await screen.findByRole("alert");
    expect(repositoryAlert).toHaveTextContent(
      "Enter a GitHub repository as owner/repo or a full GitHub URL."
    );
    expect(repository).toHaveAttribute("aria-invalid", "true");
    expect(repository).toHaveAccessibleDescription(repositoryAlert.textContent!);
    expect(repository.closest("form")).toContainElement(repositoryAlert);

    fireEvent.click(screen.getByRole("button", { name: "Create blank map" }));
    const storageAlert = await screen.findByText(/could not be saved to browser storage/);
    expect(storageAlert).toHaveAttribute("role", "alert");
    expect(storageAlert.parentElement).toContainElement(
      screen.getByRole("button", { name: "Retry blank map" })
    );
    expect(repository).not.toHaveAttribute("aria-invalid");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("offers every start without a key and asks for one when an AI start is submitted", async () => {
    const vault = makeVault();
    await renderWorkspace({ keyManager: keyManager("absent") }, vault);

    const keyHeading = screen.getByRole("heading", { name: "Connect an AI provider" });
    expect(screen.getByRole("button", { name: "Create blank map" })).toBeInTheDocument();
    expect(screen.getByLabelText("Choose .md or .txt file")).toBeInTheDocument();
    expect(screen.getByLabelText("GitHub repository")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("GitHub repository"), {
      target: { value: "acme/api" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Map repository" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Add an AI provider key to generate this map."
    );
    await waitFor(() => expect(keyHeading).toHaveFocus());
    expect(vault.createProject).not.toHaveBeenCalled();

    fireEvent.change(await screen.findByLabelText("Anthropic API key"), {
      target: { value: "sk-ant-valid-test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Use key" }));
    await screen.findByText("Anthropic key");
    fireEvent.click(screen.getByRole("button", { name: "Map repository" }));
    await waitFor(() => expect(vault.createProject).toHaveBeenCalledOnce());
  });

  it("adds a fine-grained GitHub token before the repository map exists", async () => {
    const vault = makeVault();
    const manager = keyManager("session");
    await renderWorkspace({ keyManager: manager }, vault);

    const disclosure = await screen.findByRole("button", {
      name: "Private repository? Add a GitHub token",
    });
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("GitHub token")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("GitHub repository"), {
      target: { value: "acme/billing" },
    });
    fireEvent.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Create a read-only token for acme" })).toHaveAttribute(
      "href",
      expect.stringContaining("target_name=acme")
    );

    const token = screen.getByLabelText("GitHub token");
    fireEvent.change(token, { target: { value: "ghp_classic" } });
    fireEvent.click(screen.getByRole("button", { name: "Map repository" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/only accepts fine-grained tokens/);
    expect(token).toHaveAttribute("aria-invalid", "true");
    expect(vault.createProject).not.toHaveBeenCalled();

    fireEvent.change(token, { target: { value: "github_pat_private" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Remember on this device/ }));
    fireEvent.click(screen.getByRole("button", { name: "Map repository" }));

    await waitFor(() => expect(vault.createProject).toHaveBeenCalledOnce());
    expect(manager.rememberKey).toHaveBeenCalledWith("github", "github_pat_private");
    expect(vi.mocked(manager.rememberKey).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(vault.createProject).mock.invocationCallOrder[0]
    );
    expect(vault.createProject).toHaveBeenCalledWith(
      expect.objectContaining({ repoUrl: "https://github.com/acme/billing" })
    );
    expect(screen.getByText("Remembered on device")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Change in Settings" })).toHaveAttribute(
      "href",
      "/settings#github-token"
    );
  });

  it("starts a blank canvas without a key", async () => {
    const vault = makeVault({ createProject: vi.fn().mockResolvedValue(project("blank-map")) });
    await renderWorkspace({ keyManager: keyManager("absent") }, vault);

    fireEvent.click(screen.getByRole("button", { name: "Create blank map" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/project/#blank-map"));
    expect(vault.createProject).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Untitled map", repoUrl: null })
    );
  });

  it("returns to key setup when the key is gone by the time a start is submitted", async () => {
    const vault = makeVault();
    const manager = keyManager("session");
    const readAsText = vi.spyOn(FileReader.prototype, "readAsText");
    await renderWorkspace({ keyManager: manager }, vault);
    manager.forgetElsewhere();

    fireEvent.change(screen.getByLabelText("Choose .md or .txt file"), {
      target: { files: [new File(["# Plan"], "plan.md")] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Add an AI provider key to generate this map."
    );
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Connect an AI provider" })).toHaveFocus()
    );
    expect(readAsText).not.toHaveBeenCalled();
    expect(vault.createProject).not.toHaveBeenCalled();
    readAsText.mockRestore();
  });

  it("shows an error instead of failing silently when the provider setting is unreadable", async () => {
    const vault = makeVault({
      getAiSelection: vi.fn().mockRejectedValue(new Error("storage")),
    });
    await renderWorkspace({}, vault);
    await act(async () => {});
    fireEvent.change(screen.getByLabelText("GitHub repository"), {
      target: { value: "acme/api" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Map repository" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The AI provider setting could not be read"
    );
    expect(vault.createProject).not.toHaveBeenCalled();
  });

  it("creates a blank map in the vault and opens the static fragment route", async () => {
    const localVault = makeVault({
      createProject: vi.fn().mockResolvedValue(project("blank-map")),
    });
    const fetchSpy = vi.spyOn(global, "fetch");
    await renderWorkspace({}, localVault);

    fireEvent.click(screen.getByRole("button", { name: "Create blank map" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/project/#blank-map"));
    expect(localVault.createProject).toHaveBeenCalledWith({
      name: "Untitled map",
      description: null,
      repoUrl: null,
      canvasState: null,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps the successful creation latch closed until navigation unmounts the chooser", async () => {
    const createProject = vi.fn().mockResolvedValue(project("blank-map"));
    await renderWorkspace({}, makeVault({ createProject }));

    fireEvent.click(screen.getByRole("button", { name: "Create blank map" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/project/#blank-map"));

    const busy = screen.getAllByRole("button", { name: "Creating map..." });
    busy.forEach((button) => expect(button).toBeDisabled());
    fireEvent.click(busy[0]);
    expect(createProject).toHaveBeenCalledOnce();
  });

  it("offers the already-saved map when client navigation throws", async () => {
    push.mockImplementationOnce(() => {
      throw new Error("navigation failed");
    });
    const createProject = vi.fn().mockResolvedValue(project("saved-map"));
    await renderWorkspace({ initialMode: "blank" }, makeVault({ createProject }));

    fireEvent.click(screen.getByRole("button", { name: "Create blank map" }));

    const recovery = await screen.findByRole("link", { name: "Open the saved map" });
    expect(recovery).toHaveAttribute("href", "/project#saved-map");
    screen
      .getAllByRole("button", { name: "Creating map..." })
      .forEach((button) => expect(button).toBeDisabled());
    expect(createProject).toHaveBeenCalledOnce();
  });

  it("does not implicitly create from a directly loaded blank URL", async () => {
    const localVault = makeVault();
    await renderWorkspace({ initialMode: "blank" }, localVault);

    expect(screen.getByRole("button", { name: "Create blank map" })).toBeEnabled();
    expect(localVault.createProject).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Create blank map" }));
    await waitFor(() => expect(localVault.createProject).toHaveBeenCalledOnce());
  });

  it("consumes a one-shot chooser gesture exactly once", async () => {
    markProjectStart("blank");
    const localVault = makeVault();
    await renderWorkspace({ initialMode: "blank" }, localVault);

    await waitFor(() => expect(localVault.createProject).toHaveBeenCalledOnce());
    expect(window.sessionStorage.getItem("stackhatch:blank-auto-create")).toBeNull();
  });

  it("stages requirements locally without a provider request", async () => {
    const localVault = makeVault({
      createProject: vi.fn().mockResolvedValue(project("requirements-map")),
    });
    const fetchSpy = vi.spyOn(global, "fetch");
    await renderWorkspace({ initialMode: "requirements" }, localVault);

    fireEvent.change(screen.getByLabelText("Choose .md or .txt file"), {
      target: {
        files: [
          new File(["## Platform architecture\n\nKeep data local."], "requirements.md", {
            type: "text/markdown",
          }),
        ],
      },
    });

    await waitFor(() =>
      expect(localVault.createProject).toHaveBeenCalledWith({
        name: "Platform architecture",
        description: "## Platform architecture\n\nKeep data local.",
        repoUrl: null,
        canvasState: null,
      })
    );
    expect(push).toHaveBeenCalledWith("/project/#requirements-map");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects an oversized requirements file before reading or writing", async () => {
    const localVault = makeVault();
    const readAsText = vi.spyOn(FileReader.prototype, "readAsText");
    await renderWorkspace({ initialMode: "requirements" }, localVault);

    fireEvent.change(screen.getByLabelText("Choose .md or .txt file"), {
      target: {
        files: [
          new File(["x".repeat(MAX_REQUIREMENTS_FILE_BYTES + 1)], "oversized.md", {
            type: "text/markdown",
          }),
        ],
      },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The requirements file is too large. Choose a file no larger than 1 MB."
    );
    expect(readAsText).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("stackhatch:project-start-method")).toBeNull();
    expect(localVault.createProject).not.toHaveBeenCalled();
    readAsText.mockRestore();
  });

  it("accepts a requirements file at the exact byte limit", async () => {
    const createProject = vi.fn().mockResolvedValue(project("boundary-map"));
    await renderWorkspace({ initialMode: "requirements" }, makeVault({ createProject }));

    fireEvent.change(screen.getByLabelText("Choose .md or .txt file"), {
      target: {
        files: [
          new File(["x".repeat(MAX_REQUIREMENTS_FILE_BYTES)], "boundary.md", {
            type: "text/markdown",
          }),
        ],
      },
    });

    await waitFor(() => expect(createProject).toHaveBeenCalledOnce());
    expect(createProject.mock.calls[0][0].description).toHaveLength(MAX_REQUIREMENTS_FILE_BYTES);
  });

  it("rejects decoded requirements over the stored-string limit without writing", async () => {
    const localVault = makeVault();
    const readAsText = vi.spyOn(FileReader.prototype, "readAsText").mockImplementation(function (
      this: FileReader
    ) {
      Object.defineProperty(this, "result", {
        configurable: true,
        value: "x".repeat(MAX_REQUIREMENTS_CHARACTERS + 1),
      });
      this.onload?.call(this, new ProgressEvent("load") as ProgressEvent<FileReader>);
    });
    await renderWorkspace({ initialMode: "requirements" }, localVault);

    fireEvent.change(screen.getByLabelText("Choose .md or .txt file"), {
      target: {
        files: [new File(["small"], "nominal.md", { type: "text/markdown" })],
      },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The requirements file is too large. Choose a file no larger than 1 MB."
    );
    expect(readAsText).toHaveBeenCalledOnce();
    expect(window.sessionStorage.getItem("stackhatch:project-start-method")).toBeNull();
    expect(localVault.createProject).not.toHaveBeenCalled();
    readAsText.mockRestore();
  });

  it("hydrates repository and return context from the fragment, then stages locally", async () => {
    window.history.replaceState(
      {},
      "",
      "/project/new?mode=repository#repo=acme%2Fapi&returnTo=%2Fproject%2F%23origin-map"
    );
    const localVault = makeVault({
      createProject: vi.fn().mockResolvedValue(project("repository-map")),
    });
    await renderWorkspace({ initialMode: "repository" }, localVault);

    const repository = await screen.findByLabelText("GitHub repository");
    expect(repository).toHaveValue("acme/api");
    expect(screen.getByRole("link", { name: "Cancel map creation" })).toHaveAttribute(
      "href",
      "/project/#origin-map"
    );
    fireEvent.click(screen.getByRole("button", { name: "Map repository" }));

    await waitFor(() =>
      expect(localVault.createProject).toHaveBeenCalledWith({
        name: "api",
        description: null,
        repoUrl: "https://github.com/acme/api",
        canvasState: null,
      })
    );
    expect(push).toHaveBeenCalledWith("/project/#repository-map");
  });

  it("ignores the retired template mode and keeps the chooser available", async () => {
    window.history.replaceState({}, "", "/project/new?mode=template");
    const localVault = makeVault();
    await renderWorkspace({}, localVault);

    expect(screen.getByRole("button", { name: "Create blank map" })).toBeEnabled();
    expect(screen.queryByRole("dialog", { name: "Start from Template" })).not.toBeInTheDocument();
    expect(localVault.createProject).not.toHaveBeenCalled();
  });

  it("keeps browser-storage creation failures retryable", async () => {
    const createProject = vi
      .fn()
      .mockRejectedValueOnce(new Error("quota"))
      .mockResolvedValueOnce(project("retried-map"));
    await renderWorkspace({ initialMode: "blank" }, makeVault({ createProject }));

    fireEvent.click(screen.getByRole("button", { name: "Create blank map" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("browser storage");
    fireEvent.click(screen.getByRole("button", { name: "Retry blank map" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/project/#retried-map"));
  });
});
