import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import NewProjectPage from "./page";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const template = {
  id: "template-1",
  name: "API boundary map",
  description: "A saved service boundary.",
  canvasState: JSON.stringify({ nodes: [], edges: [] }),
  createdAt: 1_700_000_000_000,
};

describe("NewProjectPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/project/new?templates=1");
    global.fetch = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/templates") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([template]) } as Response);
      }
      if (url === "/api/projects" && options?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: "project-2" }),
        } as Response);
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
    }) as unknown as typeof global.fetch;
  });

  it("auto-opens personal templates and creates without workspace data", async () => {
    render(<NewProjectPage />);

    const savedMap = await screen.findByRole("button", { name: /API boundary map/ });
    expect(screen.getByRole("dialog", { name: "Start from Template" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Workspace")).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining("/api/teams"));

    fireEvent.click(savedMap);
    expect(screen.getByLabelText(/Project Name/)).toHaveValue("API boundary map - Copy");
    fireEvent.click(screen.getByRole("button", { name: "Create Project" }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/project/project-2"));
    const postCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      ([input, options]) => String(input) === "/api/projects" && options?.method === "POST"
    );
    expect(JSON.parse((postCall?.[1] as RequestInit).body as string)).toEqual({
      name: "API boundary map - Copy",
      canvasState: template.canvasState,
    });
  });
});
