import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AllMapsPage from "./AllMapsPage";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "authenticated" }),
  signOut: vi.fn(),
}));

const projects = [
  {
    id: "newest",
    name: "Newest map",
    description: "Latest architecture",
    createdAt: 1,
    updatedAt: 30,
  },
  {
    id: "older",
    name: "Older map",
    description: null,
    createdAt: 2,
    updatedAt: 20,
  },
];

function mockFetch({
  projectResponses = [projects],
}: {
  projectResponses?: Array<typeof projects | null | Error>;
} = {}) {
  let projectAttempt = 0;
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/projects" && !init?.method) {
      const response = projectResponses[Math.min(projectAttempt, projectResponses.length - 1)];
      projectAttempt += 1;
      if (response instanceof Error) return Promise.reject(response);
      if (response === null) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(response) } as Response);
    }
    if (url.startsWith("/api/projects/") && init?.method === "DELETE") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
  }) as unknown as typeof global.fetch;
}

describe("AllMapsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    push.mockClear();
  });

  it("renders the owned map response in API order with one New map action", async () => {
    mockFetch();
    render(<AllMapsPage isAdmin={false} />);

    expect(screen.getByText("Loading maps...")).toBeInTheDocument();
    await screen.findByRole("heading", { name: "All Maps" });

    const cards = screen.getAllByTestId(/project-card-/);
    expect(cards.map((card) => card.textContent)).toEqual([
      expect.stringContaining("Newest map"),
      expect.stringContaining("Older map"),
    ]);
    expect(screen.getAllByRole("link", { name: "New map" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "New map" })).toHaveAttribute("href", "/project/new");
    expect(screen.queryByText("Start fresh")).not.toBeInTheDocument();
    expect(screen.queryByText("Upload requirements")).not.toBeInTheDocument();
    expect(screen.queryByText("Map a repo")).not.toBeInTheDocument();
    expect(screen.queryByText("Use a template")).not.toBeInTheDocument();
  });

  it("opens a selected map", async () => {
    mockFetch();
    render(<AllMapsPage isAdmin={false} />);

    fireEvent.click(await screen.findByTestId("project-card-older"));
    expect(push).toHaveBeenCalledWith("/project/older");
  });

  it("shows a recoverable load failure and retries", async () => {
    mockFetch({ projectResponses: [null, projects] });
    render(<AllMapsPage isAdmin={false} />);

    expect(await screen.findByText(/Maps could not be loaded/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Newest map")).toBeInTheDocument();
  });

  it("shows a recoverable network failure", async () => {
    mockFetch({ projectResponses: [new Error("offline")] });
    render(<AllMapsPage isAdmin={false} />);

    expect(await screen.findByText(/Check your connection/)).toBeInTheDocument();
  });

  it("confirms deletion before removing a map", async () => {
    mockFetch();
    render(<AllMapsPage isAdmin={false} />);

    fireEvent.click(await screen.findByRole("button", { name: "Delete Newest map" }));
    expect(screen.getByRole("dialog", { name: "Delete map" })).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByText("Newest map")).not.toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith("/api/projects/newest", { method: "DELETE" });
  });

  it("keeps settings, theme, and admin navigation", async () => {
    mockFetch();
    render(<AllMapsPage isAdmin />);

    await screen.findByText("Newest map");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
    expect(screen.getByRole("button", { name: /theme/i })).toBeInTheDocument();
  });

  it("directs an empty library to the single New map action", async () => {
    mockFetch({ projectResponses: [[]] });
    render(<AllMapsPage isAdmin={false} />);

    expect(await screen.findByText(/No maps yet\./)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "New map" })).toHaveLength(1);
  });
});
