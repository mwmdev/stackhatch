import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { WorkspaceVault } from "@/lib/vault/workspace";
import TemplatePicker from "./TemplatePicker";

const template = {
  id: "template-1",
  name: "API boundary map",
  description: "A saved service boundary.",
  canvasState: {
    nodes: [
      {
        id: "api",
        category: "api" as const,
        subtype: "rest-api" as const,
        name: "API",
        technology: "",
        description: "",
        reasoning: "",
        locked: false,
      },
    ],
    edges: [],
  },
  revision: 1,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
};

function makeVault(listTemplates = vi.fn().mockResolvedValue([template])) {
  return {
    listTemplates,
    subscribeInvalidation: vi.fn(() => () => undefined),
  } as unknown as WorkspaceVault;
}

describe("TemplatePicker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads personal templates from the browser vault and returns a serializable copy", async () => {
    const onSelectTemplate = vi.fn();
    const fetchSpy = vi.spyOn(global, "fetch");
    render(
      <TemplatePicker vault={makeVault()} onSelectTemplate={onSelectTemplate} onCancel={vi.fn()} />
    );

    const templateButton = await screen.findByRole("button", { name: /API boundary map/ });
    expect(screen.getByText(/1 node, 0 connections/)).toBeInTheDocument();
    fireEvent.click(templateButton);
    expect(onSelectTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "template-1",
        canvasState: JSON.stringify(template.canvasState),
      })
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps curated starters selectable while browser storage is unavailable", async () => {
    const onSelectTemplate = vi.fn();
    const listTemplates = vi
      .fn()
      .mockRejectedValueOnce(new Error("blocked"))
      .mockResolvedValueOnce([template]);
    render(
      <TemplatePicker
        vault={makeVault(listTemplates)}
        onSelectTemplate={onSelectTemplate}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Web app foundation/ }));
    expect(onSelectTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "curated-web-app", source: "curated" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("browser storage");
    fireEvent.click(screen.getByRole("button", { name: "Retry templates" }));
    expect(await screen.findByRole("button", { name: /API boundary map/ })).toBeInTheDocument();
  });

  it("traps keyboard focus, closes on Escape, and restores focus", async () => {
    const onCancel = vi.fn();
    const invoker = document.createElement("button");
    document.body.appendChild(invoker);
    invoker.focus();
    const { unmount } = render(
      <TemplatePicker vault={makeVault()} onSelectTemplate={vi.fn()} onCancel={onCancel} />
    );

    const firstTemplate = screen.getByRole("button", { name: /Web app foundation/ });
    const cancel = await screen.findByRole("button", { name: "Cancel" });
    await waitFor(() => expect(firstTemplate).toHaveFocus());
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
    unmount();
    expect(invoker).toHaveFocus();
    invoker.remove();
  });
});
