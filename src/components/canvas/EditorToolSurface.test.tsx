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
    displaySettings: DEFAULT_EDITOR_DISPLAY_SETTINGS,
    onDisplaySettingsChange: vi.fn(),
    obscured: false,
    dialogOpen: false,
    ...overrides,
  };

  render(<EditorToolSurface {...props} />);
  return props;
}

describe("EditorToolSurface", () => {
  it("orders the named canvas tools in one responsive rail and dock surface", () => {
    renderSurface();

    const surface = screen.getByTestId("editor-tool-surface");
    expect(surface).toHaveAttribute("data-mobile-placement", "bottom");
    expect(surface).toHaveAttribute("data-desktop-placement", "left");

    const names = Array.from(surface.querySelectorAll("button")).map((button) =>
      button.getAttribute("aria-label")
    );
    expect(names).toEqual([
      "Open chat",
      "Add node",
      "Zoom in",
      "Zoom out",
      "Fit map to view",
      "Editor display settings",
    ]);
  });

  it("keeps every direct tool target at the shared 44px contract", () => {
    renderSurface();

    for (const button of screen.getByTestId("editor-tool-surface").querySelectorAll("button")) {
      expect(button).toHaveClass("h-11", "w-11");
    }
  });

  it("opens dock popovers upward and rail popovers inward", () => {
    renderSurface();

    fireEvent.click(screen.getByRole("button", { name: "Add node" }));
    expect(screen.getByTestId("add-node-dropdown")).toHaveAttribute("data-placement", "responsive");

    fireEvent.click(screen.getByRole("button", { name: "Editor display settings" }));
    expect(screen.getByTestId("editor-display-settings-dropdown")).toHaveAttribute(
      "data-placement",
      "responsive"
    );
  });

  it("marks the phone dock as obscured without unmounting its triggers", () => {
    const { rerender } = render(
      <EditorToolSurface
        chatOpen={false}
        onChatOpenChange={vi.fn()}
        onAddNode={vi.fn()}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onFitView={vi.fn()}
        displaySettings={DEFAULT_EDITOR_DISPLAY_SETTINGS}
        onDisplaySettingsChange={vi.fn()}
        obscured={false}
        dialogOpen={false}
      />
    );

    const surface = screen.getByTestId("editor-tool-surface");
    expect(surface).toHaveAttribute("data-obscured", "false");
    const chatTrigger = screen.getByRole("button", { name: "Open chat" });

    rerender(
      <EditorToolSurface
        chatOpen
        onChatOpenChange={vi.fn()}
        onAddNode={vi.fn()}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onFitView={vi.fn()}
        displaySettings={DEFAULT_EDITOR_DISPLAY_SETTINGS}
        onDisplaySettingsChange={vi.fn()}
        obscured
        dialogOpen={false}
      />
    );

    expect(surface).toHaveAttribute("data-obscured", "true");
    expect(screen.getByRole("button", { name: "Close chat" })).toBe(chatTrigger);
  });

  it("makes the surface inert and hidden from assistive tech while a dialog is open", () => {
    renderSurface({ dialogOpen: true });

    const surface = screen.getByTestId("editor-tool-surface");
    expect(surface).toHaveAttribute("inert");
    expect(surface).toHaveAttribute("aria-hidden", "true");
  });

  it("wires the chat and viewport actions", () => {
    const props = renderSurface();

    fireEvent.click(screen.getByRole("button", { name: "Open chat" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    fireEvent.click(screen.getByRole("button", { name: "Fit map to view" }));

    expect(props.onChatOpenChange).toHaveBeenCalledWith(true);
    expect(props.onZoomIn).toHaveBeenCalledOnce();
    expect(props.onZoomOut).toHaveBeenCalledOnce();
    expect(props.onFitView).toHaveBeenCalledOnce();
  });
});
