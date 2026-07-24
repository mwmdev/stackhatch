import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { markProjectStart } from "@/lib/project-start";
import type { WorkspaceVault } from "@/lib/vault/workspace";
import ProjectStartWorkspace from "./ProjectStartWorkspace";

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
    listTemplates: vi.fn().mockResolvedValue([]),
    subscribeInvalidation: vi.fn(() => () => undefined),
    ...overrides,
  } as unknown as WorkspaceVault;
}

function renderWorkspace(
  props: Partial<React.ComponentProps<typeof ProjectStartWorkspace>> = {},
  vault = makeVault()
) {
  return {
    vault,
    ...render(<ProjectStartWorkspace initialMode={null} vault={vault} {...props} />),
  };
}

describe("ProjectStartWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/project/new");
    window.sessionStorage.clear();
  });

  it("offers the four local creation methods without account or decorative UI", () => {
    renderWorkspace();
    expect(screen.getByRole("heading", { name: "Start a new map" })).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /map|requirements|repository|template/i })
    ).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "Account" })).not.toBeInTheDocument();
    expect(document.querySelector("[data-stack-illustration]")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All Maps" })).toHaveAttribute("href", "/app/maps");
  });

  it("creates a blank map in the vault and opens the static fragment route", async () => {
    const localVault = makeVault({
      createProject: vi.fn().mockResolvedValue(project("blank-map")),
    });
    const fetchSpy = vi.spyOn(global, "fetch");
    renderWorkspace({}, localVault);

    fireEvent.click(screen.getByRole("button", { name: /Blank map/ }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/project/#blank-map"));
    expect(localVault.createProject).toHaveBeenCalledWith({
      name: "Untitled Project",
      description: null,
      repoUrl: null,
      canvasState: null,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps the successful creation latch closed until navigation unmounts the chooser", async () => {
    const createProject = vi.fn().mockResolvedValue(project("blank-map"));
    renderWorkspace({}, makeVault({ createProject }));

    fireEvent.click(screen.getByRole("button", { name: /Blank map/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/project/#blank-map"));

    expect(screen.getByRole("button", { name: "Creating map..." })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Creating map..." }));
    expect(createProject).toHaveBeenCalledOnce();
  });

  it("offers the already-saved map when client navigation throws", async () => {
    push.mockImplementationOnce(() => {
      throw new Error("navigation failed");
    });
    const createProject = vi.fn().mockResolvedValue(project("saved-map"));
    renderWorkspace({ initialMode: "blank" }, makeVault({ createProject }));

    fireEvent.click(screen.getByRole("button", { name: "Create blank map" }));

    const recovery = await screen.findByRole("link", { name: "Open the saved map" });
    expect(recovery).toHaveAttribute("href", "/project#saved-map");
    expect(screen.getByRole("button", { name: "Creating map..." })).toBeDisabled();
    expect(createProject).toHaveBeenCalledOnce();
  });

  it("does not implicitly create from a directly loaded blank URL", async () => {
    const localVault = makeVault();
    renderWorkspace({ initialMode: "blank" }, localVault);

    expect(screen.getByRole("button", { name: "Create blank map" })).toBeEnabled();
    expect(localVault.createProject).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Create blank map" }));
    await waitFor(() => expect(localVault.createProject).toHaveBeenCalledOnce());
  });

  it("consumes a one-shot chooser gesture exactly once", async () => {
    markProjectStart("blank");
    const localVault = makeVault();
    renderWorkspace({ initialMode: "blank" }, localVault);

    await waitFor(() => expect(localVault.createProject).toHaveBeenCalledOnce());
    expect(window.sessionStorage.getItem("stackhatch:blank-auto-create")).toBeNull();
  });

  it("stages requirements locally without a provider request", async () => {
    const localVault = makeVault({
      createProject: vi.fn().mockResolvedValue(project("requirements-map")),
    });
    const fetchSpy = vi.spyOn(global, "fetch");
    renderWorkspace({ initialMode: "requirements" }, localVault);

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

  it("hydrates repository and return context from the fragment, then stages locally", async () => {
    window.history.replaceState(
      {},
      "",
      "/project/new?mode=repository#repo=acme%2Fapi&returnTo=%2Fproject%2F%23origin-map"
    );
    const localVault = makeVault({
      createProject: vi.fn().mockResolvedValue(project("repository-map")),
    });
    renderWorkspace({ initialMode: "repository" }, localVault);

    const repository = await screen.findByLabelText("Public GitHub repository");
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

  it("copies a personal vault template into a separate local map", async () => {
    const localVault = makeVault({
      listTemplates: vi.fn().mockResolvedValue([
        {
          id: "template-1",
          name: "Boundary",
          description: null,
          canvasState: { nodes: [], edges: [] },
          revision: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      ]),
    });
    renderWorkspace({ initialMode: "template" }, localVault);

    fireEvent.click(await screen.findByRole("button", { name: /Boundary/ }));
    await waitFor(() =>
      expect(localVault.createProject).toHaveBeenCalledWith({
        name: "Boundary – Copy",
        description: null,
        repoUrl: null,
        canvasState: { nodes: [], edges: [] },
      })
    );
  });

  it("keeps browser-storage creation failures retryable", async () => {
    const createProject = vi
      .fn()
      .mockRejectedValueOnce(new Error("quota"))
      .mockResolvedValueOnce(project("retried-map"));
    renderWorkspace({ initialMode: "blank" }, makeVault({ createProject }));

    fireEvent.click(screen.getByRole("button", { name: "Create blank map" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("browser storage");
    fireEvent.click(screen.getByRole("button", { name: "Retry blank map" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/project/#retried-map"));
  });
});
