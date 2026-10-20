import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import EditorToolSurface from "./EditorToolSurface";
import { DEFAULT_EDITOR_DISPLAY_SETTINGS } from "./EditorDisplaySettings";

function renderSurface(overrides: Partial<React.ComponentProps<typeof EditorToolSurface>> = {}) {
  const props: React.ComponentProps<typeof EditorToolSurface> = {
    chatOpen: false,
    onChatOpenChange: vi.fn(),
    onAddNode: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onFitView: vi.fn(),
    onAutoLayout: vi.fn(),
    displaySettings: DEFAULT_EDITOR_DISPLAY_SETTINGS,
    onDisplaySettingsChange: vi.fn(),
    dialogOpen: false,
    ...overrides,
  };

  const view = render(<EditorToolSurface {...props} />);
  return { props, ...view };
}

describe("EditorToolSurface", () => {
  it("orders the named canvas tools in one rail", () => {
    renderSurface();

    const names = Array.from(
      screen.getByRole("group", { name: "Canvas tools" }).querySelectorAll("button")
    ).map((button) => button.getAttribute("aria-label"));
    expect(names).toEqual([
      "Open chat",
      "Add node",
      "Zoom in",
      "Zoom out",
      "Fit map to view",
      "Auto-layout",
      "Editor display settings",
    ]);
  });

  it("keeps the chat toggle mounted and pressed while the chat is open", () => {
    const { props, rerender } = renderSurface();
    const chatTrigger = screen.getByRole("button", { name: "Open chat" });
    expect(chatTrigger).toHaveAttribute("aria-pressed", "false");

    rerender(<EditorToolSurface {...props} chatOpen />);

    expect(screen.getByRole("button", { name: "Close chat" })).toBe(chatTrigger);
    expect(chatTrigger).toHaveAttribute("aria-pressed", "true");
  });

  it("makes the surface inert and hidden from assistive tech while a dialog is open", () => {
    renderSurface({ dialogOpen: true });

    const surface = screen.getByTestId("editor-tool-surface");
    expect(surface).toHaveAttribute("inert");
    expect(surface).toHaveAttribute("aria-hidden", "true");
  });

  it("wires the chat and viewport actions", () => {
    const { props } = renderSurface();

    fireEvent.click(screen.getByRole("button", { name: "Open chat" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    fireEvent.click(screen.getByRole("button", { name: "Fit map to view" }));
    fireEvent.click(screen.getByRole("button", { name: "Auto-layout" }));

    expect(props.onChatOpenChange).toHaveBeenCalledWith(true);
    expect(props.onZoomIn).toHaveBeenCalledOnce();
    expect(props.onZoomOut).toHaveBeenCalledOnce();
    expect(props.onFitView).toHaveBeenCalledOnce();
    expect(props.onAutoLayout).toHaveBeenCalledOnce();
  });

  it("blocks adding and auto-layout during canvas mutations", () => {
    const { props } = renderSurface({ mutationBlocked: true });
    expect(screen.getByRole("button", { name: "Auto-layout" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add node" })).toBeDisabled();
    expect(props.onAutoLayout).not.toHaveBeenCalled();
  });
});
