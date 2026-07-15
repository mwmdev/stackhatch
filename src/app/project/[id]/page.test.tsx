import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "test-project-id" }),
  useRouter: () => ({ push: mockPush }),
}));

// Mock reactflow — minimal version for jsdom that avoids text conflicts
vi.mock("reactflow", () => {
  const React = require("react");

  function ReactFlow({
    children,
    nodes,
    edges,
    ...props
  }: {
    children?: React.ReactNode;
    nodes?: unknown[];
    edges?: unknown[];
    [key: string]: unknown;
  }) {
    return React.createElement(
      "div",
      {
        "data-testid": "react-flow-canvas",
        "data-node-count": String((nodes ?? []).length),
        "data-edge-count": String((edges ?? []).length),
        ...(props.className ? { className: props.className } : {}),
        ...(props.style ? { style: props.style } : {}),
        onClick: (event: React.MouseEvent) => {
          if (event.target === event.currentTarget) {
            (props.onPaneClick as (() => void) | undefined)?.();
          }
        },
      },
      React.createElement(
        React.Fragment,
        null,
        ...(nodes ?? []).map((node) =>
          React.createElement(
            "button",
            {
              key: (node as { id: string }).id,
              type: "button",
              "data-testid": `mock-flow-node-${(node as { id: string }).id}`,
              "data-client-custom-subtypes": JSON.stringify(
                (node as { data?: { customSubtypes?: { client?: unknown[] } } }).data
                  ?.customSubtypes?.client ?? []
              ),
              onClick: (event: React.MouseEvent) => {
                event.stopPropagation();
                (
                  props.onNodeClick as
                    | ((event: React.MouseEvent, node: unknown) => void)
                    | undefined
                )?.(event, node);
              },
            },
            (node as { data?: { name?: string } }).data?.name ?? (node as { id: string }).id
          )
        ),
        ...(edges ?? []).map((edge) =>
          React.createElement(
            "button",
            {
              key: (edge as { id: string }).id,
              type: "button",
              "data-testid": `mock-flow-edge-${(edge as { id: string }).id}`,
              "data-connection-type":
                (edge as { data?: { connectionType?: string } }).data?.connectionType ?? "",
              "data-connection-types-enabled": String(
                Boolean(
                  (edge as { data?: { connectionTypesEnabled?: boolean } }).data
                    ?.connectionTypesEnabled
                )
              ),
              onClick: (event: React.MouseEvent) => {
                event.stopPropagation();
                (
                  props.onEdgeClick as
                    | ((event: React.MouseEvent, edge: unknown) => void)
                    | undefined
                )?.(event, edge);
              },
            },
            React.createElement(
              React.Fragment,
              null,
              (edge as { id: string }).id,
              React.createElement(
                "span",
                {
                  className: "stack-edge-label",
                  "data-testid": `mock-flow-edge-label-${(edge as { id: string }).id}`,
                },
                (edge as { data?: { label?: string } }).data?.label ?? ""
              )
            )
          )
        ),
        children
      )
    );
  }

  function Background() {
    return React.createElement("div", {
      "data-testid": "react-flow-background",
    });
  }
  function Controls() {
    return React.createElement("div", {
      "data-testid": "react-flow-controls",
    });
  }

  return {
    __esModule: true,
    default: ReactFlow,
    Background,
    Controls,
    BackgroundVariant: { Dots: "dots", Lines: "lines", Cross: "cross" },
    useNodesState: (initial: unknown[]) => {
      const [nodes, setNodes] = React.useState(initial);
      const onNodesChange = React.useCallback(() => {}, []);
      return [nodes, setNodes, onNodesChange];
    },
    useEdgesState: (initial: unknown[]) => {
      const [edges, setEdges] = React.useState(initial);
      const onEdgesChange = React.useCallback(() => {}, []);
      return [edges, setEdges, onEdgesChange];
    },
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    Handle: () => null,
    Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
  };
});

// Mock CSS import
vi.mock("reactflow/dist/style.css", () => ({}));

// Mock next-themes
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

// Mock next-auth/react
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        name: "Test User",
        email: "test@example.com",
        image: "https://example.com/avatar.jpg",
      },
    },
    status: "authenticated",
  }),
  signOut: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock child components to keep tests focused
vi.mock("@/components/chat/ChatSidebar", () => ({
  default: ({
    projectId,
    defaultOpen,
    open,
    onOpenChange,
    canvasState,
    scanTrigger,
    onArchitecture,
    onScanStateChange,
  }: {
    projectId: string;
    defaultOpen: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    canvasState?: { nodes?: unknown[]; edges?: unknown[] } | null;
    scanTrigger?: number;
    onArchitecture?: (
      architecture: { nodes: unknown[]; edges: unknown[] },
      meta?: {
        source: "scan";
        provenance?: {
          repoUrl: string;
          commitSha: string;
          scannedAt: number;
          analysisStatus: "complete" | "partial";
          analysisWarning: string | null;
        };
      }
    ) => void;
    onScanStateChange?: (scanning: boolean) => void;
  }) => (
    <div
      data-testid="chat-sidebar"
      data-project-id={projectId}
      data-default-open={String(defaultOpen)}
      data-open={String(open)}
      data-canvas-node-count={String(canvasState?.nodes?.length ?? 0)}
      data-canvas-edge-count={String(canvasState?.edges?.length ?? 0)}
      data-scan-trigger={String(scanTrigger ?? 0)}
    >
      Chat Sidebar
      <button type="button" onClick={() => onOpenChange?.(!open)}>
        Mock Chat Toggle
      </button>
      <button
        type="button"
        onClick={() => {
          onScanStateChange?.(true);
          onArchitecture?.(
            {
              nodes: [
                {
                  id: "replacement-api",
                  category: "api",
                  subtype: "rest-api",
                  name: "Replacement API",
                  technology: "Next.js",
                  description: "Fresh scan",
                  reasoning: "Observed",
                  locked: false,
                },
              ],
              edges: [],
            },
            {
              source: "scan",
              provenance: {
                repoUrl: "https://github.com/example/repo",
                commitSha: "replacement-sha",
                scannedAt: 2000000,
                analysisStatus: "partial",
                analysisWarning: "One file was truncated.",
              },
            }
          );
          onScanStateChange?.(false);
        }}
      >
        Mock scan replacement
      </button>
    </div>
  ),
}));

vi.mock("@/components/canvas/NodeDetailPanel", () => ({
  default: ({
    node,
    open,
    onSuggestAlternatives,
    alternatives,
  }: {
    node: { id?: string; name?: string } | null;
    open?: boolean;
    onSuggestAlternatives?: () => void;
    alternatives?: unknown[];
  }) => (
    <div
      data-testid="node-detail-panel"
      data-has-node={String(!!node)}
      data-open={String(!!open)}
      data-node-id={node?.id ?? ""}
      data-can-suggest-alternatives={String(!!onSuggestAlternatives)}
      data-alternative-count={String(alternatives?.length ?? 0)}
    >
      Detail Panel {node?.name ?? ""}
    </div>
  ),
}));

vi.mock("@/components/canvas/AddNodeDropdown", () => ({
  default: ({ onAddNode }: { onAddNode: (cat: string, sub: string) => void }) => (
    <button data-testid="add-node-button" onClick={() => onAddNode("data", "sql-db")}>
      Add Node
    </button>
  ),
}));

vi.mock("@/components/canvas/ConnectionTypeSelector", () => ({
  default: ({
    selectedType,
    onSelect,
  }: {
    selectedType?: string;
    onSelect: (type: string) => void;
  }) => (
    <div data-testid="connection-type-selector" data-selected-type={selectedType ?? ""}>
      <button
        type="button"
        data-testid="mock-select-websocket"
        onClick={() => onSelect("websocket")}
      >
        WebSocket
      </button>
    </div>
  ),
}));

vi.mock("@/components/canvas/StackNode", () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock("@/components/canvas/StackEdge", () => ({
  __esModule: true,
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

vi.mock("@/components/canvas/EdgeLegend", () => ({
  default: () => <div data-testid="edge-legend">Edge Legend</div>,
}));

const { mockTrackEvent, mockConsumePendingProjectStart, mockGetPendingProjectStart } = vi.hoisted(
  () => ({
    mockTrackEvent: vi.fn(),
    mockConsumePendingProjectStart: vi.fn<
      () => null | "blank" | "requirements" | "repository" | "template"
    >(() => null),
    mockGetPendingProjectStart: vi.fn<
      () => null | "blank" | "requirements" | "repository" | "template"
    >(() => null),
  })
);

vi.mock("@/lib/analytics", () => ({ trackEvent: mockTrackEvent }));
vi.mock("@/lib/project-start", () => ({
  consumePendingProjectStart: mockConsumePendingProjectStart,
  getPendingProjectStart: mockGetPendingProjectStart,
}));

import ProjectPage from "./page";

// --- Test data ---

const emptyProject = {
  id: "test-project-id",
  name: "Test Project",
  description: "A test project",
  canvasState: null,
  createdAt: 1000000,
  updatedAt: 1000000,
};

const projectWithNodes = {
  ...emptyProject,
  canvasState: {
    nodes: [
      {
        id: "n1",
        category: "client",
        subtype: "web-app",
        name: "Frontend",
        technology: "React",
        description: "Web frontend",
        reasoning: "User preference",
        locked: false,
      },
      {
        id: "n2",
        category: "data",
        subtype: "sql-db",
        name: "Database",
        technology: "PostgreSQL",
        description: "Primary DB",
        reasoning: "ACID compliance",
        locked: true,
      },
    ],
    edges: [
      {
        id: "e1",
        source: "n1",
        target: "n2",
        connectionType: "http",
        label: "REST",
      },
    ],
  },
};

const projectWithRepo = {
  ...projectWithNodes,
  repoUrl: "https://github.com/example/repo",
};

const projectWithRepoAlternatives = {
  ...projectWithRepo,
  canvasState: {
    ...projectWithRepo.canvasState,
    alternatives: {
      n1: [
        {
          name: "Svelte frontend",
          technology: "Svelte",
          description: "An old suggestion",
          reasoning: "Saved before the repository changed",
          category: "client",
          subtype: "web-app",
        },
      ],
    },
  },
};

const projectWithPositions = {
  ...emptyProject,
  canvasState: {
    ...projectWithNodes.canvasState!,
    positions: {
      n1: { x: 100, y: 50 },
      n2: { x: 100, y: 200 },
    },
  },
};

function mockFetchProject(
  project: unknown,
  options: {
    settings?: Record<string, unknown>;
  } = {}
) {
  global.fetch = vi.fn((input: RequestInfo | URL, _options?: RequestInit) => {
    const url = String(input);
    if (url === "/api/settings") {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            options.settings ?? {
              role: "user",
              isAdmin: false,
              hasAnthropicKey: true,
              model: "claude-sonnet-5",
            }
          ),
      } as Response);
    }
    if (url.includes("/api/projects/test-project-id/messages")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);
    }
    if (url.includes("/api/projects/test-project-id")) {
      if ((_options as RequestInit)?.method === "PATCH") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(project),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);
  }) as unknown as typeof global.fetch;
}

function mockFetchNotFound() {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: false, status: 404 } as Response)
  ) as unknown as typeof global.fetch;
}

function mockFetchError() {
  global.fetch = vi.fn(() =>
    Promise.reject(new Error("Network error"))
  ) as unknown as typeof global.fetch;
}

// Mock scrollIntoView (jsdom doesn't implement it)
Element.prototype.scrollIntoView = vi.fn();

describe("ProjectPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockConsumePendingProjectStart.mockReturnValue(null);
    mockGetPendingProjectStart.mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("loading state", () => {
    it("shows loading indicator on mount", () => {
      mockFetchProject(emptyProject);
      render(<ProjectPage />);
      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });

    it("transitions from loading to loaded", async () => {
      mockFetchProject(emptyProject);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
      });
      expect(screen.getByText("Test Project")).toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("shows error when project not found", async () => {
      mockFetchNotFound();
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByText("Project not found")).toBeInTheDocument();
      });
      expect(screen.getByText("Back to Dashboard")).toBeInTheDocument();
    });

    it("shows error on network failure", async () => {
      mockFetchError();
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByText("Failed to load project")).toBeInTheDocument();
      });
    });
  });

  describe("empty canvas (new project)", () => {
    it("shows empty state message when no canvas", async () => {
      mockFetchProject(emptyProject);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByText("No architecture map yet")).toBeInTheDocument();
      });
      expect(
        screen.getByText("Ask an architecture question or add a component")
      ).toBeInTheDocument();
    });

    it("opens chat sidebar by default for new projects", async () => {
      mockFetchProject(emptyProject);
      render(<ProjectPage />);
      await waitFor(() => {
        const sidebar = screen.getByTestId("chat-sidebar");
        expect(sidebar).toHaveAttribute("data-default-open", "true");
        expect(sidebar).toHaveAttribute("data-open", "true");
      });
    });

    it("renders React Flow canvas even when empty", async () => {
      mockFetchProject(emptyProject);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByTestId("react-flow-canvas")).toBeInTheDocument();
      });
    });

    it("attaches the pending start method to first-map activation once", async () => {
      mockConsumePendingProjectStart.mockReturnValue("repository");
      mockFetchProject(emptyProject);
      render(<ProjectPage />);
      await screen.findByText("No architecture map yet");

      fireEvent.click(screen.getByRole("button", { name: "Mock scan replacement" }));

      await waitFor(() => {
        expect(mockTrackEvent).toHaveBeenCalledWith("first_map_viewed", {
          location: "editor",
          start_method: "repository",
        });
      });
      expect(mockConsumePendingProjectStart).toHaveBeenCalledTimes(1);
    });

    it("tracks a blank map on successful project load", async () => {
      mockGetPendingProjectStart.mockReturnValue("blank");
      mockConsumePendingProjectStart.mockReturnValue("blank");
      mockFetchProject(emptyProject);

      render(<ProjectPage />);
      await screen.findByText("No architecture map yet");

      expect(mockTrackEvent).toHaveBeenCalledWith("first_map_viewed", {
        location: "editor",
        start_method: "blank",
      });
      expect(mockConsumePendingProjectStart).toHaveBeenCalledTimes(1);
    });
  });

  describe("toolbar", () => {
    it("tracks a template map on successful project load", async () => {
      mockGetPendingProjectStart.mockReturnValue("template");
      mockConsumePendingProjectStart.mockReturnValue("template");
      mockFetchProject(projectWithNodes);

      render(<ProjectPage />);
      await screen.findByTestId("mock-flow-node-n1");

      expect(mockTrackEvent).toHaveBeenCalledWith("first_map_viewed", {
        location: "editor",
        start_method: "template",
      });
      expect(mockConsumePendingProjectStart).toHaveBeenCalledTimes(1);
    });

    it("displays project name", async () => {
      mockFetchProject(emptyProject);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByText("Test Project")).toBeInTheDocument();
      });
    });

    it("shows Add Node button", async () => {
      mockFetchProject(emptyProject);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByTestId("add-node-button")).toBeInTheDocument();
      });
    });

    it("shows theme switcher", async () => {
      mockFetchProject(emptyProject);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByLabelText("Theme: light")).toBeInTheDocument();
      });
    });

    it("shows editor display settings before the theme switcher", async () => {
      mockFetchProject(emptyProject);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByLabelText("Editor display settings")).toBeInTheDocument();
      });

      const settingsButton = screen.getByLabelText("Editor display settings");
      const themeButton = screen.getByLabelText("Theme: light");
      expect(settingsButton.querySelector(".lucide-settings")).toBeInTheDocument();
      expect(
        Boolean(
          settingsButton.compareDocumentPosition(themeButton) & Node.DOCUMENT_POSITION_FOLLOWING
        )
      ).toBe(true);
    });

    it("opens editor display settings and persists toggle changes", async () => {
      mockFetchProject(emptyProject);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByLabelText("Editor display settings")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText("Editor display settings"));
      expect(screen.getByTestId("editor-display-settings-dropdown")).toBeInTheDocument();

      const nodeCategoryToggle = screen.getByLabelText("Node category") as HTMLInputElement;
      const edgeLabelsToggle = screen.getByLabelText("Edge labels") as HTMLInputElement;
      expect(nodeCategoryToggle.checked).toBe(true);
      expect(edgeLabelsToggle.checked).toBe(true);

      fireEvent.click(nodeCategoryToggle);
      await waitFor(() => {
        expect(
          JSON.parse(window.localStorage.getItem("stackhatch:editor-display-settings:v1") ?? "{}")
            .showNodeCategory
        ).toBe(false);
      });
    });

    it("loads editor display settings from localStorage", async () => {
      window.localStorage.setItem(
        "stackhatch:editor-display-settings:v1",
        JSON.stringify({ showNodeCategory: false, showEdgeLabels: false })
      );
      mockFetchProject(emptyProject);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByLabelText("Editor display settings")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText("Editor display settings"));
      expect(screen.getByLabelText("Node category")).not.toBeChecked();
      expect(screen.getByLabelText("Edge labels")).not.toBeChecked();
    });

    it("toggles chat sidebar from the toolbar", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByLabelText("Show chat sidebar")).toBeInTheDocument();
      });
      expect(screen.getByTestId("chat-sidebar")).toHaveAttribute("data-open", "false");

      fireEvent.click(screen.getByLabelText("Show chat sidebar"));
      const hideToggle = screen.getByLabelText("Hide chat sidebar");
      expect(hideToggle).toHaveClass("fixed", "left-4");
      expect(hideToggle).toHaveStyle({
        top: "calc(var(--impersonation-banner-height, 0px) + 0.5rem)",
      });
      expect(screen.getByTestId("chat-sidebar")).toHaveAttribute("data-open", "true");

      fireEvent.click(hideToggle);
      expect(screen.getByLabelText("Show chat sidebar")).toBeInTheDocument();
      expect(screen.getByTestId("chat-sidebar")).toHaveAttribute("data-open", "false");
    });

    it("keeps the chat toggle fixed at the same top-left position", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByLabelText("Show chat sidebar")).toBeInTheDocument();
      });

      const chatToggle = screen.getByLabelText("Show chat sidebar");
      const projectTitle = screen.getByText("Test Project");
      expect(chatToggle).toHaveClass("fixed", "left-4");
      expect(chatToggle).toHaveStyle({
        top: "calc(var(--impersonation-banner-height, 0px) + 0.5rem)",
      });
      expect(
        Boolean(chatToggle.compareDocumentPosition(projectTitle) & Node.DOCUMENT_POSITION_FOLLOWING)
      ).toBe(true);

      fireEvent.click(chatToggle);
      expect(screen.getByLabelText("Hide chat sidebar")).toBe(chatToggle);
    });

    it("reserves viewport height for the impersonation banner", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByTestId("project-editor-shell")).toBeInTheDocument();
      });

      expect(screen.getByTestId("project-editor-shell")).toHaveStyle({
        height: "calc(100vh - var(--impersonation-banner-height, 0px))",
      });
    });

    it("does not render the removed Re-layout button when nodes exist", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByTestId("react-flow-controls")).toBeInTheDocument();
      });
      expect(screen.queryByText("Re-layout")).not.toBeInTheDocument();
    });

    it("does not render the removed Re-layout button when no nodes exist", async () => {
      mockFetchProject(emptyProject);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByText("Test Project")).toBeInTheDocument();
      });
      expect(screen.queryByText("Re-layout")).not.toBeInTheDocument();
    });

    it("does not show the node count in the toolbar", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByTestId("react-flow-canvas")).toHaveAttribute("data-node-count", "2");
      });
      expect(screen.queryByText(/2 node/)).not.toBeInTheDocument();
    });

    it("confirms before replacing an existing repository map", async () => {
      mockFetchProject(projectWithRepo);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByTestId("react-flow-canvas")).toHaveAttribute("data-node-count", "2");
      });

      const rescanButton = screen.getByLabelText(
        "Re-scan repository: https://github.com/example/repo"
      );
      expect(rescanButton).toHaveAttribute("title", "Re-scan: https://github.com/example/repo");
      expect(rescanButton.querySelector("svg")).toBeInTheDocument();
      expect(screen.getByText("Re-scan Repo")).toHaveClass("opacity-0");

      fireEvent.click(rescanButton);
      expect(screen.getByRole("dialog", { name: "Replace this architecture map?" })).toBeVisible();
      expect(screen.getByTestId("project-editor-shell")).toHaveAttribute("inert");
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Keep current map" })).toHaveFocus();
      });
      expect(screen.getByTestId("chat-sidebar")).toHaveAttribute("data-scan-trigger", "0");

      fireEvent.click(screen.getByRole("button", { name: "Re-scan repository" }));
      await waitFor(() => {
        expect(screen.getByTestId("chat-sidebar")).toHaveAttribute("data-scan-trigger", "1");
      });
    });

    it("traps focus in the re-scan dialog and restores the invoking control", async () => {
      mockFetchProject(projectWithRepo);
      render(<ProjectPage />);
      const rescanButton = await screen.findByLabelText(
        "Re-scan repository: https://github.com/example/repo"
      );

      fireEvent.click(rescanButton);
      const keepButton = screen.getByRole("button", { name: "Keep current map" });
      const replaceButton = screen.getByRole("button", { name: "Re-scan repository" });
      await waitFor(() => expect(keepButton).toHaveFocus());

      replaceButton.focus();
      fireEvent.keyDown(window, { key: "Tab" });
      expect(screen.getByRole("link", { name: "Report an incorrect map" })).toHaveFocus();

      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(rescanButton).toHaveFocus();
      expect(screen.getByTestId("project-editor-shell")).not.toHaveAttribute("inert");
    });

    it("replaces rather than merges a re-scanned map and updates its provenance", async () => {
      mockFetchProject(projectWithRepo);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByTestId("react-flow-canvas")).toHaveAttribute("data-node-count", "2");
      });

      fireEvent.click(screen.getByRole("button", { name: "Mock scan replacement" }));

      await waitFor(() => {
        expect(screen.getByTestId("react-flow-canvas")).toHaveAttribute("data-node-count", "1");
      });
      expect(screen.getByText(/Scanned replace/)).toBeInTheDocument();
      expect(screen.getByText(/partial analysis/)).toBeInTheDocument();
      expect(
        screen.getByText("Generated architecture overview · not verified source truth")
      ).toBeInTheDocument();
    });

    it("clears stale selection and alternatives when a repository map is replaced", async () => {
      mockFetchProject(projectWithRepoAlternatives);
      render(<ProjectPage />);
      await screen.findByTestId("mock-flow-node-n1");

      fireEvent.click(screen.getByTestId("mock-flow-node-n1"));
      await waitFor(() => {
        expect(screen.getByTestId("node-detail-panel")).toHaveAttribute("data-open", "true");
      });
      expect(screen.getByTestId("node-detail-panel")).toHaveAttribute(
        "data-alternative-count",
        "1"
      );

      fireEvent.click(screen.getByRole("button", { name: "Mock scan replacement" }));

      await waitFor(() => {
        expect(screen.getByTestId("node-detail-panel")).toHaveAttribute("data-has-node", "false");
      });
      expect(screen.getByTestId("node-detail-panel")).toHaveAttribute(
        "data-alternative-count",
        "0"
      );
      await waitFor(() => {
        const patchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
          (call) => (call[1] as RequestInit | undefined)?.method === "PATCH"
        );
        expect(patchCall).toBeTruthy();
        const body = JSON.parse((patchCall?.[1] as RequestInit).body as string);
        expect(JSON.parse(body.canvasState).alternatives).toEqual({});
      });
    });

    it("makes private notes available on a personal project", async () => {
      mockFetchProject(emptyProject);
      render(<ProjectPage />);

      const notesButton = await screen.findByRole("button", { name: "Notes" });
      fireEvent.click(notesButton);

      expect(await screen.findByText("No notes yet.")).toBeInTheDocument();
      expect(global.fetch).toHaveBeenCalledWith("/api/projects/test-project-id/notes");
      expect(
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls.some(([input]) =>
          String(input).includes("/comments")
        )
      ).toBe(false);
    });

    it("saves any non-empty map as a personal template", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);

      const saveButton = await screen.findByRole("button", { name: "Save as Template" });
      expect(saveButton).toHaveAttribute("title", "Save current map as a personal template");
      fireEvent.click(saveButton);

      expect(screen.getByRole("dialog", { name: "Save as Template" })).toBeInTheDocument();
      await waitFor(() => expect(screen.getByLabelText(/Template Name/)).toHaveFocus());
      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("dialog", { name: "Save as Template" })).not.toBeInTheDocument();
      expect(saveButton).toHaveFocus();

      fireEvent.click(saveButton);
      fireEvent.change(screen.getByLabelText(/Template Name/), {
        target: { value: "Service boundary" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save Template" }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/templates",
          expect.objectContaining({ method: "POST" })
        );
      });
      expect(
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls.some(([input]) =>
          String(input).includes("/api/teams")
        )
      ).toBe(false);
    });

    it("shows back to dashboard link", async () => {
      mockFetchProject(emptyProject);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByText("Test Project")).toBeInTheDocument();
      });
    });

    it("shows a new project icon next to the project name", async () => {
      mockFetchProject(emptyProject);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByText("Test Project")).toBeInTheDocument();
      });

      const newProjectLink = screen.getByLabelText("Create new project");
      const projectTitle = screen.getByText("Test Project");
      expect(newProjectLink).toHaveAttribute("href", "/project/new");
      expect(newProjectLink).toHaveAttribute("title", "New project");
      expect(newProjectLink.querySelector(".lucide-folder-plus")).toBeInTheDocument();
      expect(
        Boolean(
          newProjectLink.compareDocumentPosition(projectTitle) & Node.DOCUMENT_POSITION_FOLLOWING
        )
      ).toBe(true);
    });

    it("shows the complete PRD export action for every user", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByTestId("react-flow-canvas")).toHaveAttribute("data-node-count", "2");
      });
      expect(screen.getByText("PRD")).toBeInTheDocument();
      const prdButton = screen.getByLabelText("Generate PRD from architecture");
      expect(prdButton.querySelector(".lucide-sparkles")).toBeInTheDocument();
      expect(prdButton).toHaveAttribute("title", "Generate PRD from architecture");
    });

    it("shows PRD export for admin users", async () => {
      mockFetchProject(projectWithNodes, {
        settings: { role: "admin", isAdmin: true },
      });
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByText("PRD")).toBeInTheDocument();
      });
    });
  });

  describe("canvas with existing state", () => {
    it("loads nodes into React Flow canvas", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      await waitFor(() => {
        const canvas = screen.getByTestId("react-flow-canvas");
        expect(canvas).toHaveAttribute("data-node-count", "2");
      });
    });

    it("applies shared custom subtypes when constructing persisted nodes", async () => {
      mockFetchProject(projectWithNodes, {
        settings: {
          role: "user",
          isAdmin: false,
          hasAnthropicKey: true,
          customSubtypes: '{"client":[{"slug":"kiosk","displayName":"Kiosk","icon":"Box"}]}',
        },
      });
      render(<ProjectPage />);

      await waitFor(() => {
        expect(screen.getByTestId("mock-flow-node-n1")).toHaveAttribute(
          "data-client-custom-subtypes",
          '[{"slug":"kiosk","displayName":"Kiosk","icon":"Box"}]'
        );
      });
    });

    it("loads edges into React Flow canvas", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      await waitFor(() => {
        const canvas = screen.getByTestId("react-flow-canvas");
        expect(canvas).toHaveAttribute("data-edge-count", "1");
      });
    });

    it("uses persisted positions when available", async () => {
      mockFetchProject(projectWithPositions);
      render(<ProjectPage />);
      await waitFor(() => {
        const canvas = screen.getByTestId("react-flow-canvas");
        expect(canvas).toHaveAttribute("data-node-count", "2");
      });
    });

    it("closes chat sidebar by default when canvas has nodes", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      await waitFor(() => {
        const sidebar = screen.getByTestId("chat-sidebar");
        expect(sidebar).toHaveAttribute("data-default-open", "false");
        expect(sidebar).toHaveAttribute("data-open", "false");
      });
    });

    it("opens and closes the node detail drawer when clicking the same node", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByTestId("mock-flow-node-n1")).toBeInTheDocument();
      });

      expect(screen.getByTestId("node-detail-panel")).toHaveAttribute("data-open", "false");

      fireEvent.click(screen.getByTestId("mock-flow-node-n1"));
      expect(screen.getByTestId("node-detail-panel")).toHaveAttribute("data-open", "false");
      expect(screen.getByTestId("node-detail-panel")).toHaveAttribute("data-node-id", "n1");
      await waitFor(() => {
        expect(screen.getByTestId("node-detail-panel")).toHaveAttribute("data-open", "true");
      });

      fireEvent.click(screen.getByTestId("mock-flow-node-n1"));
      expect(screen.getByTestId("node-detail-panel")).toHaveAttribute("data-open", "false");
    });

    it("closes the node detail drawer when clicking the canvas background", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByTestId("mock-flow-node-n1")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("mock-flow-node-n1"));
      await waitFor(() => {
        expect(screen.getByTestId("node-detail-panel")).toHaveAttribute("data-open", "true");
      });

      fireEvent.click(screen.getByTestId("react-flow-canvas"));
      expect(screen.getByTestId("node-detail-panel")).toHaveAttribute("data-open", "false");
    });

    it("enables alternatives for every user", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByTestId("node-detail-panel")).toHaveAttribute(
          "data-can-suggest-alternatives",
          "true"
        );
      });
    });

    it("hides empty state when nodes exist", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByTestId("react-flow-canvas")).toHaveAttribute("data-node-count", "2");
      });
      expect(screen.queryByText("No architecture yet")).not.toBeInTheDocument();
    });

    it("opens connection type editing for every user", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByTestId("mock-flow-edge-e1")).toHaveAttribute(
          "data-connection-types-enabled",
          "true"
        );
      });

      fireEvent.click(screen.getByTestId("mock-flow-edge-e1"));
      expect(screen.getByTestId("connection-type-selector")).toBeInTheDocument();
    });

    it("changes the connection type from an edge click for every user", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByTestId("mock-flow-edge-e1")).toHaveAttribute(
          "data-connection-types-enabled",
          "true"
        );
      });

      fireEvent.click(screen.getByTestId("mock-flow-edge-e1"));
      expect(screen.getByTestId("connection-type-selector")).toHaveAttribute(
        "data-selected-type",
        "http"
      );

      fireEvent.click(screen.getByTestId("mock-select-websocket"));
      await waitFor(() => {
        expect(screen.getByTestId("mock-flow-edge-e1")).toHaveAttribute(
          "data-connection-type",
          "websocket"
        );
      });
    });

    it("does not open connection type editing from an edge label click", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByTestId("mock-flow-edge-e1")).toHaveAttribute(
          "data-connection-types-enabled",
          "true"
        );
      });

      fireEvent.click(screen.getByTestId("mock-flow-edge-label-e1"));

      expect(screen.queryByTestId("connection-type-selector")).not.toBeInTheDocument();
    });
  });

  describe("React Flow components", () => {
    it("renders Background component", async () => {
      mockFetchProject(emptyProject);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByTestId("react-flow-background")).toBeInTheDocument();
      });
    });

    it("renders Controls component", async () => {
      mockFetchProject(emptyProject);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByTestId("react-flow-controls")).toBeInTheDocument();
      });
    });

    it("does not render MiniMap component", async () => {
      mockFetchProject(emptyProject);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByTestId("react-flow-canvas")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("react-flow-minimap")).not.toBeInTheDocument();
    });

    it("renders EdgeLegend for every user", async () => {
      mockFetchProject(emptyProject);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByTestId("react-flow-canvas")).toBeInTheDocument();
      });
      expect(screen.getByTestId("edge-legend")).toBeInTheDocument();
    });
  });

  describe("two-panel layout", () => {
    it("renders chat sidebar and canvas area side by side", async () => {
      mockFetchProject(emptyProject);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByTestId("chat-sidebar")).toBeInTheDocument();
        expect(screen.getByTestId("react-flow-canvas")).toBeInTheDocument();
      });
    });

    it("passes the current React Flow canvas state to chat", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      await waitFor(() => {
        const sidebar = screen.getByTestId("chat-sidebar");
        expect(sidebar).toHaveAttribute("data-canvas-node-count", "2");
        expect(sidebar).toHaveAttribute("data-canvas-edge-count", "1");
      });
    });
  });

  describe("add node", () => {
    it("adds node to React Flow canvas and opens detail panel", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId("react-flow-canvas")).toHaveAttribute("data-node-count", "2");
      });

      // Verify initial state
      expect(screen.getByTestId("react-flow-canvas")).toHaveAttribute("data-node-count", "2");
      expect(screen.getByTestId("node-detail-panel")).toHaveAttribute("data-has-node", "false");

      // Click add node button
      await act(async () => {
        screen.getByTestId("add-node-button").click();
      });

      // Node count should increase
      await waitFor(() => {
        expect(screen.getByTestId("react-flow-canvas")).toHaveAttribute("data-node-count", "3");
      });

      // Detail panel should mount for the new node, then open on the next frame.
      expect(screen.getByTestId("node-detail-panel")).toHaveAttribute("data-has-node", "true");
      await waitFor(() => {
        expect(screen.getByTestId("node-detail-panel")).toHaveAttribute("data-open", "true");
      });
    });
  });
});
