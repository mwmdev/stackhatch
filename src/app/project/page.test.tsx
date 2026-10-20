import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { WorkspaceVault } from "@/lib/vault/workspace";
import { nodesOverlap } from "@/lib/node-collision";
import ProjectPage from "./page";

vi.mock("reactflow", () => {
  const React = require("react");
  const ReactFlow = ({
    children,
    nodes = [],
    edges = [],
    onNodesChange,
    onNodeClick,
  }: {
    children?: React.ReactNode;
    nodes?: unknown[];
    edges?: unknown[];
    onNodesChange?: (changes: unknown[]) => void;
    onNodeClick?: (event: React.MouseEvent, node: unknown) => void;
  }) => {
    return (
      <div
        data-testid="react-flow-canvas"
        data-node-count={String(nodes.length)}
        data-edge-count={String(edges.length)}
      >
        <button
          type="button"
          hidden
          data-testid="simulate-blocked-drag"
          onClick={() => {
            onNodesChange?.([
              {
                id: "data",
                type: "position",
                position: { x: 100, y: 0 },
                positionAbsolute: { x: 100, y: 0 },
                dragging: true,
              },
            ]);
            onNodesChange?.([
              {
                id: "data",
                type: "position",
                position: { x: 100, y: 0 },
                positionAbsolute: { x: 100, y: 0 },
                dragging: false,
              },
            ]);
          }}
        >
          Simulate blocked drag
        </button>
        {nodes.length > 0 && (
          <button
            type="button"
            hidden
            data-testid="simulate-node-select"
            onClick={(event) => onNodeClick?.(event, nodes[0])}
          >
            Select node
          </button>
        )}
        {children}
      </div>
    );
  };
  return {
    __esModule: true,
    default: ReactFlow,
    Background: () => <div data-testid="react-flow-background" />,
    BackgroundVariant: { Dots: "dots" },
    useNodesState: (initial: unknown[]) => {
      const [nodes, setNodes] = React.useState(initial);
      return [nodes, setNodes, React.useCallback(() => undefined, [])];
    },
    useEdgesState: (initial: unknown[]) => {
      const [edges, setEdges] = React.useState(initial);
      return [edges, setEdges, React.useCallback(() => undefined, [])];
    },
    applyNodeChanges: (
      changes: Array<Record<string, unknown>>,
      nodes: Array<Record<string, unknown>>
    ) =>
      changes.reduce(
        (updatedNodes, change) =>
          change.type === "position"
            ? updatedNodes.map((node) =>
                node.id === change.id
                  ? {
                      ...node,
                      ...(change.position ? { position: change.position } : {}),
                      ...(change.dragging === undefined ? {} : { dragging: change.dragging }),
                    }
                  : node
              )
            : updatedNodes,
        nodes
      ),
  };
});
vi.mock("reactflow/dist/style.css", () => ({}));
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark", setTheme: vi.fn() }),
}));
vi.mock("@/components/chat/ChatSidebar", () => ({
  default: () => <div data-testid="chat-sidebar" />,
}));
vi.mock("@/components/canvas/NodeDetailPanel", () => ({
  default: ({
    node,
    onDelete,
  }: {
    node: { id: string } | null;
    onDelete: (id: string) => void;
  }) => (
    <div data-testid="node-detail-panel">
      {node && (
        <button type="button" onClick={() => onDelete(node.id)}>
          Remove selected node
        </button>
      )}
    </div>
  ),
}));
vi.mock("@/components/canvas/ConnectionTypeSelector", () => ({ default: () => null }));
vi.mock("@/components/canvas/StackNode", () => ({ default: () => null }));
vi.mock("@/components/canvas/StackEdge", () => ({
  default: () => null,
  edgeStyles: {
    http: { displayName: "HTTP" },
    websocket: { displayName: "WebSocket" },
    grpc: { displayName: "gRPC" },
    tcp: { displayName: "TCP" },
    "pub-sub": { displayName: "Pub/Sub" },
    "file-io": { displayName: "File I/O" },
  },
}));
vi.mock("@/components/canvas/EdgeLegend", () => ({ default: () => null }));
vi.mock("@/components/canvas/EditorToolSurface", () => ({
  default: ({
    onAddNode,
    onChatOpenChange,
    onAutoLayout,
  }: {
    onAddNode: (category: "data", subtype: "sql-db") => void;
    onChatOpenChange: (open: boolean) => void;
    onAutoLayout: () => void;
  }) => (
    <div>
      <button type="button" onClick={() => onAddNode("data", "sql-db")}>
        Add local node
      </button>
      <button type="button" onClick={() => onAutoLayout()}>
        Auto-layout map
      </button>
      <button type="button" onClick={() => onChatOpenChange(true)}>
        Open assistant
      </button>
    </div>
  ),
}));
vi.mock("@/components/canvas/ExportDropdown", () => ({
  default: ({ beforeProjectBackup }: { beforeProjectBackup: () => Promise<void> }) => (
    <button type="button" onClick={() => void beforeProjectBackup()}>
      Flush for backup
    </button>
  ),
}));

const project = {
  id: "test-project-id",
  name: "Test Project",
  description: "A local map",
  repoUrl: null,
  canvasState: null,
  revision: 3,
  createdAt: 1,
  updatedAt: 2,
};

function makeVault(overrides: Partial<WorkspaceVault> = {}) {
  return {
    getProject: vi.fn().mockResolvedValue(project),
    getProjectSnapshot: vi.fn().mockResolvedValue({
      project,
      generation: "generation-1",
    }),
    getRepositoryProvenance: vi.fn().mockResolvedValue(null),
    getCustomSubtypes: vi.fn().mockResolvedValue({}),
    recordProjectOpen: vi.fn().mockResolvedValue(true),
    saveCanvas: vi.fn().mockImplementation(async (current, canvasState) => ({
      ...current,
      canvasState,
      revision: current.revision + 1,
      updatedAt: current.updatedAt + 1,
    })),
    overwriteCanvas: vi.fn().mockResolvedValue({ ...project, revision: 4 }),
    createProject: vi.fn().mockResolvedValue({ ...project, id: "copy-map" }),
    subscribeInvalidation: vi.fn(() => () => undefined),
    ...overrides,
  } as unknown as WorkspaceVault;
}

describe("static ProjectPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.removeItem("stackhatch:editor-chat-sidebar-width");
    window.history.replaceState({}, "", "/project/#test-project-id");
  });

  it("loads the hash-addressed map from the vault without an API or provider request", async () => {
    const localVault = makeVault();
    const fetchSpy = vi.spyOn(global, "fetch");
    render(<ProjectPage vault={localVault} />);

    expect(screen.getByRole("heading", { name: "Loading map" })).toBeInTheDocument();
    expect(await screen.findByText("Test Project")).toBeInTheDocument();
    expect(localVault.getProjectSnapshot).toHaveBeenCalledWith("test-project-id");
    expect(localVault.recordProjectOpen).toHaveBeenCalledWith("test-project-id");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Account" })).not.toBeInTheDocument();
    expect(document.querySelector("[data-stack-illustration]")).not.toBeInTheDocument();
  });

  it("shows the map description instead of a generic standalone subtitle", async () => {
    const projectWithPaddedDescription = {
      ...project,
      description: "  A local map  ",
    };
    render(
      <ProjectPage
        vault={makeVault({
          getProjectSnapshot: vi.fn().mockResolvedValue({
            project: projectWithPaddedDescription,
            generation: "generation-1",
          }),
        })}
      />
    );

    await screen.findByText("Test Project");
    const description = screen.getByTestId("project-provenance");
    expect(description.textContent).toBe("A local map");
    expect(description).toHaveAttribute("title", "A local map");
    expect(screen.queryByText(/Standalone map/)).not.toBeInTheDocument();
  });

  it("shows only a short plain-language sentence from a Markdown brief", async () => {
    const longDescription =
      "# Test Project\nUsers share recipes with friends. They can comment and save favorites.\n\n" +
      "More detail ".repeat(30_000);
    render(
      <ProjectPage
        vault={makeVault({
          getProjectSnapshot: vi.fn().mockResolvedValue({
            project: { ...project, description: longDescription },
            generation: "generation-1",
          }),
        })}
      />
    );
    await screen.findByText("Test Project");
    const subtitle = screen.getByTestId("project-provenance");
    expect(subtitle).toHaveTextContent("Users share recipes with friends.");
    expect(subtitle).toHaveAttribute("title", "Users share recipes with friends.");
    expect(screen.getByText("Test Project.", { selector: ".sr-only" })).not.toHaveTextContent(
      "Users"
    );
  });

  it("omits the project subtitle when the map has no description", async () => {
    const projectWithoutDescription = {
      ...project,
      description: "   ",
    };
    render(
      <ProjectPage
        vault={makeVault({
          getProjectSnapshot: vi.fn().mockResolvedValue({
            project: projectWithoutDescription,
            generation: "generation-1",
          }),
        })}
      />
    );

    await screen.findByText("Test Project");
    expect(screen.queryByTestId("project-provenance")).not.toBeInTheDocument();
    expect(screen.queryByText(/Standalone map/)).not.toBeInTheDocument();
  });

  it("does not show scanned commit provenance in the title bar", async () => {
    const repositoryProject = {
      ...project,
      repoUrl: "https://github.com/acme/platform",
      repoCommitSha: "697da08f00ba4",
      repoScannedAt: 1_753_728_000_000,
      repoAnalysisStatus: "complete" as const,
    };
    render(
      <ProjectPage
        vault={makeVault({
          getProjectSnapshot: vi.fn().mockResolvedValue({
            project: repositoryProject,
            generation: "generation-1",
          }),
        })}
      />
    );

    await screen.findByText("Test Project");
    expect(screen.queryByText(/Scanned 697da08/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("project-provenance")).not.toBeInTheDocument();
  });

  it("does not guess or create when the fragment is missing or malformed", async () => {
    window.history.replaceState({}, "", "/project/");
    const localVault = makeVault();
    const createProject = vi.fn();
    Object.assign(localVault, { createProject });
    render(<ProjectPage vault={localVault} />);

    expect(await screen.findByText(/does not identify a valid map/)).toBeInTheDocument();
    expect(localVault.getProject).not.toHaveBeenCalled();
    expect(createProject).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "View maps on this device" })).toHaveAttribute(
      "href",
      "/app/maps"
    );
    expect(screen.getByRole("link", { name: "Create a new map" })).toHaveAttribute(
      "href",
      "/project/new"
    );
  });

  it("shows a local not-found recovery state without remote lookup or implicit creation", async () => {
    const localVault = makeVault({ getProjectSnapshot: vi.fn().mockResolvedValue(null) });
    const fetchSpy = vi.spyOn(global, "fetch");
    render(<ProjectPage vault={localVault} />);

    expect(await screen.findByText(/Map not found on this device/)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Retry browser storage" })).toBeEnabled();
  });

  it("keeps a vault initialization failure recoverable", async () => {
    const getProjectSnapshot = vi
      .fn()
      .mockRejectedValueOnce(new Error("blocked"))
      .mockResolvedValueOnce({ project, generation: "generation-1" });
    render(<ProjectPage vault={makeVault({ getProjectSnapshot })} />);

    expect(await screen.findByText(/could not be read from browser storage/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry browser storage" }));
    expect(await screen.findByText("Test Project")).toBeInTheDocument();
  });

  it("auto-saves canvas edits through the revisioned vault writer", async () => {
    const localVault = makeVault();
    render(<ProjectPage vault={localVault} />);
    await screen.findByText("Test Project");

    fireEvent.click(screen.getByRole("button", { name: "Add local node" }));

    await waitFor(
      () =>
        expect(localVault.saveCanvas).toHaveBeenCalledWith(
          expect.objectContaining({ id: "test-project-id", revision: 3 }),
          expect.objectContaining({
            nodes: expect.arrayContaining([expect.objectContaining({ category: "data" })]),
          }),
          {
            expectedGeneration: "generation-1",
            expectedProjectRevision: 3,
          }
        ),
      { timeout: 1_500 }
    );
  });

  it("persists a rename committed while a previous canvas write is in flight", async () => {
    let releaseFirst: (() => void) | undefined;
    const saved: Array<{ name: string; revision: number }> = [];
    const saveCanvas = vi.fn(async (current: typeof project) => {
      if (!releaseFirst) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
      const next = { ...current, revision: current.revision + 1, updatedAt: current.updatedAt + 1 };
      saved.push({ name: next.name, revision: next.revision });
      return next;
    });
    const localVault = makeVault({ saveCanvas: saveCanvas as WorkspaceVault["saveCanvas"] });
    render(<ProjectPage vault={localVault} />);
    await screen.findByText("Test Project");
    fireEvent.click(screen.getByRole("button", { name: "Add local node" }));
    await waitFor(() => expect(saveCanvas).toHaveBeenCalledTimes(1), { timeout: 1_500 });
    fireEvent.click(screen.getByRole("button", { name: /Map name, select to rename/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Map name" }), {
      target: { value: "Renamed Map" },
    });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Map name" }), { key: "Enter" });
    releaseFirst?.();
    await waitFor(() => expect(saved.at(-1)?.name).toBe("Renamed Map"), { timeout: 1_500 });
    expect(saveCanvas).toHaveBeenCalledTimes(2);
    expect(saved.map((item) => item.revision)).toEqual([4, 5]);
  });

  it("flushes debounced canvas edits before a backup reads storage", async () => {
    const localVault = makeVault();
    render(<ProjectPage vault={localVault} />);
    await screen.findByText("Test Project");
    fireEvent.click(screen.getByRole("button", { name: "Add local node" }));
    fireEvent.click(screen.getByRole("button", { name: "Flush for backup" }));
    await waitFor(() => expect(localVault.saveCanvas).toHaveBeenCalledTimes(1));
    expect(vi.mocked(localVault.saveCanvas).mock.calls[0][1].nodes).toHaveLength(1);
  });

  it("auto-layouts unlocked nodes while preserving locked positions in the saved canvas", async () => {
    const nodes = [
      {
        id: "locked",
        name: "Locked",
        category: "client" as const,
        subtype: "web-app" as const,
        technology: "",
        description: "",
        reasoning: "",
        locked: true,
      },
      {
        id: "movable",
        name: "Movable",
        category: "data" as const,
        subtype: "sql-db" as const,
        technology: "",
        description: "",
        reasoning: "",
        locked: false,
      },
    ];
    const localVault = makeVault({
      getProjectSnapshot: vi.fn().mockResolvedValue({
        project: {
          ...project,
          canvasState: {
            nodes,
            edges: [],
            positions: { locked: { x: 900, y: 900 }, movable: { x: 100, y: 100 } },
          },
        },
        generation: "generation-1",
      }),
    });
    render(<ProjectPage vault={localVault} />);
    await screen.findByText("Test Project");
    fireEvent.click(screen.getByRole("button", { name: "Auto-layout map" }));
    await waitFor(() => expect(localVault.saveCanvas).toHaveBeenCalled(), { timeout: 1_500 });
    const saved = vi.mocked(localVault.saveCanvas).mock.calls.at(-1)![1];
    expect(saved.positions?.locked).toEqual({ x: 900, y: 900 });
    expect(saved.positions?.movable).not.toEqual({ x: 100, y: 100 });
  });

  it("removes a deleted node's alternatives and position from persisted backups", async () => {
    const localVault = makeVault({
      getProjectSnapshot: vi.fn().mockResolvedValue({
        project: {
          ...project,
          canvasState: {
            nodes: [
              {
                id: "one",
                name: "One",
                category: "client",
                subtype: "web-app",
                technology: "",
                description: "",
                reasoning: "",
                locked: false,
              },
            ],
            edges: [],
            positions: { one: { x: 100, y: 100 } },
            alternatives: {
              one: [
                {
                  id: "alt",
                  name: "Alternate",
                  category: "client",
                  subtype: "web-app",
                  technology: "",
                  description: "",
                  reasoning: "",
                },
              ],
            },
          },
        },
        generation: "generation-1",
      }),
    });
    render(<ProjectPage vault={localVault} />);
    await screen.findByText("Test Project");
    fireEvent.click(screen.getByTestId("simulate-node-select"));
    fireEvent.click(screen.getByRole("button", { name: "Remove selected node" }));
    await waitFor(() => expect(localVault.saveCanvas).toHaveBeenCalled(), { timeout: 1_500 });
    const canvas = vi.mocked(localVault.saveCanvas).mock.calls.at(-1)![1];
    expect(canvas.nodes).toHaveLength(0);
    expect(canvas.alternatives).toEqual({});
    expect(canvas.positions).toEqual({});
  });

  it("repairs and saves overlapping positions from stored maps", async () => {
    const overlappingProject = {
      ...project,
      canvasState: {
        nodes: [
          {
            id: "client",
            category: "client" as const,
            subtype: "web-app" as const,
            name: "Web App",
            technology: "Next.js",
            description: "",
            reasoning: "",
            locked: false,
          },
          {
            id: "data",
            category: "data" as const,
            subtype: "sql-db" as const,
            name: "Database",
            technology: "PostgreSQL",
            description: "",
            reasoning: "",
            locked: false,
          },
        ],
        edges: [],
        positions: {
          client: { x: 100, y: 100 },
          data: { x: 100, y: 100 },
        },
      },
    };
    const localVault = makeVault({
      getProjectSnapshot: vi.fn().mockResolvedValue({
        project: overlappingProject,
        generation: "generation-1",
      }),
    });

    render(<ProjectPage vault={localVault} />);
    await screen.findByText("Test Project");

    await waitFor(
      () => {
        const savedCanvas = vi.mocked(localVault.saveCanvas).mock.calls.at(-1)?.[1];
        expect(savedCanvas?.positions?.client).toEqual({ x: 100, y: 100 });
        const clientPosition = savedCanvas?.positions?.client;
        const dataPosition = savedCanvas?.positions?.data;
        expect(clientPosition).toBeDefined();
        expect(dataPosition).toBeDefined();
        expect(
          nodesOverlap(
            { id: "client", position: clientPosition!, data: {} },
            { id: "data", position: dataPosition!, data: {} }
          )
        ).toBe(false);
      },
      { timeout: 1_500 }
    );
  });

  it("does not save a rejected drag that changes only transient dragging state", async () => {
    const positionedProject = {
      ...project,
      canvasState: {
        nodes: [
          {
            id: "client",
            category: "client" as const,
            subtype: "web-app" as const,
            name: "Web App",
            technology: "Next.js",
            description: "",
            reasoning: "",
            locked: false,
          },
          {
            id: "data",
            category: "data" as const,
            subtype: "sql-db" as const,
            name: "Database",
            technology: "PostgreSQL",
            description: "",
            reasoning: "",
            locked: false,
          },
        ],
        edges: [],
        positions: {
          client: { x: 0, y: 0 },
          data: { x: 300, y: 0 },
        },
      },
    };
    const localVault = makeVault({
      getProjectSnapshot: vi.fn().mockResolvedValue({
        project: positionedProject,
        generation: "generation-1",
      }),
    });

    render(<ProjectPage vault={localVault} />);
    await screen.findByText("Test Project");

    fireEvent.click(screen.getByTestId("simulate-blocked-drag"));

    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(localVault.saveCanvas).not.toHaveBeenCalled();
  });

  it("pauses editing and exposes explicit recovery choices after a save conflict", async () => {
    const localVault = makeVault({
      saveCanvas: vi.fn().mockRejectedValue(new Error("conflict")),
    });
    render(<ProjectPage vault={localVault} />);
    await screen.findByText("Test Project");

    fireEvent.click(screen.getByRole("button", { name: "Add local node" }));

    const alert = await screen.findByRole("alert", { name: "" }, { timeout: 1_500 });
    expect(alert).toHaveTextContent("Local auto-save paused");
    expect(screen.getByRole("button", { name: "Retry save" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reload stored map" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save snapshot as a copy" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Overwrite stored map" })).toBeEnabled();
    expect(screen.getByTestId("project-editor-shell")).toHaveAttribute(
      "data-mutation-blocked",
      "true"
    );

    fireEvent.click(screen.getByRole("button", { name: "Overwrite stored map" }));
    await waitFor(() =>
      expect(localVault.overwriteCanvas).toHaveBeenCalledWith(
        "test-project-id",
        expect.objectContaining({
          nodes: expect.arrayContaining([expect.objectContaining({ category: "data" })]),
        })
      )
    );
  });

  it("keeps the assistant mounted so in-flight work survives collapsing it", async () => {
    // It used to be conditionally rendered, so closing the panel or leaving to
    // fetch an API key discarded a completed repository scan.
    const fetchSpy = vi.spyOn(global, "fetch");
    render(<ProjectPage vault={makeVault()} />);
    await screen.findByText("Test Project");

    expect(screen.getByTestId("chat-sidebar")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Open assistant" }));
    expect(screen.getByTestId("chat-sidebar")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("offers a bounded keyboard resize control for the open assistant", async () => {
    render(<ProjectPage vault={makeVault()} />);
    await screen.findByText("Test Project");

    fireEvent.click(screen.getByRole("button", { name: "Open assistant" }));

    const separator = screen.getByRole("separator", { name: "Resize chat sidebar" });
    const sidebar = document.getElementById("editor-chat-sidebar");
    expect(separator).toHaveAttribute("aria-orientation", "vertical");
    expect(separator).toHaveAttribute("aria-valuemin", "320");
    expect(separator).toHaveAttribute("aria-valuenow", "392");
    expect(sidebar?.style.getPropertyValue("--chat-sidebar-width")).toBe("392px");

    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(separator).toHaveAttribute("aria-valuenow", "416");
    expect(sidebar?.style.getPropertyValue("--chat-sidebar-width")).toBe("416px");

    fireEvent.keyDown(separator, { key: "Home" });
    expect(separator).toHaveAttribute("aria-valuenow", "320");
    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(separator).toHaveAttribute("aria-valuenow", "320");

    fireEvent.keyDown(separator, { key: "End" });
    expect(separator).toHaveAttribute("aria-valuenow", separator.getAttribute("aria-valuemax"));
    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(separator).toHaveAttribute("aria-valuenow", separator.getAttribute("aria-valuemax"));
  });

  it("does not expose template actions for populated maps", async () => {
    const populatedProject = {
      ...project,
      canvasState: {
        nodes: [
          {
            id: "api",
            name: "API",
            technology: "Node.js",
            description: "",
            reasoning: "",
            category: "backend" as const,
            subtype: "api" as const,
          },
        ],
        edges: [],
      },
    };
    render(
      <ProjectPage
        vault={makeVault({
          getProjectSnapshot: vi.fn().mockResolvedValue({
            project: populatedProject,
            generation: "generation-1",
          }),
        })}
      />
    );

    await screen.findByText("Test Project");
    expect(screen.queryByText("Save as Template")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Save current map as a personal template")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More project actions" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("editor-more-popover")).not.toBeInTheDocument();
  });
});
