import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { WorkspaceVault } from "@/lib/vault/workspace";
import ProjectPage from "./page";

vi.mock("reactflow", () => {
  const React = require("react");
  const ReactFlow = ({
    children,
    nodes = [],
    edges = [],
  }: {
    children?: React.ReactNode;
    nodes?: unknown[];
    edges?: unknown[];
  }) => (
    <div
      data-testid="react-flow-canvas"
      data-node-count={String(nodes.length)}
      data-edge-count={String(edges.length)}
    >
      {children}
    </div>
  );
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
  default: () => <div data-testid="node-detail-panel" />,
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
  }: {
    onAddNode: (category: "data", subtype: "sql-db") => void;
    onChatOpenChange: (open: boolean) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onAddNode("data", "sql-db")}>
        Add local node
      </button>
      <button type="button" onClick={() => onChatOpenChange(true)}>
        Open assistant
      </button>
    </div>
  ),
}));
vi.mock("@/components/canvas/ExportDropdown", () => ({ default: () => null }));

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
    saveTemplate: vi.fn(),
    subscribeInvalidation: vi.fn(() => () => undefined),
    ...overrides,
  } as unknown as WorkspaceVault;
}

describe("static ProjectPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(screen.queryByTestId("chat-sidebar")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Account" })).not.toBeInTheDocument();
    expect(document.querySelector("[data-stack-illustration]")).not.toBeInTheDocument();
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

  it("mounts the deferred assistant only after an explicit user action", async () => {
    render(<ProjectPage vault={makeVault()} />);
    await screen.findByText("Test Project");
    expect(screen.queryByTestId("chat-sidebar")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open assistant" }));
    expect(screen.getByTestId("chat-sidebar")).toBeInTheDocument();
  });
});
