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
      },
      children
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
  }: {
    projectId: string;
    defaultOpen: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => (
    <div
      data-testid="chat-sidebar"
      data-project-id={projectId}
      data-default-open={String(defaultOpen)}
      data-open={String(open)}
    >
      Chat Sidebar
      <button type="button" onClick={() => onOpenChange?.(!open)}>
        Mock Chat Toggle
      </button>
    </div>
  ),
}));

vi.mock("@/components/canvas/NodeDetailPanel", () => ({
  default: ({
    node,
    onSuggestAlternatives,
  }: {
    node: unknown;
    onSuggestAlternatives?: () => void;
  }) => (
    <div
      data-testid="node-detail-panel"
      data-has-node={String(!!node)}
      data-can-suggest-alternatives={String(!!onSuggestAlternatives)}
    >
      Detail Panel
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
  default: () => <div data-testid="connection-type-selector" />,
}));

vi.mock("@/components/canvas/StackNode", () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock("@/components/canvas/StackEdge", () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock("@/components/canvas/EdgeLegend", () => ({
  default: () => <div data-testid="edge-legend">Edge Legend</div>,
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
    billing?: Record<string, unknown>;
  } = {}
) {
  global.fetch = vi.fn((input: RequestInfo | URL, _options?: RequestInit) => {
    const url = String(input);
    if (url === "/api/settings") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(options.settings ?? { role: "free-user", isAdmin: false }),
      } as Response);
    }
    if (url === "/api/billing/subscription") {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            options.billing ?? {
              plan: "free",
              status: null,
              billingInterval: null,
              currentPeriodEnd: null,
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
        expect(screen.getByText("No architecture yet")).toBeInTheDocument();
      });
      expect(screen.getByText("Start a conversation or add nodes manually")).toBeInTheDocument();
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
  });

  describe("toolbar", () => {
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

    it("toggles chat sidebar from the toolbar", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByLabelText("Show chat sidebar")).toBeInTheDocument();
      });
      expect(screen.getByTestId("chat-sidebar")).toHaveAttribute("data-open", "false");

      fireEvent.click(screen.getByLabelText("Show chat sidebar"));
      const hideToggle = screen.getByLabelText("Hide chat sidebar");
      expect(hideToggle).toHaveClass("fixed", "left-4", "top-2");
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
      expect(chatToggle).toHaveClass("fixed", "left-4", "top-2");
      expect(
        Boolean(chatToggle.compareDocumentPosition(projectTitle) & Node.DOCUMENT_POSITION_FOLLOWING)
      ).toBe(true);

      fireEvent.click(chatToggle);
      expect(screen.getByLabelText("Hide chat sidebar")).toBe(chatToggle);
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

    it("shows back to dashboard link", async () => {
      mockFetchProject(emptyProject);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByText("Test Project")).toBeInTheDocument();
      });
    });

    it("hides PRD export for free users", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByTestId("react-flow-canvas")).toHaveAttribute("data-node-count", "2");
      });
      expect(screen.queryByText("PRD")).not.toBeInTheDocument();
    });

    it("shows PRD export for active pro users", async () => {
      mockFetchProject(projectWithNodes, {
        settings: { role: "paid-user", isAdmin: false },
        billing: { plan: "pro", status: "active" },
      });
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByText("PRD")).toBeInTheDocument();
      });
    });

    it("shows PRD export for admin users", async () => {
      mockFetchProject(projectWithNodes, {
        settings: { role: "admin", isAdmin: true },
        billing: { plan: "free", status: null },
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

    it("hides alternatives for free users", async () => {
      mockFetchProject(projectWithNodes);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByTestId("node-detail-panel")).toHaveAttribute(
          "data-can-suggest-alternatives",
          "false"
        );
      });
    });

    it("enables alternatives for paid users", async () => {
      mockFetchProject(projectWithNodes, {
        settings: { role: "paid-user", isAdmin: false },
      });
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

    it("renders EdgeLegend component", async () => {
      mockFetchProject(emptyProject);
      render(<ProjectPage />);
      await waitFor(() => {
        expect(screen.getByTestId("edge-legend")).toBeInTheDocument();
      });
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

      // Detail panel should open for new node
      expect(screen.getByTestId("node-detail-panel")).toHaveAttribute("data-has-node", "true");
    });
  });
});
