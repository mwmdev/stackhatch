import { describe, expect, it, vi } from "vitest";
import type { StackArchitecture } from "@/types/stack";
import type { VaultRepository } from "./repository";
import { createWorkspaceVault } from "./workspace";

const emptyCanvas: StackArchitecture = { nodes: [], edges: [] };

function repositoryMock(overrides: Partial<VaultRepository> = {}) {
  return {
    getGeneration: vi.fn().mockResolvedValue("generation-1"),
    saveProjectBundle: vi.fn().mockImplementation(async (bundle) => ({
      ...bundle.project,
      revision: 1,
    })),
    recordProjectOpen: vi.fn().mockResolvedValue(true),
    putTemplate: vi.fn(),
    subscribeInvalidation: vi.fn(() => () => undefined),
    ...overrides,
  } as unknown as VaultRepository;
}

describe("workspace vault facade", () => {
  it("creates and opens a browser-local project atomically enough for navigation", async () => {
    const repository = repositoryMock();
    const workspace = createWorkspaceVault(repository, {
      createId: () => "local-map",
      now: () => 42,
    });

    const project = await workspace.createProject({
      name: "Local map",
      description: "# Requirements",
      canvasState: emptyCanvas,
    });

    expect(repository.saveProjectBundle).toHaveBeenCalledWith(
      {
        project: {
          id: "local-map",
          name: "Local map",
          description: "# Requirements",
          repoUrl: null,
          canvasState: emptyCanvas,
          createdAt: 42,
          updatedAt: 42,
        },
      },
      { expectedGeneration: "generation-1", expectedProjectRevision: null }
    );
    expect(repository.recordProjectOpen).toHaveBeenCalledWith("local-map", "generation-1");
    expect(project.id).toBe("local-map");
  });

  it("saves canvas revisions with both generation and project preconditions", async () => {
    const repository = repositoryMock({
      saveProjectBundle: vi.fn().mockImplementation(async (bundle) => ({
        ...bundle.project,
        revision: 8,
      })),
    });
    const workspace = createWorkspaceVault(repository, { now: () => 50 });
    const project = {
      id: "map-1",
      name: "Map",
      description: null,
      repoUrl: null,
      canvasState: null,
      revision: 7,
      createdAt: 10,
      updatedAt: 20,
    };

    await workspace.saveCanvas(project, emptyCanvas, {
      expectedGeneration: "generation-1",
      expectedProjectRevision: 7,
    });

    expect(repository.saveProjectBundle).toHaveBeenCalledWith(
      {
        project: {
          id: "map-1",
          name: "Map",
          description: null,
          repoUrl: null,
          canvasState: emptyCanvas,
          createdAt: 10,
          updatedAt: 50,
        },
      },
      { expectedGeneration: "generation-1", expectedProjectRevision: 7 }
    );
    expect(repository.getGeneration).not.toHaveBeenCalled();
  });

  it("explicitly overwrites against the latest stored revision", async () => {
    const latest = {
      id: "map-1",
      name: "Map",
      description: null,
      repoUrl: null,
      canvasState: null,
      revision: 9,
      createdAt: 10,
      updatedAt: 40,
    };
    const repository = repositoryMock({
      getProject: vi.fn().mockResolvedValue(latest),
    });
    const workspace = createWorkspaceVault(repository, { now: () => 60 });

    await workspace.overwriteCanvas("map-1", emptyCanvas);

    expect(repository.saveProjectBundle).toHaveBeenCalledWith(
      {
        project: {
          id: "map-1",
          name: "Map",
          description: null,
          repoUrl: null,
          canvasState: emptyCanvas,
          createdAt: 10,
          updatedAt: 60,
        },
      },
      { expectedGeneration: "generation-1", expectedProjectRevision: 9 }
    );
  });
});
