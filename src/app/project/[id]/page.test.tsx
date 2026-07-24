import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent, within } from "@testing-library/react";

// Mock next/navigation
const mockPush = vi.fn();
const mockReplace = vi.fn();
const { mockSignOut } = vi.hoisted(() => ({ mockSignOut: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "test-project-id" }),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
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
              "data-node-subtype": (node as { data?: { subtype?: string } }).data?.subtype ?? "",
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
  signOut: mockSignOut,
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
    onArchitectureStreamStart,
    onArchitectureStreamEnd,
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
    ) => Promise<void> | void;
    onArchitectureStreamStart?: () => Promise<void>;
    onArchitectureStreamEnd?: (outcome: "completed" | "ambiguous") => Promise<void> | void;
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
        onClick={async () => {
          let outcome: "completed" | "ambiguous" = "ambiguous";
          try {
            await onArchitectureStreamStart?.();
            await onArchitecture?.(
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
            outcome = "completed";
          } catch {
            // ChatSidebar reports the stream error after reconciling the project.
          } finally {
            await onArchitectureStreamEnd?.(outcome);
          }
        }}
      >
        Mock scan replacement
      </button>
      <button
        type="button"
        onClick={async () => {
          await onArchitectureStreamStart?.();
          await onArchitectureStreamEnd?.("ambiguous");
        }}
      >
        Mock dropped architecture stream
      </button>
      <button
        type="button"
        onClick={async () => {
          try {
            await onArchitectureStreamStart?.();
          } catch {
            // The editor rejected the cross-start.
          }
        }}
      >
        Mock start architecture stream
      </button>
      <button type="button" onClick={() => onArchitectureStreamEnd?.("completed")}>
        Mock finish architecture stream
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
    node: { id?: string; name?: string; noteColor?: string } | null;
    open?: boolean;
    onSuggestAlternatives?: () => void;
    alternatives?: unknown[];
  }) => (
    <div
      data-testid="node-detail-panel"
      data-has-node={String(!!node)}
      data-open={String(!!open)}
      data-node-id={node?.id ?? ""}
      data-note-color={node?.noteColor ?? ""}
      data-can-suggest-alternatives={String(!!onSuggestAlternatives)}
      data-alternative-count={String(alternatives?.length ?? 0)}
    >
      Detail Panel {node?.name ?? ""}
    </div>
  ),
}));

vi.mock("@/components/canvas/AddNodeDropdown", () => ({
  default: ({
    onAddNode,
    disabled,
  }: {
    onAddNode: (cat: string, sub: string) => void;
    disabled?: boolean;
  }) => (
    <button
      data-testid="add-node-button"
      disabled={disabled}
      onClick={() => onAddNode("data", "sql-db")}
    >
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
  buildProjectStartChooserPath: (returnTo?: string | null) =>
    returnTo ? `/project/new?returnTo=${encodeURIComponent(returnTo)}` : "/project/new",
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

const projectWithNoteNode = {
  ...emptyProject,
  canvasState: {
    nodes: [
      {
        id: "decision-note",
        category: "note",
        subtype: "note",
        name: "Boundary decision",
        technology: "",
        description: "Keep this boundary explicit.",
        reasoning: "Manually added",
        locked: false,
        noteColor: "mint",
      },
    ],
    edges: [],
  },
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

const projectWithRetiredSubtype = {
  ...emptyProject,
  canvasState: {
    nodes: [
      {
        id: "retired-node",
        category: "client",
        subtype: "retired-kiosk",
        name: "Lobby kiosk",
        technology: "Chrome",
        description: "A saved legacy node",
        reasoning: "Imported",
        locked: false,
      },
    ],
    edges: [],
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

// Mock scrollIntoView (jsdom doesn't implement it)
Element.prototype.scrollIntoView = vi.fn();

describe("ProjectPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignOut.mockResolvedValue(undefined);
    window.localStorage.clear();
    window.history.replaceState({}, "", "/project/test-project-id");
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
      expect(screen.getAllByRole("main")).toHaveLength(1);
      expect(screen.getByRole("heading", { level: 1, name: "Loading map" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "All Maps" })).toHaveAttribute("href", "/app/maps");
      expect(screen.getByRole("link", { name: "New Map" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Theme: change appearance" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Account" })).toBeInTheDocument();
    });

    it("transitions from loading to loaded", async () => {
      mockFetchProject(emptyProject);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
      });
      expect(screen.getByText("Test Project")).toBeInTheDocument();
    });

    it("records the project open once after a successful load", async () => {
      mockFetchProject(emptyProject);
      render(<ProjectPage />);

      await screen.findByText("Test Project");

      await waitFor(() => {
        const openCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
          ([input, init]) =>
            String(input) === "/api/projects/test-project-id/open" &&
            (init as RequestInit | undefined)?.method === "POST"
        );
        expect(openCalls).toHaveLength(1);
      });
    });

    it("retries a failed project-open mutation once", async () => {
      mockFetchProject(emptyProject);
      const fetchProject = global.fetch;
      let openAttempts = 0;
      global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/projects/test-project-id/open" && init?.method === "POST") {
          openAttempts += 1;
          return Promise.resolve({ ok: openAttempts > 1 } as Response);
        }
        return fetchProject(input, init);
      }) as unknown as typeof global.fetch;

      render(<ProjectPage />);
      await screen.findByText("Test Project");

      await waitFor(() => expect(openAttempts).toBe(2));
    });
  });

  describe("error state", () => {
    it("shows error when project not found", async () => {
      mockFetchNotFound();
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByText("Project not found")).toBeInTheDocument();
      });
      expect(screen.getAllByRole("main")).toHaveLength(1);
      expect(
        screen.getByRole("heading", { level: 1, name: "Map unavailable" })
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "All Maps" })).toHaveAttribute("href", "/app/maps");
      expect(screen.getByRole("link", { name: "New Map" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Theme: change appearance" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Account" })).toBeInTheDocument();
      expect(
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls.some(
          ([input, init]) =>
            String(input).endsWith("/open") && (init as RequestInit | undefined)?.method === "POST"
        )
      ).toBe(false);
    });

    it("shows error on network failure", async () => {
      mockFetchError();
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByText("Failed to load project")).toBeInTheDocument();
      });
    });

    it("re-resolves a marked resume once when the selected project disappears", async () => {
      window.history.replaceState({}, "", "/project/test-project-id?resume=1");
      mockFetchNotFound();

      render(<ProjectPage />);

      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/app?resumeRecovery=1"));
      expect(screen.getByRole("status")).toHaveTextContent("Finding another map");
      expect(screen.getAllByRole("main")).toHaveLength(1);
      expect(
        screen.getByRole("heading", { level: 1, name: "Finding your map" })
      ).toBeInTheDocument();
      expect(screen.queryByText("Project not found")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "All Maps" })).toHaveAttribute("href", "/app/maps");
      expect(screen.getByRole("link", { name: "New Map" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Account" })).toBeInTheDocument();
    });

    it("does not recover a direct visit to a missing project", async () => {
      mockFetchNotFound();

      render(<ProjectPage />);

      expect(await screen.findByText("Project not found")).toBeInTheDocument();
      expect(mockReplace).not.toHaveBeenCalled();
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

  describe("revision-ordered persistence", () => {
    it("does not PATCH the loaded baseline", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);

      await screen.findByTestId("mock-flow-node-n1");
      await act(() => new Promise((resolve) => setTimeout(resolve, 550)));

      const patchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([, options]) => (options as RequestInit | undefined)?.method === "PATCH"
      );
      expect(patchCalls).toHaveLength(0);
    });

    it("drains a pending client revision before normalizing an AI replacement", async () => {
      mockFetchProject(projectWithNodes);
      const baseFetch = global.fetch as ReturnType<typeof vi.fn>;
      const firstPatch = deferred<Response>();
      let patchCount = 0;
      global.fetch = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
        if (options?.method === "PATCH") {
          patchCount += 1;
          if (patchCount === 1) return firstPatch.promise;
          return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
        }
        return baseFetch(input, options);
      }) as unknown as typeof fetch;

      render(<ProjectPage />);
      await screen.findByTestId("mock-flow-node-n1");
      fireEvent.click(screen.getByTestId("add-node-button"));
      await waitFor(() => expect(patchCount).toBe(1));

      fireEvent.click(screen.getByRole("button", { name: "Mock scan replacement" }));
      expect(screen.getByTestId("project-editor-shell")).toHaveAttribute(
        "data-ai-writer-phase",
        "preparing"
      );
      expect(screen.getByTestId("react-flow-canvas")).toHaveAttribute("data-node-count", "3");
      fireEvent.click(screen.getByTestId("add-node-button"));
      expect(screen.getByTestId("react-flow-canvas")).toHaveAttribute("data-node-count", "3");

      firstPatch.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
      await waitFor(() => expect(patchCount).toBe(2));
      await waitFor(() =>
        expect(screen.getByTestId("project-editor-shell")).toHaveAttribute(
          "data-ai-writer-phase",
          "idle"
        )
      );

      const patchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([, options]) => options?.method === "PATCH"
      );
      const firstSnapshot = JSON.parse(
        JSON.parse((patchCalls[0][1] as RequestInit).body as string).canvasState
      );
      const replacementSnapshot = JSON.parse(
        JSON.parse((patchCalls[1][1] as RequestInit).body as string).canvasState
      );
      expect(firstSnapshot.nodes).toHaveLength(3);
      expect(replacementSnapshot.nodes.map((node: { id: string }) => node.id)).toEqual([
        "replacement-api",
      ]);
      expect(replacementSnapshot.positions["replacement-api"]).toEqual(
        expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) })
      );
      expect(replacementSnapshot.alternatives).toEqual({});
    });

    it("uses the post-drain save marker so an ambiguous stream preserves the saved client snapshot", async () => {
      mockFetchProject(projectWithRepoAlternatives);
      const baseFetch = global.fetch as ReturnType<typeof vi.fn>;
      const firstPatch = deferred<Response>();
      let projectGets = 0;
      type SavedSnapshot = {
        nodes: Array<{ id: string }>;
        positions: Record<string, { x: number; y: number }>;
        alternatives: Record<string, unknown[]>;
      };
      const savedSnapshots: SavedSnapshot[] = [];

      global.fetch = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
        const url = String(input);
        if (options?.method === "PATCH") {
          savedSnapshots.push(
            JSON.parse(JSON.parse(options.body as string).canvasState) as SavedSnapshot
          );
          return firstPatch.promise;
        }
        if (url === "/api/projects/test-project-id" && !options?.method) {
          projectGets += 1;
          if (projectGets > 1) {
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  ...projectWithRepoAlternatives,
                  updatedAt: projectWithRepoAlternatives.updatedAt + 1,
                  canvasState: savedSnapshots.at(-1),
                }),
            } as Response);
          }
        }
        return baseFetch(input, options);
      }) as unknown as typeof fetch;

      render(<ProjectPage />);
      await screen.findByTestId("mock-flow-node-n1");
      fireEvent.click(screen.getByTestId("add-node-button"));
      await waitFor(() => expect(savedSnapshots).toHaveLength(1));

      fireEvent.click(screen.getByRole("button", { name: "Mock dropped architecture stream" }));
      expect(screen.getByTestId("project-editor-shell")).toHaveAttribute(
        "data-ai-writer-phase",
        "preparing"
      );

      firstPatch.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ...projectWithRepoAlternatives,
            updatedAt: projectWithRepoAlternatives.updatedAt + 1,
            canvasState: savedSnapshots.at(-1),
          }),
      } as Response);

      await waitFor(() =>
        expect(screen.getByTestId("project-editor-shell")).toHaveAttribute(
          "data-ai-writer-phase",
          "idle"
        )
      );
      const persistedSnapshot = savedSnapshots.at(-1);
      expect(persistedSnapshot).toBeDefined();
      if (!persistedSnapshot) throw new Error("Expected a persisted client snapshot");
      expect(screen.getByTestId("react-flow-canvas")).toHaveAttribute("data-node-count", "3");
      expect(persistedSnapshot.nodes).toHaveLength(3);
      expect(Object.keys(persistedSnapshot.positions)).toHaveLength(3);
      expect(persistedSnapshot.alternatives.n1).toHaveLength(1);
      expect(
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
          ([, options]) => options?.method === "PATCH"
        )
      ).toHaveLength(1);

      fireEvent.click(screen.getByTestId("mock-flow-node-n1"));
      expect(screen.getByTestId("node-detail-panel")).toHaveAttribute(
        "data-alternative-count",
        "1"
      );
    });

    it("adopts and normalizes authoritative state after an ambiguous advanced stream", async () => {
      mockFetchProject(projectWithNodes);
      const baseFetch = global.fetch as ReturnType<typeof vi.fn>;
      let projectGets = 0;
      const authoritative = {
        ...projectWithNodes,
        updatedAt: projectWithNodes.updatedAt + 1,
        canvasState: {
          nodes: [
            {
              ...projectWithNodes.canvasState!.nodes[0],
              id: "authoritative-api",
              name: "Authoritative API",
            },
          ],
          edges: [],
        },
      };
      global.fetch = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
        const url = String(input);
        if (url === "/api/projects/test-project-id" && !options?.method) {
          projectGets += 1;
          if (projectGets > 1) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve(authoritative),
            } as Response);
          }
        }
        return baseFetch(input, options);
      }) as unknown as typeof fetch;

      render(<ProjectPage />);
      await screen.findByTestId("mock-flow-node-n1");
      fireEvent.click(screen.getByRole("button", { name: "Mock dropped architecture stream" }));

      expect(await screen.findByTestId("mock-flow-node-authoritative-api")).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByTestId("project-editor-shell")).toHaveAttribute(
          "data-ai-writer-phase",
          "idle"
        )
      );
      const patchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        ([, options]) => options?.method === "PATCH"
      );
      const normalized = JSON.parse(
        JSON.parse((patchCall?.[1] as RequestInit).body as string).canvasState
      );
      expect(normalized.positions["authoritative-api"]).toEqual(
        expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) })
      );
    });

    it("restores the pre-stream snapshot when ambiguous authoritative state did not advance", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      await screen.findByTestId("mock-flow-node-n1");

      fireEvent.click(screen.getByRole("button", { name: "Mock dropped architecture stream" }));

      await waitFor(() =>
        expect(screen.getByTestId("project-editor-shell")).toHaveAttribute(
          "data-ai-writer-phase",
          "idle"
        )
      );
      expect(screen.getByTestId("react-flow-canvas")).toHaveAttribute("data-node-count", "2");
      expect(
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
          ([, options]) => options?.method === "PATCH"
        )
      ).toHaveLength(0);
    });

    it("keeps the editor blocked after reconciliation fails and retries the decision", async () => {
      mockFetchProject(projectWithNodes);
      const baseFetch = global.fetch as ReturnType<typeof vi.fn>;
      let projectGets = 0;
      const authoritative = {
        ...projectWithNodes,
        updatedAt: projectWithNodes.updatedAt + 1,
        canvasState: {
          nodes: [
            {
              ...projectWithNodes.canvasState!.nodes[0],
              id: "retried-authoritative-api",
              name: "Retried authoritative API",
            },
          ],
          edges: [],
        },
      };
      global.fetch = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
        const url = String(input);
        if (url === "/api/projects/test-project-id" && !options?.method) {
          projectGets += 1;
          if (projectGets === 2) {
            return Promise.resolve({ ok: false, status: 503 } as Response);
          }
          if (projectGets > 2) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve(authoritative),
            } as Response);
          }
        }
        return baseFetch(input, options);
      }) as unknown as typeof fetch;

      render(<ProjectPage />);
      await screen.findByTestId("mock-flow-node-n1");
      fireEvent.click(screen.getByRole("button", { name: "Mock dropped architecture stream" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Save status unknown");
      expect(screen.getByTestId("project-editor-shell")).toHaveAttribute(
        "data-ai-writer-phase",
        "reconciliation-failed"
      );
      expect(screen.getByTestId("project-editor-shell")).toHaveAttribute(
        "data-mutation-blocked",
        "true"
      );
      expect(screen.getByTestId("add-node-button")).toBeDisabled();
      const signOut = screen.getByRole("button", { name: "Sign out", hidden: true });
      expect(signOut).toHaveAttribute("aria-disabled", "true");
      expect(signOut).toHaveAccessibleDescription(
        "Architecture save status is unknown; retry reconciliation"
      );
      fireEvent.click(signOut);
      expect(mockSignOut).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Mock start architecture stream" }));
      expect(screen.getByTestId("project-editor-shell")).toHaveAttribute(
        "data-ai-writer-phase",
        "reconciliation-failed"
      );

      fireEvent.click(screen.getByRole("button", { name: "Retry reconciliation" }));

      expect(
        await screen.findByTestId("mock-flow-node-retried-authoritative-api")
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByTestId("project-editor-shell")).toHaveAttribute(
          "data-ai-writer-phase",
          "idle"
        )
      );
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByTestId("add-node-button")).not.toBeDisabled();
      expect(signOut).not.toHaveAttribute("aria-disabled");
    });

    it("restores the visible pre-stream canvas when replacement normalization fails", async () => {
      mockFetchProject(projectWithNodes);
      const baseFetch = global.fetch as ReturnType<typeof vi.fn>;
      global.fetch = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
        if (options?.method === "PATCH") {
          return Promise.resolve({ ok: false, status: 500 } as Response);
        }
        return baseFetch(input, options);
      }) as unknown as typeof fetch;

      render(<ProjectPage />);
      await screen.findByTestId("mock-flow-node-n1");
      fireEvent.click(screen.getByRole("button", { name: "Mock scan replacement" }));

      await waitFor(() =>
        expect(screen.getByTestId("project-editor-shell")).toHaveAttribute(
          "data-ai-writer-phase",
          "idle"
        )
      );
      expect(screen.getByTestId("mock-flow-node-n1")).toBeInTheDocument();
      expect(screen.getByTestId("mock-flow-node-n2")).toBeInTheDocument();
      expect(screen.queryByTestId("mock-flow-node-replacement-api")).not.toBeInTheDocument();
      expect(screen.getByTestId("react-flow-canvas")).toHaveAttribute("data-node-count", "2");
    });
  });

  describe("safe editor sign-out", () => {
    it("signs out a clean editor without issuing a canvas PATCH", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      await screen.findByTestId("mock-flow-node-n1");

      fireEvent.click(screen.getByRole("button", { name: "Sign out", hidden: true }));

      await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ redirectTo: "/" }));
      expect(
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
          ([, options]) => options?.method === "PATCH"
        )
      ).toHaveLength(0);
      expect(screen.getByTestId("project-editor-shell")).toHaveAttribute(
        "data-mutation-blocked",
        "true"
      );
    });

    it("flushes the latest immutable snapshot before signing out and blocks later edits", async () => {
      mockFetchProject(projectWithNodes);
      const baseFetch = global.fetch as ReturnType<typeof vi.fn>;
      const save = deferred<Response>();
      const sequence: string[] = [];
      global.fetch = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
        if (options?.method === "PATCH") {
          sequence.push("save");
          return save.promise;
        }
        return baseFetch(input, options);
      }) as unknown as typeof fetch;
      mockSignOut.mockImplementation(async () => {
        sequence.push("sign-out");
      });

      render(<ProjectPage />);
      await screen.findByTestId("mock-flow-node-n1");
      fireEvent.click(screen.getByTestId("add-node-button"));
      fireEvent.click(screen.getByRole("button", { name: "Sign out", hidden: true }));

      await waitFor(() => expect(sequence).toEqual(["save"]));
      expect(screen.getByTestId("project-editor-shell")).toHaveAttribute(
        "data-mutation-blocked",
        "true"
      );
      expect(screen.getByTestId("add-node-button")).toBeDisabled();
      fireEvent.click(screen.getByTestId("add-node-button"));
      expect(screen.getByTestId("react-flow-canvas")).toHaveAttribute("data-node-count", "3");

      save.resolve({ ok: true } as Response);
      await waitFor(() => expect(sequence).toEqual(["save", "sign-out"]));

      const patchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        ([, options]) => options?.method === "PATCH"
      );
      const snapshot = JSON.parse(
        JSON.parse((patchCall?.[1] as RequestInit).body as string).canvasState
      );
      expect(snapshot.nodes).toHaveLength(3);
    });

    it("keeps a failed save retryable and does not call Auth.js early", async () => {
      mockFetchProject(projectWithNodes);
      const baseFetch = global.fetch as ReturnType<typeof vi.fn>;
      let patchCount = 0;
      global.fetch = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
        if (options?.method === "PATCH") {
          patchCount += 1;
          return Promise.resolve(
            patchCount === 1 ? ({ ok: false, status: 500 } as Response) : ({ ok: true } as Response)
          );
        }
        return baseFetch(input, options);
      }) as unknown as typeof fetch;

      render(<ProjectPage />);
      await screen.findByTestId("mock-flow-node-n1");
      fireEvent.click(screen.getByTestId("add-node-button"));
      fireEvent.click(screen.getByRole("button", { name: "Sign out", hidden: true }));

      expect(
        await screen.findByText("We couldn’t save your changes. You’re still signed in. Try again.")
      ).toBeInTheDocument();
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(screen.getByTestId("project-editor-shell")).toHaveAttribute(
        "data-mutation-blocked",
        "false"
      );

      fireEvent.click(screen.getByRole("button", { name: "Sign out", hidden: true }));
      await waitFor(() => expect(mockSignOut).toHaveBeenCalledOnce());
      const patchBodies = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
        .filter(([, options]) => options?.method === "PATCH")
        .map(([, options]) => (options as RequestInit).body);
      expect(patchBodies).toHaveLength(2);
      expect(patchBodies[1]).toBe(patchBodies[0]);
    });

    it("keeps an expired-session snapshot frozen for same-tab retry", async () => {
      mockFetchProject(projectWithNodes);
      const baseFetch = global.fetch as ReturnType<typeof vi.fn>;
      let patchCount = 0;
      global.fetch = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
        if (options?.method === "PATCH") {
          patchCount += 1;
          return Promise.resolve(
            patchCount === 1 ? ({ ok: false, status: 401 } as Response) : ({ ok: true } as Response)
          );
        }
        return baseFetch(input, options);
      }) as unknown as typeof fetch;

      render(<ProjectPage />);
      await screen.findByTestId("mock-flow-node-n1");
      fireEvent.click(screen.getByTestId("add-node-button"));
      fireEvent.click(screen.getByRole("button", { name: "Sign out", hidden: true }));

      expect(
        await screen.findByText(
          "Your session expired before changes could be saved. Keep this tab open."
        )
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Sign in in a new tab", hidden: true })
      ).toHaveAttribute("href", "/api/auth/signin?callbackUrl=%2Fproject%2Ftest-project-id");
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(screen.getByTestId("add-node-button")).toBeDisabled();

      fireEvent.click(screen.getByRole("button", { name: "Sign out", hidden: true }));
      await waitFor(() => expect(mockSignOut).toHaveBeenCalledOnce());
      const patchBodies = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
        .filter(([, options]) => options?.method === "PATCH")
        .map(([, options]) => (options as RequestInit).body);
      expect(patchBodies[1]).toBe(patchBodies[0]);
    });

    it("restores editing after a detectable Auth.js rejection", async () => {
      mockFetchProject(projectWithNodes);
      mockSignOut.mockRejectedValueOnce(new Error("auth unavailable"));
      render(<ProjectPage />);
      await screen.findByTestId("mock-flow-node-n1");

      fireEvent.click(screen.getByRole("button", { name: "Sign out", hidden: true }));

      expect(
        await screen.findByText("We couldn’t sign you out. You’re still signed in. Try again.")
      ).toBeInTheDocument();
      expect(screen.getByTestId("project-editor-shell")).toHaveAttribute(
        "data-mutation-blocked",
        "false"
      );
      expect(screen.getByTestId("add-node-button")).not.toBeDisabled();
    });

    it("keeps Account focusable but blocks sign-out and mutation during an AI stream", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      await screen.findByTestId("mock-flow-node-n1");

      fireEvent.click(screen.getByRole("button", { name: "Mock start architecture stream" }));
      await waitFor(() =>
        expect(screen.getByTestId("project-editor-shell")).toHaveAttribute(
          "data-ai-writer-phase",
          "streaming"
        )
      );

      const signOut = screen.getByRole("button", { name: "Sign out", hidden: true });
      expect(signOut).not.toBeDisabled();
      expect(signOut).toHaveAttribute("aria-disabled", "true");
      expect(signOut).toHaveAccessibleDescription("Architecture update in progress");
      fireEvent.click(signOut);
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(screen.getByTestId("add-node-button")).toBeDisabled();

      fireEvent.click(screen.getByRole("button", { name: "Mock finish architecture stream" }));
      await waitFor(() => expect(signOut).not.toHaveAttribute("aria-disabled"));
      expect(screen.getByTestId("add-node-button")).not.toBeDisabled();
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
        expect(screen.getByLabelText("Theme: change appearance")).toBeInTheDocument();
      });
    });

    it("keeps display settings in the canvas tool surface and theme in the project bar", async () => {
      mockFetchProject(emptyProject);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByLabelText("Editor display settings")).toBeInTheDocument();
      });

      expect(screen.getByTestId("editor-tool-surface")).toContainElement(
        screen.getByLabelText("Editor display settings")
      );
      expect(screen.getByTestId("editor-project-bar")).toContainElement(
        screen.getByLabelText("Theme: change appearance")
      );
    });

    it("encodes the compact and wide action matrix without duplicating compact direct controls", async () => {
      mockFetchProject(projectWithRepo);
      render(<ProjectPage />);
      const bar = await screen.findByTestId("editor-project-bar");
      const morePanel = screen.getByTestId("editor-more-popover");

      expect(within(bar).getByRole("link", { name: "All maps" })).toBeInTheDocument();
      expect(within(bar).getByRole("button", { name: "Export map" })).toBeInTheDocument();
      expect(within(bar).getByRole("button", { name: "More project actions" })).toBeInTheDocument();
      expect(within(bar).getByRole("button", { name: "Account" })).toBeInTheDocument();
      expect(screen.getByTestId("wide-new-map").closest("[data-editor-action-group]")).toHaveClass(
        "hidden",
        "sm:block"
      );
      expect(
        screen.getByTestId("wide-rescan-button").closest("[data-editor-action-group]")
      ).toHaveClass("hidden", "sm:block");
      expect(screen.getByTestId("compact-rescan-button")).toHaveClass("sm:hidden");
      expect(within(morePanel).getByRole("link", { name: "New Map", hidden: true })).toHaveClass(
        "sm:hidden"
      );
      expect(
        within(morePanel).getByRole("button", {
          name: "Theme: Light. Change appearance",
          hidden: true,
        }).parentElement
      ).toHaveClass("sm:hidden");
      expect(
        within(morePanel).getByRole("button", {
          name: "Generate PRD from architecture",
          hidden: true,
        })
      ).toBeInTheDocument();
      expect(
        within(morePanel).getByRole("button", { name: "Save as Template", hidden: true })
      ).toBeInTheDocument();
    });

    it("keeps compact More useful on an empty standalone map", async () => {
      mockFetchProject(emptyProject);
      render(<ProjectPage />);
      await screen.findByRole("heading", { name: emptyProject.name });
      const morePanel = screen.getByTestId("editor-more-popover");

      expect(screen.getByRole("button", { name: "More project actions" })).toBeInTheDocument();
      expect(
        within(morePanel).getByRole("link", { name: "New Map", hidden: true })
      ).toBeInTheDocument();
      expect(
        within(morePanel).getByRole("button", {
          name: "Theme: Light. Change appearance",
          hidden: true,
        })
      ).toBeInTheDocument();
      expect(
        within(morePanel).queryByRole("button", { name: /Generate PRD/i, hidden: true })
      ).toBeNull();
      expect(
        within(morePanel).queryByRole("button", { name: "Save as Template", hidden: true })
      ).toBeNull();
      expect(screen.queryByRole("button", { name: "Export map" })).toBeNull();
    });

    it("keeps the editor shell free of decorative illustrations", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);

      await screen.findByTestId("react-flow-canvas");
      const shell = screen.getByTestId("project-editor-shell");
      expect(shell.querySelector('[data-stack-illustration="true"]')).not.toBeInTheDocument();
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

    it("toggles chat from the responsive canvas tool surface", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByLabelText("Open chat")).toBeInTheDocument();
      });
      expect(screen.getByTestId("chat-sidebar")).toHaveAttribute("data-open", "false");

      fireEvent.click(screen.getByLabelText("Open chat"));
      const hideToggle = screen.getByLabelText("Close chat");
      expect(screen.getByTestId("chat-sidebar")).toHaveAttribute("data-open", "true");
      expect(screen.getByTestId("editor-tool-surface")).toHaveAttribute("data-obscured", "true");

      fireEvent.click(screen.getByRole("button", { name: "Mock Chat Toggle" }));
      expect(screen.getByLabelText("Open chat")).toBe(hideToggle);
      expect(screen.getByTestId("chat-sidebar")).toHaveAttribute("data-open", "false");
    });

    it("keeps the chat trigger mounted while the mobile dock yields", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByLabelText("Open chat")).toBeInTheDocument();
      });

      const chatToggle = screen.getByLabelText("Open chat");

      fireEvent.click(chatToggle);
      expect(screen.getByLabelText("Close chat")).toBe(chatToggle);
      expect(screen.getByTestId("editor-tool-surface")).toHaveAttribute("data-obscured", "true");
    });

    it("uses the full viewport height contract", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByTestId("project-editor-shell")).toBeInTheDocument();
      });

      expect(screen.getByTestId("project-editor-shell")).toHaveClass("project-editor-shell");
      expect(screen.getByTestId("project-editor-shell")).toHaveAttribute(
        "data-height-contract",
        "viewport"
      );
    });

    it("does not render the removed Re-layout button when nodes exist", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByTestId("react-flow-canvas")).toBeInTheDocument();
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

      const rescanButton = screen.getByTestId("wide-rescan-button");
      expect(rescanButton).toHaveAttribute("title", "Re-scan: https://github.com/example/repo");
      expect(rescanButton.querySelector("svg")).toBeInTheDocument();
      expect(screen.getByRole("tooltip", { name: "Re-scan repository" })).toBeInTheDocument();

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
      const rescanButton = await screen.findByTestId("wide-rescan-button");

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

    it("does not expose the removed private Notes surface", async () => {
      mockFetchProject(emptyProject);
      render(<ProjectPage />);

      await screen.findByRole("heading", { name: emptyProject.name });

      expect(screen.queryByRole("button", { name: "Notes" })).not.toBeInTheDocument();
      expect(screen.queryByText("No notes yet.")).not.toBeInTheDocument();
      expect(
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls.some(([input]) =>
          String(input).includes("/notes")
        )
      ).toBe(false);
    });

    it("saves any non-empty map as a personal template", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);

      await screen.findByRole("button", { name: "More project actions" });
      fireEvent.click(screen.getByRole("button", { name: "More project actions" }));
      const saveButton = screen.getByRole("button", {
        name: "Save as Template",
        hidden: true,
      });
      expect(saveButton).toHaveAttribute("title", "Save current map as a personal template");
      fireEvent.click(saveButton);

      expect(screen.getByRole("dialog", { name: "Save as Template" })).toBeInTheDocument();
      await waitFor(() => expect(screen.getByLabelText(/Template Name/)).toHaveFocus());
      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("dialog", { name: "Save as Template" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "More project actions" })).toHaveFocus();

      fireEvent.click(screen.getByRole("button", { name: "More project actions" }));
      fireEvent.click(screen.getByRole("button", { name: "Save as Template", hidden: true }));
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

    it("shows an All Maps link", async () => {
      mockFetchProject(emptyProject);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByText("Test Project")).toBeInTheDocument();
      });

      const allMapsLink = screen.getByRole("link", { name: "All maps" });
      expect(allMapsLink).toHaveAttribute("href", "/app/maps");
      expect(allMapsLink).not.toHaveTextContent("All Maps");
    });

    it("shows the wide New Map action after project identity", async () => {
      mockFetchProject(emptyProject);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByText("Test Project")).toBeInTheDocument();
      });

      const newProjectLink = screen.getByTestId("wide-new-map");
      const projectTitle = screen.getByText("Test Project");
      expect(newProjectLink).toHaveAttribute(
        "href",
        "/project/new?returnTo=%2Fproject%2Ftest-project-id"
      );
      expect(newProjectLink).toHaveAttribute("title", "New Map");
      expect(newProjectLink.querySelector(".lucide-folder-plus")).toBeInTheDocument();
      expect(
        Boolean(
          projectTitle.compareDocumentPosition(newProjectLink) & Node.DOCUMENT_POSITION_FOLLOWING
        )
      ).toBe(true);
    });

    it("consumes the one-time resume marker after a successful load without changing open POST behavior", async () => {
      window.history.replaceState({}, "", "/project/test-project-id?resume=1");
      mockFetchProject(emptyProject);

      render(<ProjectPage />);

      await screen.findByText("Test Project");
      expect(window.location.pathname + window.location.search).toBe("/project/test-project-id");
      await waitFor(() => {
        const openCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
          ([input, init]) =>
            String(input) === "/api/projects/test-project-id/open" &&
            (init as RequestInit | undefined)?.method === "POST"
        );
        expect(openCalls).toHaveLength(1);
      });
    });

    it("shows the complete PRD export action for every user in More actions", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByTestId("react-flow-canvas")).toHaveAttribute("data-node-count", "2");
      });
      fireEvent.click(screen.getByRole("button", { name: "More project actions" }));
      const prdButton = screen.getByRole("button", {
        name: "Generate PRD from architecture",
        hidden: true,
      });
      expect(prdButton.querySelector(".lucide-sparkles")).toBeInTheDocument();
    });

    it("announces PRD progress and failure after the transient More menu closes", async () => {
      mockFetchProject(projectWithNodes);
      const baseFetch = global.fetch;
      let resolveExport: ((response: Response) => void) | undefined;
      global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith("/export-prd")) {
          return new Promise<Response>((resolve) => {
            resolveExport = resolve;
          });
        }
        return baseFetch(input, init);
      }) as typeof fetch;

      render(<ProjectPage />);
      await screen.findByTestId("react-flow-canvas");
      fireEvent.click(screen.getByRole("button", { name: "More project actions" }));
      const prdAction = screen.getByRole("button", {
        name: "Generate PRD from architecture",
        hidden: true,
      });
      prdAction.focus();
      fireEvent.click(prdAction);

      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "More project actions" })).toHaveFocus();
      expect(screen.getByRole("status")).toHaveTextContent("Generating PRD");

      await act(async () => {
        resolveExport?.(
          new Response(JSON.stringify({ error: "PRD service unavailable" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          })
        );
      });
      await waitFor(() => {
        expect(screen.getByRole("status")).toHaveTextContent("PRD export failed");
      });
    });

    it("keeps the project bar to one compact row and only truncates the project name", async () => {
      mockFetchProject(projectWithRepo);
      render(<ProjectPage />);

      const bar = await screen.findByTestId("editor-project-bar");
      expect(bar).toHaveAttribute("data-layout", "single-row");
      expect(bar).toHaveClass("flex-nowrap");
      expect(screen.getByRole("heading", { name: "Test Project" })).toHaveClass("truncate");
      expect(screen.getByTestId("project-provenance")).not.toHaveClass("truncate");
      expect(screen.getByTestId("project-identity")).toHaveClass("min-w-0");
    });

    it("does not offer repository attachment for a standalone map", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      await screen.findByRole("heading", { name: "Test Project" });

      expect(screen.queryByRole("button", { name: /Map repository/i })).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText("owner/repo")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "More project actions" }));
      expect(screen.queryByRole("menuitem", { name: /repository/i })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "New Map" })).toHaveAttribute(
        "href",
        "/project/new?returnTo=%2Fproject%2Ftest-project-id"
      );
    });

    it("keeps focus out of the canvas while chat opens and restores it after chat closes", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      const chatButton = await screen.findByRole("button", { name: "Open chat" });

      chatButton.focus();
      fireEvent.click(chatButton);
      expect(screen.getByTestId("editor-canvas-focus-target")).not.toHaveFocus();

      fireEvent.click(screen.getByRole("button", { name: "Mock Chat Toggle" }));

      await waitFor(() => {
        expect(screen.getByTestId("editor-canvas-focus-target")).toHaveFocus();
      });
    });

    it("uses a native More disclosure with ordinary navigation and command semantics", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      const moreButton = await screen.findByRole("button", { name: "More project actions" });
      const morePanel = screen.getByTestId("editor-more-popover");

      expect(moreButton).toHaveAttribute("popovertarget", morePanel.id);
      expect(morePanel).toHaveAttribute("popover", "auto");
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
      expect(
        within(morePanel).getByRole("link", { name: "New Map", hidden: true })
      ).toHaveAttribute("href", "/project/new?returnTo=%2Fproject%2Ftest-project-id");
      expect(
        screen.getByRole("button", { name: "Save as Template", hidden: true })
      ).toBeInTheDocument();
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
          hasAnthropicKey: true,
          customSubtypes: {
            client: [{ slug: "kiosk", displayName: "Kiosk", icon: "Box" }],
          },
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

    it("loads a saved retired subtype without rewriting its raw value", async () => {
      mockFetchProject(projectWithRetiredSubtype, { settings: { customSubtypes: {} } });
      render(<ProjectPage />);

      expect(await screen.findByTestId("mock-flow-node-retired-node")).toHaveAttribute(
        "data-node-subtype",
        "retired-kiosk"
      );
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
      expect(screen.getByTestId("editor-tool-surface")).toHaveAttribute("data-obscured", "true");

      fireEvent.click(screen.getByTestId("mock-flow-node-n1"));
      expect(screen.getByTestId("node-detail-panel")).toHaveAttribute("data-open", "false");
      expect(screen.getByTestId("editor-tool-surface")).toHaveAttribute("data-obscured", "false");
    });

    it("opens a Note node with its persisted color", async () => {
      mockFetchProject(projectWithNoteNode);
      render(<ProjectPage />);
      await screen.findByTestId("mock-flow-node-decision-note");

      fireEvent.click(screen.getByTestId("mock-flow-node-decision-note"));

      await waitFor(() => {
        expect(screen.getByTestId("node-detail-panel")).toHaveAttribute("data-open", "true");
      });
      expect(screen.getByTestId("node-detail-panel")).toHaveAttribute("data-note-color", "mint");
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
      expect(screen.getByTestId("editor-tool-surface")).toHaveAttribute("data-obscured", "true");
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

    it("renders named zoom and fit controls in the editor tool surface", async () => {
      mockFetchProject(emptyProject);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
      });
      expect(screen.getByRole("button", { name: "Zoom out" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Fit map to view" })).toBeInTheDocument();
      expect(screen.queryByTestId("react-flow-controls")).not.toBeInTheDocument();
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
