import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import NotesPanel from "./NotesPanel";

describe("NotesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is available on every project and loads private notes from the personal endpoint", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: "note-1",
              content: "Keep the queue boundary explicit.",
              nodeId: null,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ]),
      } as Response)
    ) as unknown as typeof global.fetch;

    render(<NotesPanel projectId="project-1" />);

    expect(screen.getByRole("button", { name: "Notes" })).toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/projects/project-1/notes"));

    fireEvent.click(screen.getByRole("button", { name: "Notes" }));

    await screen.findByText("Keep the queue boundary explicit.");
    expect(screen.getByText("Private")).toBeInTheDocument();
    expect(screen.queryByText(/comment/i)).not.toBeInTheDocument();
  });

  it("creates a node note and reports its badge count", async () => {
    const onNoteCountsChange = vi.fn();
    global.fetch = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (options?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "note-2",
              content: "Check retry ownership.",
              nodeId: "api",
              createdAt: Date.now(),
              updatedAt: Date.now(),
            }),
        } as Response);
      }
      if (url === "/api/projects/project-1/notes") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
      }
      return Promise.resolve({ ok: false } as Response);
    }) as unknown as typeof global.fetch;

    render(
      <NotesPanel
        projectId="project-1"
        nodeNames={{ api: "Public API" }}
        activeNodeId="api"
        onNoteCountsChange={onNoteCountsChange}
        openTrigger={1}
      />
    );

    expect(await screen.findByText("No notes on this component yet.")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Note on Public API..."), {
      target: { value: "Check retry ownership." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));

    await screen.findByText("Check retry ownership.");
    const postCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      ([, options]) => (options as RequestInit | undefined)?.method === "POST"
    );
    expect(postCall?.[0]).toBe("/api/projects/project-1/notes");
    expect(JSON.parse((postCall?.[1] as RequestInit).body as string)).toEqual({
      content: "Check retry ownership.",
      nodeId: "api",
    });
    await waitFor(() => expect(onNoteCountsChange).toHaveBeenLastCalledWith({ api: 1 }));
  });

  it("shows a retryable error instead of an empty state when notes fail to load", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response) as unknown as typeof global.fetch;

    render(<NotesPanel projectId="project-1" openTrigger={1} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to load notes.");
    expect(screen.queryByText("No notes yet.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No notes yet.")).toBeInTheDocument();
  });

  it("keeps a note draft and reports a failed save", async () => {
    global.fetch = vi.fn((_input: RequestInfo | URL, options?: RequestInit) => {
      if (options?.method === "POST") return Promise.resolve({ ok: false } as Response);
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
    }) as unknown as typeof global.fetch;

    render(<NotesPanel projectId="project-1" openTrigger={1} />);

    const input = await screen.findByPlaceholderText("Add a note...");
    fireEvent.change(input, { target: { value: "Do not lose this draft." } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to save note. Try again.");
    expect(input).toHaveValue("Do not lose this draft.");
  });
});
