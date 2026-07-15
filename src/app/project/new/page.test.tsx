import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import NewProjectPage from "./page";

const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

const template = {
  id: "template-1",
  name: "API boundary map",
  description: "A saved service boundary.",
  canvasState: JSON.stringify({ nodes: [], edges: [] }),
  createdAt: 1_700_000_000_000,
};

function response(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

describe("NewProjectPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/project/new?mode=template");
    window.sessionStorage.clear();
    delete window.umami;
  });

  it("returns unsupported entry URLs to the four start options", async () => {
    window.history.replaceState({}, "", "/project/new");
    global.fetch = vi.fn();

    render(<NewProjectPage />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/app#start"));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("creates a personal template copy immediately without checking AI settings", async () => {
    global.fetch = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/templates") return Promise.resolve(response([template]));
      if (url === "/api/projects" && options?.method === "POST") {
        return Promise.resolve(response({ id: "project-2" }));
      }
      return Promise.resolve(response({}, false));
    }) as unknown as typeof global.fetch;

    render(<NewProjectPage />);

    const savedMap = await screen.findByRole("button", { name: /API boundary map/ });
    expect(screen.getByRole("dialog", { name: "Start from Template" })).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalledWith("/api/settings");
    fireEvent.click(savedMap);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/project/project-2"));
    const postCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      ([input, options]) => String(input) === "/api/projects" && options?.method === "POST"
    );
    expect(JSON.parse((postCall?.[1] as RequestInit).body as string)).toEqual({
      name: "API boundary map – Copy",
      canvasState: template.canvasState,
    });
    expect(window.sessionStorage.getItem("stackhatch:project-start-method")).toBe("template");
  });

  it("records authentication completion with the non-consuming start method", async () => {
    const track = vi.fn();
    window.umami = { track };
    window.sessionStorage.setItem("stackhatch:auth-pending", "1");
    window.sessionStorage.setItem("stackhatch:project-start-method", "template");
    global.fetch = vi.fn(() => Promise.resolve(response([]))) as unknown as typeof global.fetch;

    render(<NewProjectPage />);

    await waitFor(() => expect(track).toHaveBeenCalledOnce());
    const builder = track.mock.calls[0][0] as (payload: Record<string, unknown>) => unknown;
    expect(builder({ website: "site-id" })).toMatchObject({
      name: "github_auth_completed",
      data: { location: "dashboard", start_method: "template" },
    });
    expect(window.sessionStorage.getItem("stackhatch:auth-pending")).toBeNull();
    expect(window.sessionStorage.getItem("stackhatch:project-start-method")).toBe("template");
  });

  it("keeps the selected template and offers retry after creation fails", async () => {
    let postAttempts = 0;
    global.fetch = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/templates") return Promise.resolve(response([template]));
      if (url === "/api/projects" && options?.method === "POST") {
        postAttempts += 1;
        return Promise.resolve(
          postAttempts === 1
            ? response({ error: "Could not copy template" }, false)
            : response({ id: "retried-template" })
        );
      }
      return Promise.resolve(response({}, false));
    }) as unknown as typeof global.fetch;

    render(<NewProjectPage />);
    fireEvent.click(await screen.findByRole("button", { name: /API boundary map/ }));

    const retry = await screen.findByRole("button", { name: "Retry selected template" });
    expect(screen.getByRole("alert")).toHaveTextContent("Could not copy template");
    fireEvent.click(retry);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/project/retried-template"));
    expect(postAttempts).toBe(2);
  });

  it("requires Anthropic setup for requirements and preserves a safe return path", async () => {
    window.history.replaceState({}, "", "/project/new?mode=requirements");
    global.fetch = vi.fn(() =>
      Promise.resolve(response({ hasAnthropicKey: false }))
    ) as unknown as typeof global.fetch;

    render(<NewProjectPage />);

    const setupLink = await screen.findByRole("link", { name: "Add Anthropic key" });
    expect(setupLink).toHaveAttribute(
      "href",
      "/settings?setup=anthropic&returnTo=%2Fproject%2Fnew%3Fmode%3Drequirements"
    );
    expect(screen.queryByText("Choose .md or .txt file")).not.toBeInTheDocument();
  });

  it("creates from a requirements file using its first heading as the name", async () => {
    window.history.replaceState({}, "", "/project/new?mode=requirements");
    global.fetch = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/settings") {
        return Promise.resolve(response({ hasAnthropicKey: true }));
      }
      if (url === "/api/projects" && options?.method === "POST") {
        return Promise.resolve(response({ id: "requirements-map" }));
      }
      return Promise.resolve(response({}, false));
    }) as unknown as typeof global.fetch;

    render(<NewProjectPage />);

    const input = await screen.findByLabelText("Choose .md or .txt file");
    const file = new File(
      ["# Platform architecture\n\nUsers enter through the web app."],
      "prd.md",
      {
        type: "text/markdown",
      }
    );
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/project/requirements-map"));
    const postCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      ([request, options]) => String(request) === "/api/projects" && options?.method === "POST"
    );
    expect(JSON.parse((postCall?.[1] as RequestInit).body as string)).toEqual({
      name: "Platform architecture",
      description: "# Platform architecture\n\nUsers enter through the web app.",
    });
  });

  it("preloads, validates, and explicitly maps a repository", async () => {
    window.history.replaceState({}, "", "/project/new?mode=repository&repo=acme%2Fapi");
    global.fetch = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/settings") {
        return Promise.resolve(response({ hasAnthropicKey: true }));
      }
      if (url === "/api/projects" && options?.method === "POST") {
        return Promise.resolve(response({ id: "repository-map" }));
      }
      return Promise.resolve(response({}, false));
    }) as unknown as typeof global.fetch;

    render(<NewProjectPage />);

    const repository = await screen.findByLabelText("Public GitHub repository");
    expect(repository).toHaveValue("acme/api");
    expect(global.fetch).not.toHaveBeenCalledWith(
      "/api/projects",
      expect.objectContaining({ method: "POST" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Map repository" }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/project/repository-map"));
    const postCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      ([request, options]) => String(request) === "/api/projects" && options?.method === "POST"
    );
    expect(JSON.parse((postCall?.[1] as RequestInit).body as string)).toEqual({
      name: "api",
      repoUrl: "https://github.com/acme/api",
    });
  });

  it("shows a useful link when no personal templates exist", async () => {
    global.fetch = vi.fn(() => Promise.resolve(response([]))) as unknown as typeof global.fetch;

    render(<NewProjectPage />);

    expect(await screen.findByText("No templates yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Choose another starting point" })).toHaveAttribute(
      "href",
      "/app#start"
    );
  });
});
