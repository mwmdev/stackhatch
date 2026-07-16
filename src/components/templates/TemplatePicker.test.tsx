import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import TemplatePicker from "./TemplatePicker";

const template = {
  id: "template-1",
  name: "API boundary map",
  description: "A checked-in service boundary to reuse.",
  canvasState: JSON.stringify({
    nodes: [
      { id: "api", category: "api" },
      { id: "data", category: "data" },
    ],
    edges: [{ id: "edge-1" }],
  }),
  createdAt: 1_700_000_000_000,
};

describe("TemplatePicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads personal templates and returns the selected saved map", async () => {
    const onSelectTemplate = vi.fn();
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([template]) } as Response)
    ) as unknown as typeof global.fetch;

    render(<TemplatePicker onSelectTemplate={onSelectTemplate} onCancel={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Start from Template" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Curated starters" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your templates" })).toBeInTheDocument();
    const templateButton = await screen.findByRole("button", { name: /API boundary map/ });
    expect(global.fetch).toHaveBeenCalledWith("/api/templates");
    expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining("/api/teams"));
    expect(screen.getByText(/2 nodes, 1 connection/)).toBeInTheDocument();

    fireEvent.click(templateButton);
    expect(onSelectTemplate).toHaveBeenCalledWith(template);
  });

  it("keeps curated starters selectable when there are no personal templates", async () => {
    const onSelectTemplate = vi.fn();
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response)
    ) as unknown as typeof global.fetch;

    render(<TemplatePicker onSelectTemplate={onSelectTemplate} onCancel={vi.fn()} />);

    const curated = screen.getByRole("button", { name: /Web app foundation/ });
    fireEvent.click(curated);

    expect(onSelectTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "curated-web-app", source: "curated" })
    );
    expect(await screen.findByText("No personal templates yet.")).toBeInTheDocument();
    expect(screen.getByText(/Save any architecture map as a template/)).toBeInTheDocument();
  });

  it("keeps curated starters available and retries when personal templates fail to load", async () => {
    let attempts = 0;
    global.fetch = vi.fn(() => {
      attempts += 1;
      return Promise.resolve(
        attempts === 1
          ? ({
              ok: false,
              json: () => Promise.resolve({ error: "Templates unavailable" }),
            } as Response)
          : ({ ok: true, json: () => Promise.resolve([template]) } as Response)
      );
    }) as unknown as typeof global.fetch;

    render(<TemplatePicker onSelectTemplate={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole("button", { name: /Web app foundation/ })).toBeEnabled();
    expect(await screen.findByRole("alert")).toHaveTextContent("Templates unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry templates" }));

    expect(await screen.findByRole("button", { name: /API boundary map/ })).toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it("keeps keyboard focus inside the dialog, closes on Escape, and restores focus", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response)
    ) as unknown as typeof global.fetch;
    const onCancel = vi.fn();
    const invoker = document.createElement("button");
    document.body.appendChild(invoker);
    invoker.focus();

    const { unmount } = render(<TemplatePicker onSelectTemplate={vi.fn()} onCancel={onCancel} />);

    const firstTemplate = screen.getByRole("button", { name: /Web app foundation/ });
    const cancel = await screen.findByRole("button", { name: "Cancel" });
    await waitFor(() => expect(firstTemplate).toHaveFocus());
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(firstTemplate).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();

    unmount();
    expect(invoker).toHaveFocus();
    invoker.remove();
  });
});
