import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import Dashboard from "./DashboardPage";

// Mock next/navigation
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
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
    teamName: "Legacy workspace",
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
    role?: string;
    hasAnthropicKey?: boolean;
  }
) {
  global.fetch = vi.fn((input: RequestInfo | URL, requestOptions?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url === "/api/me") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ role: options?.role ?? "user" }),
      });
    }
    if (url === "/api/settings") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ hasAnthropicKey: options?.hasAnthropicKey ?? true }),
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
    window.history.replaceState({}, "", "/app");
    window.sessionStorage.clear();
    delete window.umami;
  });

  it("renders project list with name, description, and date", async () => {
    mockFetch(mockProjects);
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("My App")).toBeInTheDocument();
    });

    expect(screen.getByText("A cool app description that might be quite long")).toBeInTheDocument();
    expect(screen.getByText("Another Project")).toBeInTheDocument();
    expect(screen.queryByText("Legacy workspace")).not.toBeInTheDocument();
  });

  it("renders the four equal starts in the intended order", async () => {
    mockFetch([]);
    const { container } = render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByLabelText("GitHub repository")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Start fresh" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Map repository" })).toBeInTheDocument();
    expect(screen.queryByText("Other ways to start")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Choose a template" })).toHaveAttribute(
      "href",
      "/project/new?mode=template"
    );
    expect(container.querySelector(".start-launchpad")).toBeInTheDocument();
    expect(
      Array.from(container.querySelectorAll(".start-cell h2"), (heading) => heading.textContent)
    ).toEqual(["Start fresh", "Upload requirements", "Map a repo", "Use a template"]);
    expect(screen.getByText("Your maps")).toBeInTheDocument();
    expect(screen.queryByText("Teams")).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalledWith("/api/teams");
  });

  it("shows BYOK setup without blocking blank canvases", async () => {
    mockFetch([], { hasAnthropicKey: false });
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByTestId("byok-setup-prompt")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Start fresh" })).toBeInTheDocument();
    expect(screen.queryByText(/upgrade/i)).not.toBeInTheDocument();
  });

  it("does not render activation or launch basics sidebar sections", async () => {
    mockFetch([]);
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start fresh" })).toBeInTheDocument();
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
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ role: "user" }) });
      }
      if (url === "/api/settings")
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ hasAnthropicKey: true }),
        });
      if (url === "/api/projects") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    }) as unknown as typeof global.fetch;

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByLabelText("GitHub repository")).toBeInTheDocument();
    });

    const input = screen.getByLabelText("GitHub repository");
    fireEvent.change(input, { target: { value: "https://github.com/acme/my-repo" } });
    fireEvent.click(screen.getByText("Map repository"));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/project/new-1");
    });
    expect(window.sessionStorage.getItem("stackhatch:project-start-method")).toBe("repository");
  });

  it("does not auto-create from a copied blank-start URL without its one-time intent", async () => {
    window.history.replaceState({}, "", "/app?start=blank");
    mockFetch([]);

    render(<Dashboard />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/app#start"));
    expect(global.fetch).not.toHaveBeenCalledWith(
      "/api/projects",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("consumes a blank-start intent before creating and cannot create twice", async () => {
    window.history.replaceState({}, "", "/app?start=blank");
    window.sessionStorage.setItem("stackhatch:project-start-method", "blank");
    window.sessionStorage.setItem("stackhatch:blank-auto-create", "1");
    global.fetch = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects" && options?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: "blank-project" }),
        } as Response);
      }
      if (url === "/api/projects") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
      }
      if (url === "/api/me") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ role: "user" }),
        } as Response);
      }
      if (url === "/api/settings") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ hasAnthropicKey: true }),
        } as Response);
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
    }) as unknown as typeof global.fetch;

    render(<Dashboard />);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/project/blank-project"));
    expect(mockReplace).toHaveBeenCalledWith("/app#start");
    expect(window.sessionStorage.getItem("stackhatch:blank-auto-create")).toBeNull();
    expect(window.sessionStorage.getItem("stackhatch:project-start-method")).toBe("blank");
    expect(
      (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([input, options]) => String(input) === "/api/projects" && options?.method === "POST"
      )
    ).toHaveLength(1);
  });

  it("offers an explicit retry when automatic blank creation fails", async () => {
    window.history.replaceState({}, "", "/app?start=blank");
    window.sessionStorage.setItem("stackhatch:project-start-method", "blank");
    window.sessionStorage.setItem("stackhatch:blank-auto-create", "1");
    let postAttempts = 0;
    global.fetch = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects" && options?.method === "POST") {
        postAttempts += 1;
        return Promise.resolve(
          postAttempts === 1
            ? ({
                ok: false,
                json: () => Promise.resolve({ error: "Project service unavailable" }),
              } as Response)
            : ({
                ok: true,
                json: () => Promise.resolve({ id: "retried-project" }),
              } as Response)
        );
      }
      if (url === "/api/projects") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
      }
      if (url === "/api/me") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ role: "user" }),
        } as Response);
      }
      if (url === "/api/settings") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ hasAnthropicKey: true }),
        } as Response);
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
    }) as unknown as typeof global.fetch;

    render(<Dashboard />);

    const retry = await screen.findByRole("button", { name: "Retry creating the blank map" });
    expect(screen.getByRole("alert")).toHaveTextContent("Project service unavailable");
    fireEvent.click(retry);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/project/retried-project"));
    expect(postAttempts).toBe(2);
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
      expect(screen.getByRole("button", { name: "Start fresh" })).toBeInTheDocument();
    });

    const settingsLink = screen.getByLabelText("Settings");
    expect(settingsLink).toHaveAttribute("href", "/settings");
  });

  it("hides admin link for regular users", async () => {
    mockFetch([]);
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start fresh" })).toBeInTheDocument();
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
      expect(screen.getByRole("button", { name: "Start fresh" })).toBeInTheDocument();
    });

    expect(screen.getByLabelText("Theme: light")).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    mockFetch(mockProjects);
    render(<Dashboard />);
    expect(screen.getByText("Loading projects...")).toBeInTheDocument();
  });

  it("prefills a preserved repository and keeps submission explicit", async () => {
    window.history.replaceState({}, "", "/app?repo=acme%2Fapi");
    mockFetch([]);
    render(<Dashboard />);

    const input = await screen.findByLabelText("GitHub repository");
    expect(input).toHaveValue("acme/api");
    expect(global.fetch).not.toHaveBeenCalledWith(
      "/api/projects",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("sends a preserved repository to key setup when the key is missing", async () => {
    window.history.replaceState({}, "", "/app?repo=acme%2Fapi");
    mockFetch([], { hasAnthropicKey: false });
    render(<Dashboard />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        "/settings?setup=anthropic&returnTo=%2Fapp%3Frepo%3Dacme%252Fapi%23start"
      );
    });
  });

  it("records authentication completion without repository context", async () => {
    const track = vi.fn();
    window.umami = { track };
    window.sessionStorage.setItem("stackhatch:auth-pending", "1");
    mockFetch([]);
    render(<Dashboard />);

    await waitFor(() => {
      expect(track).toHaveBeenCalledOnce();
    });
    const builder = track.mock.calls[0][0] as (payload: Record<string, unknown>) => unknown;
    expect(builder({ website: "site-id" })).toEqual({
      website: "site-id",
      url: "/app",
      name: "github_auth_completed",
      data: { location: "dashboard" },
    });
    expect(window.sessionStorage.getItem("stackhatch:auth-pending")).toBeNull();
  });

  it("includes the pending start method when authentication completes", async () => {
    const track = vi.fn();
    window.umami = { track };
    window.sessionStorage.setItem("stackhatch:auth-pending", "1");
    window.sessionStorage.setItem("stackhatch:project-start-method", "requirements");
    mockFetch([]);

    render(<Dashboard />);

    await waitFor(() => expect(track).toHaveBeenCalledOnce());
    const builder = track.mock.calls[0][0] as (payload: Record<string, unknown>) => unknown;
    expect(builder({ website: "site-id" })).toMatchObject({
      name: "github_auth_completed",
      data: { location: "dashboard", start_method: "requirements" },
    });
    expect(window.sessionStorage.getItem("stackhatch:project-start-method")).toBe("requirements");
  });
});
