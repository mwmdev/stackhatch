import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import Dashboard from "./DashboardPage";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock next-themes
vi.mock("next-themes", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
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

const mockProjects = [
  {
    id: "p1",
    name: "My App",
    description: "A cool app description that might be quite long",
    createdAt: 1700000000000,
    updatedAt: 1700100000000,
  },
  {
    id: "p2",
    name: "Another Project",
    description: null,
    createdAt: 1700000000000,
    updatedAt: 1700050000000,
  },
];

function mockFetch(
  projects: typeof mockProjects,
  options?: {
    billing?: {
      plan: string;
      billingInterval: string | null;
      status: string | null;
      currentPeriodEnd: number | null;
    };
    role?: string;
  }
) {
  global.fetch = vi.fn((input: RequestInfo | URL, requestOptions?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url === "/api/me") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ role: options?.role ?? "free" }),
      });
    }
    if (url === "/api/billing/subscription" && options?.billing) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(options.billing),
      });
    }
    if (url === "/api/projects") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(projects),
      });
    }
    if (url.startsWith("/api/projects/") && requestOptions?.method === "DELETE") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  }) as unknown as typeof global.fetch;
}

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders project list with name, description, and date", async () => {
    mockFetch(mockProjects);
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("My App")).toBeInTheDocument();
    });

    expect(screen.getByText("A cool app description that might be quite long")).toBeInTheDocument();
    expect(screen.getByText("Another Project")).toBeInTheDocument();
  });

  it("renders repo URL input and start from scratch when no projects", async () => {
    mockFetch([]);
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("https://github.com/owner/repo")).toBeInTheDocument();
    });

    expect(screen.getByText("Start from scratch")).toBeInTheDocument();
    expect(screen.getByText("Analyze")).toBeInTheDocument();
    expect(screen.getAllByText("OR")).toHaveLength(2);
  });

  it("renders the paid billing plan in the usage card", async () => {
    mockFetch([], {
      billing: {
        plan: "pro",
        billingInterval: null,
        status: null,
        currentPeriodEnd: null,
      },
    });
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("Studio")).toBeInTheDocument();
    });

    expect(screen.getByText("0/Unlimited projects used")).toBeInTheDocument();
  });

  it("does not render activation or launch basics sidebar sections", async () => {
    mockFetch([]);
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("Start from scratch")).toBeInTheDocument();
    });

    expect(screen.queryByText("Activation")).not.toBeInTheDocument();
    expect(screen.queryByText("Launch basics")).not.toBeInTheDocument();
  });

  it("creates project from repo URL and navigates", async () => {
    global.fetch = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/projects" && options?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: "new-1", name: "my-repo" }),
        });
      }
      if (url === "/api/me") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ role: "free" }) });
      }
      if (url === "/api/projects") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    }) as unknown as typeof global.fetch;

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("https://github.com/owner/repo")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("https://github.com/owner/repo");
    fireEvent.change(input, { target: { value: "https://github.com/acme/my-repo" } });
    fireEvent.click(screen.getByText("Analyze"));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/project/new-1");
    });
  });

  it("navigates to project page when clicking a project card", async () => {
    mockFetch(mockProjects);
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("My App")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("project-card-p1"));
    expect(mockPush).toHaveBeenCalledWith("/project/p1");
  });

  it("shows delete confirmation modal and deletes project", async () => {
    mockFetch(mockProjects);
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("My App")).toBeInTheDocument();
    });

    // Click delete button
    const deleteBtn = screen.getByLabelText("Delete My App");
    fireEvent.click(deleteBtn);

    // Modal appears
    expect(screen.getByTestId("delete-modal")).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();

    // Confirm delete
    fireEvent.click(screen.getByTestId("confirm-delete"));

    await waitFor(() => {
      expect(screen.queryByText("My App")).not.toBeInTheDocument();
    });

    // Other project still there
    expect(screen.getByText("Another Project")).toBeInTheDocument();
  });

  it("cancels delete when clicking Cancel", async () => {
    mockFetch(mockProjects);
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("My App")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Delete My App"));
    expect(screen.getByTestId("delete-modal")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByTestId("delete-modal")).not.toBeInTheDocument();
    expect(screen.getByText("My App")).toBeInTheDocument();
  });

  it("renders settings link", async () => {
    mockFetch([]);
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("Start from scratch")).toBeInTheDocument();
    });

    const settingsLink = screen.getByLabelText("Settings");
    expect(settingsLink).toHaveAttribute("href", "/settings");
  });

  it("hides admin link for free users", async () => {
    mockFetch([]);
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("Start from scratch")).toBeInTheDocument();
    });

    expect(screen.queryByLabelText("Admin")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
  });

  it("renders admin link for admin users", async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/me") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ role: "admin" }) });
      }
      if (url === "/api/projects") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    }) as unknown as typeof global.fetch;

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByLabelText("Admin")).toHaveAttribute("href", "/admin");
    });
  });

  it("renders theme toggle button", async () => {
    mockFetch([]);
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("Start from scratch")).toBeInTheDocument();
    });

    expect(screen.getByLabelText("Theme: light")).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    mockFetch(mockProjects);
    render(<Dashboard />);
    expect(screen.getByText("Loading projects...")).toBeInTheDocument();
  });
});
