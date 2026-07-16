import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { markProjectStart } from "@/lib/project-start";
import ProjectStartWorkspace from "./ProjectStartWorkspace";

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

function renderWorkspace(props: Partial<React.ComponentProps<typeof ProjectStartWorkspace>> = {}) {
  return render(
    <ProjectStartWorkspace initialMode={null} initialRepository="" returnTo={null} {...props} />
  );
}

describe("ProjectStartWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/project/new");
    window.sessionStorage.clear();
    delete window.umami;
  });

  it("offers exactly four concise, keyboard-reachable creation methods", () => {
    global.fetch = vi.fn();

    renderWorkspace();

    expect(screen.getByRole("heading", { name: "Start a new map" })).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /map|requirements|repository|template/i })
    ).toHaveLength(4);
    expect(screen.queryByText(/use this source/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "All Maps" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "All Maps" })).toHaveAttribute("href", "/app/maps");
    expect(screen.queryByRole("link", { name: "Cancel map creation" })).not.toBeInTheDocument();
  });

  it("allows canceling from the chooser when creation started in an existing map", () => {
    global.fetch = vi.fn();

    renderWorkspace({ returnTo: "/project/map-1" });

    expect(screen.getByRole("link", { name: "Cancel map creation" })).toHaveAttribute(
      "href",
      "/project/map-1"
    );
    expect(
      screen.getByRole("link", { name: "Cancel map creation" }).querySelector(".lucide-x")
    ).toBeInTheDocument();
  });

  it("cancels a pending requirements read when returning to the originating map", async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === "/api/settings") {
        return Promise.resolve(response({ hasAnthropicKey: true }));
      }
      return Promise.resolve(response({}, false));
    }) as unknown as typeof global.fetch;
    let deferredReader: FileReader | null = null;
    const readAsText = vi.spyOn(FileReader.prototype, "readAsText").mockImplementation(function (
      this: FileReader
    ) {
      deferredReader = this;
    });

    renderWorkspace({ initialMode: "requirements", returnTo: "/project/map-1" });
    fireEvent.change(await screen.findByLabelText("Choose .md or .txt file"), {
      target: {
        files: [new File(["# Stale map"], "requirements.md", { type: "text/markdown" })],
      },
    });
    const cancel = screen.getByRole("link", { name: "Cancel map creation" });
    cancel.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(cancel);

    expect(deferredReader).not.toBeNull();
    const reader = deferredReader as unknown as FileReader;
    Object.defineProperty(reader, "result", { configurable: true, value: "# Stale map" });
    reader.onload?.(new ProgressEvent("load") as ProgressEvent<FileReader>);
    expect(global.fetch).not.toHaveBeenCalledWith(
      "/api/projects",
      expect.objectContaining({ method: "POST" })
    );
    readAsText.mockRestore();
  });

  it("suppresses pointer and keyboard activation of cancel while creating", async () => {
    let resolveCreate: ((value: Response) => void) | undefined;
    global.fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveCreate = resolve;
        })
    ) as unknown as typeof global.fetch;

    renderWorkspace({ initialMode: "blank", returnTo: "/project/map-1" });
    fireEvent.click(screen.getByRole("button", { name: "Create blank map" }));

    const cancel = screen.getByRole("link", { name: "Cancel map creation" });
    await waitFor(() => expect(cancel).toHaveAttribute("aria-disabled", "true"));
    expect(cancel).toHaveAttribute("tabindex", "-1");
    expect(fireEvent.click(cancel)).toBe(false);
    expect(fireEvent.keyDown(cancel, { key: "Enter" })).toBe(false);
    expect(fireEvent.keyDown(cancel, { key: " " })).toBe(false);
    resolveCreate?.(response({ id: "blank-map" }));
  });

  it("keeps the source chooser available from every non-blank subflow", async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === "/api/settings") {
        return Promise.resolve(response({ hasAnthropicKey: true }));
      }
      if (String(input) === "/api/templates") return Promise.resolve(response([]));
      return Promise.resolve(response({}, false));
    }) as unknown as typeof global.fetch;

    const { rerender } = renderWorkspace({ initialMode: "requirements" });
    expect(screen.getByRole("button", { name: "Choose another source" })).toBeEnabled();

    rerender(
      <ProjectStartWorkspace initialMode="repository" initialRepository="" returnTo={null} />
    );
    expect(screen.getByRole("button", { name: "Choose another source" })).toBeEnabled();

    rerender(<ProjectStartWorkspace initialMode="template" initialRepository="" returnTo={null} />);
    expect(screen.getByRole("button", { name: "Choose another source" })).toBeEnabled();
  });

  it("creates one blank map directly from the chooser gesture", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(response({ id: "blank-map" }))
    ) as unknown as typeof global.fetch;

    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: /Blank map/ }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/project/blank-map"));
    const projectPosts = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([input, options]) => String(input) === "/api/projects" && options?.method === "POST"
    );
    expect(projectPosts).toHaveLength(1);
    expect(JSON.parse((projectPosts[0][1] as RequestInit).body as string)).toEqual({
      name: "Untitled Project",
    });
  });

  it("does not auto-create from a directly loaded blank URL", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(response({ id: "explicit-blank" }))
    ) as unknown as typeof global.fetch;

    renderWorkspace({ initialMode: "blank" });

    expect(screen.getByRole("button", { name: "Create blank map" })).toBeEnabled();
    expect(global.fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Create blank map" }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/project/explicit-blank"));
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("consumes a one-shot blank intent exactly once", async () => {
    markProjectStart("blank");
    global.fetch = vi.fn(() =>
      Promise.resolve(response({ id: "intent-blank" }))
    ) as unknown as typeof global.fetch;

    renderWorkspace({ initialMode: "blank" });

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/project/intent-blank"));
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem("stackhatch:blank-auto-create")).toBeNull();
  });

  it("validates requirements and uses the first Markdown heading as the project name", async () => {
    window.history.replaceState({}, "", "/project/new?mode=requirements");
    global.fetch = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
      if (String(input) === "/api/settings") {
        return Promise.resolve(response({ hasAnthropicKey: true }));
      }
      if (String(input) === "/api/projects" && options?.method === "POST") {
        return Promise.resolve(response({ id: "requirements-map" }));
      }
      return Promise.resolve(response({}, false));
    }) as unknown as typeof global.fetch;

    renderWorkspace({ initialMode: "requirements" });
    const input = await screen.findByLabelText("Choose .md or .txt file");
    fireEvent.change(input, {
      target: { files: [new File(["no"], "requirements.pdf", { type: "application/pdf" })] },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/Markdown/);

    fireEvent.change(input, {
      target: {
        files: [
          new File(
            ["\n## Platform architecture\n\nUsers enter through the web app."],
            "requirements.md",
            { type: "text/markdown" }
          ),
        ],
      },
    });

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/project/requirements-map"));
    const postCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      ([input, options]) => String(input) === "/api/projects" && options?.method === "POST"
    );
    expect(JSON.parse((postCall?.[1] as RequestInit).body as string)).toEqual({
      name: "Platform architecture",
      description: "## Platform architecture\n\nUsers enter through the web app.",
    });
  });

  it("rejects an empty requirements file without creating a project", async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === "/api/settings") {
        return Promise.resolve(response({ hasAnthropicKey: true }));
      }
      return Promise.resolve(response({}, false));
    }) as unknown as typeof global.fetch;

    renderWorkspace({ initialMode: "requirements" });
    fireEvent.change(await screen.findByLabelText("Choose .md or .txt file"), {
      target: { files: [new File(["   \n"], "requirements.md", { type: "text/markdown" })] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(/requirements file is empty/i);
    expect(global.fetch).not.toHaveBeenCalledWith(
      "/api/projects",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("reports an unreadable requirements file without creating a project", async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === "/api/settings") {
        return Promise.resolve(response({ hasAnthropicKey: true }));
      }
      return Promise.resolve(response({}, false));
    }) as unknown as typeof global.fetch;
    const readAsText = vi.spyOn(FileReader.prototype, "readAsText").mockImplementation(function (
      this: FileReader
    ) {
      this.onerror?.(new ProgressEvent("error") as ProgressEvent<FileReader>);
    });

    renderWorkspace({ initialMode: "requirements" });
    fireEvent.change(await screen.findByLabelText("Choose .md or .txt file"), {
      target: {
        files: [new File(["# Map"], "requirements.md", { type: "text/markdown" })],
      },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be read/i);
    expect(global.fetch).not.toHaveBeenCalledWith(
      "/api/projects",
      expect.objectContaining({ method: "POST" })
    );
    readAsText.mockRestore();
  });

  it("ignores a requirements read after choosing another source", async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === "/api/settings") {
        return Promise.resolve(response({ hasAnthropicKey: true }));
      }
      return Promise.resolve(response({}, false));
    }) as unknown as typeof global.fetch;
    let deferredReader: FileReader | null = null;
    const readAsText = vi.spyOn(FileReader.prototype, "readAsText").mockImplementation(function (
      this: FileReader
    ) {
      deferredReader = this;
    });

    renderWorkspace({ initialMode: "requirements" });
    fireEvent.change(await screen.findByLabelText("Choose .md or .txt file"), {
      target: {
        files: [new File(["# Stale map"], "requirements.md", { type: "text/markdown" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Choose another source" }));

    expect(deferredReader).not.toBeNull();
    const reader = deferredReader as unknown as FileReader;
    Object.defineProperty(reader, "result", { configurable: true, value: "# Stale map" });
    reader.onload?.(new ProgressEvent("load") as ProgressEvent<FileReader>);
    expect(global.fetch).not.toHaveBeenCalledWith(
      "/api/projects",
      expect.objectContaining({ method: "POST" })
    );
    readAsText.mockRestore();
  });

  it("preserves repository and project return context through Anthropic setup", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(response({ hasAnthropicKey: false }))
    ) as unknown as typeof global.fetch;

    renderWorkspace({
      initialMode: "repository",
      initialRepository: "acme/api",
      returnTo: "/project/map-1",
    });

    const setupLink = await screen.findByRole("link", { name: "Add Anthropic key" });
    expect(setupLink).toHaveAttribute(
      "href",
      "/settings?setup=anthropic&returnTo=%2Fproject%2Fnew%3Fmode%3Drepository%26repo%3Dacme%252Fapi%26returnTo%3D%252Fproject%252Fmap-1"
    );
    expect(screen.getByRole("link", { name: "Cancel map creation" })).toHaveAttribute(
      "href",
      "/project/map-1"
    );
  });

  it("normalizes and creates a public repository map", async () => {
    global.fetch = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
      if (String(input) === "/api/settings") {
        return Promise.resolve(response({ hasAnthropicKey: true }));
      }
      if (String(input) === "/api/projects" && options?.method === "POST") {
        return Promise.resolve(response({ id: "repository-map" }));
      }
      return Promise.resolve(response({}, false));
    }) as unknown as typeof global.fetch;

    renderWorkspace({ initialMode: "repository", initialRepository: "acme/api" });
    const repository = await screen.findByLabelText("Public GitHub repository");
    expect(repository).toHaveValue("acme/api");
    fireEvent.change(repository, { target: { value: "https://github.com/stackhatch/app" } });
    fireEvent.click(screen.getByRole("button", { name: "Map repository" }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/project/repository-map"));
    const postCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      ([input, options]) => String(input) === "/api/projects" && options?.method === "POST"
    );
    expect(JSON.parse((postCall?.[1] as RequestInit).body as string)).toEqual({
      name: "app",
      repoUrl: "https://github.com/stackhatch/app",
    });
  });

  it("copies a personal template without checking Anthropic settings", async () => {
    global.fetch = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
      if (String(input) === "/api/templates") return Promise.resolve(response([template]));
      if (String(input) === "/api/projects" && options?.method === "POST") {
        return Promise.resolve(response({ id: "template-map" }));
      }
      return Promise.resolve(response({}, false));
    }) as unknown as typeof global.fetch;

    renderWorkspace({ initialMode: "template" });
    fireEvent.click(await screen.findByRole("button", { name: /API boundary map/ }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/project/template-map"));
    expect(global.fetch).not.toHaveBeenCalledWith("/api/settings");
  });

  it("keeps creation errors recoverable without duplicating successful submissions", async () => {
    let attempts = 0;
    global.fetch = vi.fn(() => {
      attempts += 1;
      return Promise.resolve(
        attempts === 1
          ? response({ error: "Project quota reached" }, false)
          : response({ id: "retried-blank" })
      );
    }) as unknown as typeof global.fetch;

    renderWorkspace({ initialMode: "blank" });
    fireEvent.click(screen.getByRole("button", { name: "Create blank map" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Project quota reached");
    fireEvent.click(screen.getByRole("button", { name: "Retry blank map" }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/project/retried-blank"));
    expect(attempts).toBe(2);
  });

  it("records source selection and auth completion at the editor location", async () => {
    const track = vi.fn();
    window.umami = { track };
    window.sessionStorage.setItem("stackhatch:auth-pending", "1");
    window.sessionStorage.setItem("stackhatch:project-start-method", "template");
    global.fetch = vi.fn(() => Promise.resolve(response([]))) as unknown as typeof global.fetch;

    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: /Template/ }));

    await waitFor(() => expect(track).toHaveBeenCalledTimes(2));
    const payloads = track.mock.calls.map(([builder]) =>
      (builder as (payload: Record<string, unknown>) => unknown)({ website: "site-id" })
    );
    expect(payloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "github_auth_completed",
          data: { location: "editor", start_method: "template" },
        }),
        expect.objectContaining({
          name: "project_start_selected",
          data: { location: "editor", start_method: "template" },
        }),
      ])
    );
  });
});
