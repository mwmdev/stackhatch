import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import Dashboard from "./page";

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

function mockFetch(projects: typeof mockProjects) {
  global.fetch = vi.fn(
    (input: RequestInfo | URL, options?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/projects") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(projects),
        });
      }
      if (url.startsWith("/api/projects/") && options?.method === "DELETE") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    },
  ) as unknown as typeof global.fetch;
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

    expect(
      screen.getByText("A cool app description that might be quite long"),
    ).toBeInTheDocument();
    expect(screen.getByText("Another Project")).toBeInTheDocument();
  });

  it("renders empty state when no projects exist", async () => {
    mockFetch([]);
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    });

    expect(screen.getByText("No projects yet")).toBeInTheDocument();
    expect(screen.getByText("Create your first project")).toBeInTheDocument();
  });

  it("renders New Project button linking to /project/new", async () => {
    mockFetch([]);
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    });

    const links = screen.getAllByRole("link");
    const newProjectLink = links.find(
      (l) => l.getAttribute("href") === "/project/new",
    );
    expect(newProjectLink).toBeTruthy();
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
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    });

    const settingsLink = screen.getByLabelText("Settings");
    expect(settingsLink).toHaveAttribute("href", "/settings");
  });

  it("renders theme toggle button", async () => {
    mockFetch([]);
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    });

    expect(screen.getByLabelText("Theme: light")).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    mockFetch(mockProjects);
    render(<Dashboard />);
    expect(screen.getByText("Loading projects...")).toBeInTheDocument();
  });
});
