import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReactFlowProvider } from "reactflow";
import StackNodeComponent from "./StackNode";
import type { StackNodeData } from "./StackNode";
import {
  DEFAULT_EDITOR_DISPLAY_SETTINGS,
  EditorDisplaySettingsProvider,
} from "./EditorDisplaySettings";

function makeData(overrides: Partial<StackNodeData> = {}): StackNodeData {
  return {
    category: "data",
    subtype: "sql-db",
    name: "PostgreSQL Database",
    technology: "PostgreSQL 16",
    description: "Primary relational database",
    reasoning: "Chosen for strong ACID compliance",
    locked: false,
    ...overrides,
  };
}

// Minimal NodeProps shape for testing
function makeProps(dataOverrides: Partial<StackNodeData> = {}, selected = false) {
  return {
    id: "node-1",
    data: makeData(dataOverrides),
    selected,
    type: "stackNode",
    xPos: 0,
    yPos: 0,
    zIndex: 0,
    isConnectable: true,
    dragging: false,
  } as Parameters<typeof StackNodeComponent>[0];
}

function renderNode(dataOverrides: Partial<StackNodeData> = {}, selected = false) {
  return render(
    <ReactFlowProvider>
      <StackNodeComponent {...makeProps(dataOverrides, selected)} />
    </ReactFlowProvider>
  );
}

describe("StackNode", () => {
  it("renders node name and technology", () => {
    renderNode();
    expect(screen.getByText("PostgreSQL Database")).toBeInTheDocument();
    expect(screen.getByText("PostgreSQL 16")).toBeInTheDocument();
  });

  it("renders description tooltip and wires aria-describedby", () => {
    const { container } = renderNode();
    const nodeDiv = container.querySelector(".stack-node") as HTMLElement;
    const tooltip = screen.getByTestId("node-description-tooltip");

    expect(tooltip).toHaveTextContent("Primary relational database");
    expect(tooltip).toHaveAttribute("role", "tooltip");
    expect(nodeDiv).toHaveAttribute("aria-describedby", tooltip.id);
    expect(nodeDiv).toHaveAttribute("tabindex", "0");
  });

  it("does not let the hidden tooltip become the hover target", () => {
    renderNode();
    const tooltip = screen.getByTestId("node-description-tooltip");

    expect(tooltip.className).toContain("pointer-events-none");
    expect(tooltip.className).not.toContain("pointer-events-auto");
  });

  it("does not render description tooltip for empty descriptions", () => {
    const { container } = renderNode({ description: "   " });
    const nodeDiv = container.querySelector(".stack-node") as HTMLElement;

    expect(screen.queryByTestId("node-description-tooltip")).not.toBeInTheDocument();
    expect(nodeDiv).not.toHaveAttribute("aria-describedby");
    expect(nodeDiv).toHaveAttribute("tabindex", "0");
  });

  it("does not render description tooltip when hover descriptions are disabled", () => {
    const { container } = render(
      <EditorDisplaySettingsProvider
        value={{
          ...DEFAULT_EDITOR_DISPLAY_SETTINGS,
          showDescriptionOnHover: false,
        }}
      >
        <ReactFlowProvider>
          <StackNodeComponent {...makeProps()} />
        </ReactFlowProvider>
      </EditorDisplaySettingsProvider>
    );
    const nodeDiv = container.querySelector(".stack-node") as HTMLElement;

    expect(screen.queryByTestId("node-description-tooltip")).not.toBeInTheDocument();
    expect(nodeDiv).not.toHaveAttribute("aria-describedby");
  });

  it("sanitizes HTML descriptions in the tooltip", () => {
    const { container } = renderNode({
      description:
        '<strong>Primary</strong> <script>alert("x")</script><a href="javascript:alert(1)">docs</a>',
    });
    const tooltip = screen.getByTestId("node-description-tooltip");

    expect(tooltip.querySelector("strong")).toHaveTextContent("Primary");
    expect(tooltip.querySelector("script")).not.toBeInTheDocument();
    expect(tooltip.querySelector("a")).not.toHaveAttribute("href");
    expect(tooltip).toHaveTextContent("docs");

    const nodeDiv = container.querySelector(".stack-node") as HTMLElement;
    expect(nodeDiv).toHaveAttribute("aria-describedby", tooltip.id);
  });

  it("renders category badge with display name", () => {
    renderNode();
    expect(screen.getByText("Data")).toBeInTheDocument();
  });

  it("hides category badge when node category display is disabled", () => {
    render(
      <EditorDisplaySettingsProvider
        value={{
          ...DEFAULT_EDITOR_DISPLAY_SETTINGS,
          showNodeCategory: false,
        }}
      >
        <ReactFlowProvider>
          <StackNodeComponent {...makeProps()} />
        </ReactFlowProvider>
      </EditorDisplaySettingsProvider>
    );

    expect(screen.getByText("PostgreSQL Database")).toBeInTheDocument();
    expect(screen.getByText("PostgreSQL 16")).toBeInTheDocument();
    expect(screen.queryByText("Data")).not.toBeInTheDocument();
  });

  it("does not show technology when empty", () => {
    renderNode({ technology: "" });
    expect(screen.getByText("PostgreSQL Database")).toBeInTheDocument();
    expect(screen.queryByText("PostgreSQL 16")).not.toBeInTheDocument();
  });

  it("shows lock indicator when locked and says so to assistive tech", () => {
    renderNode({ locked: true });
    expect(screen.getByTestId("lock-indicator")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /PostgreSQL Database.*Locked/ })).toBeInTheDocument();
  });

  it("does not show lock indicator when unlocked", () => {
    renderNode({ locked: false });
    expect(screen.queryByTestId("lock-indicator")).not.toBeInTheDocument();
  });

  it("opens the node with Enter and Space, not only with a pointer", () => {
    // The node is in the tab order, so a keyboard user reaches it and must be
    // able to act on it; opening the detail panel is the map's primary action.
    const onClick = vi.fn();
    renderNode({ onClick });
    const node = screen.getByRole("button", { name: /PostgreSQL Database/ });

    fireEvent.keyDown(node, { key: "Enter" });
    expect(onClick).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(node, { key: " " });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("does not scroll the canvas when Space activates a node", () => {
    const onClick = vi.fn();
    renderNode({ onClick });
    const node = screen.getByRole("button", { name: /PostgreSQL Database/ });
    const event = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    node.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("renders correct category color for client nodes", () => {
    renderNode({ category: "client", subtype: "web-app", name: "My App" });
    expect(screen.getByText("Client")).toBeInTheDocument();
    expect(screen.getByText("My App")).toBeInTheDocument();
  });

  it("marks a retired subtype and renders it with the category fallback", () => {
    const { container } = renderNode({
      category: "client",
      subtype: "retired-kiosk",
      customSubtypes: {},
      name: "Lobby kiosk",
    });

    expect(container.querySelector(".stack-node")).toHaveAttribute(
      "data-subtype-status",
      "deprecated"
    );
    expect(screen.getByText("Lobby kiosk")).toBeInTheDocument();
    expect(screen.getByText("Client")).toBeInTheDocument();
  });

  it("renders correct category color for api nodes", () => {
    renderNode({ category: "api", subtype: "rest-api", name: "REST API" });
    expect(screen.getByText("API Layer")).toBeInTheDocument();
  });

  it("renders correct category for services nodes", () => {
    renderNode({ category: "services", subtype: "auth", name: "Auth Service" });
    expect(screen.getByText("Services")).toBeInTheDocument();
  });

  it("renders correct category for infrastructure nodes", () => {
    renderNode({
      category: "infrastructure",
      subtype: "cdn",
      name: "CloudFront CDN",
    });
    expect(screen.getByText("Infrastructure")).toBeInTheDocument();
  });

  it("renders correct category for external nodes", () => {
    renderNode({
      category: "external",
      subtype: "third-party-api",
      name: "Stripe API",
    });
    expect(screen.getByText("External")).toBeInTheDocument();
  });

  it("renders note nodes as sticky notes without a category tag", () => {
    const { container } = renderNode({
      category: "note",
      subtype: "note",
      name: "Decision note",
      technology: "",
      description: "Use a boring queue until traffic proves otherwise.",
    });

    const nodeDiv = container.querySelector(".stack-node") as HTMLElement;
    expect(nodeDiv.style.backgroundColor).toBe("var(--note-yellow-fill)");
    expect(screen.getByText("Decision note")).toBeInTheDocument();
    expect(
      screen.getByText("Use a boring queue until traffic proves otherwise.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Note")).not.toBeInTheDocument();
  });

  it("renders the selected note color", () => {
    const { container } = renderNode({
      category: "note",
      subtype: "note",
      name: "Decision note",
      noteColor: "mint",
    });

    const nodeDiv = container.querySelector(".stack-node") as HTMLElement;
    expect(nodeDiv.style.backgroundColor).toBe("var(--note-mint-fill)");
    expect(nodeDiv.style.getPropertyValue("--node-border")).toBe("var(--note-mint-border)");
  });

  it("does not show connection handles for note nodes", () => {
    const { container } = renderNode({
      category: "note",
      subtype: "note",
      name: "Decision note",
    });

    expect(container.querySelectorAll(".react-flow__handle").length).toBe(0);
  });

  it("has a connection handle on each edge", () => {
    const { container } = renderNode();
    expect(container.querySelectorAll(".react-flow__handle")).toHaveLength(4);
    expect(container.querySelectorAll(".react-flow__handle.target")).toHaveLength(2);
    expect(container.querySelectorAll(".react-flow__handle.source")).toHaveLength(2);
  });

  it("shows context menu on right-click", () => {
    const { container } = renderNode();
    const nodeDiv = container.querySelector(".stack-node")!;
    fireEvent.contextMenu(nodeDiv);
    expect(screen.getByTestId("node-context-menu")).toBeInTheDocument();
    expect(screen.getByText("Lock")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("context menu shows Unlock when node is locked", () => {
    const { container } = renderNode({ locked: true });
    const nodeDiv = container.querySelector(".stack-node")!;
    fireEvent.contextMenu(nodeDiv);
    expect(screen.getByText("Unlock")).toBeInTheDocument();
  });

  it("calls onLockToggle from context menu", () => {
    const onLockToggle = vi.fn();
    const { container } = renderNode({ locked: false, onLockToggle });
    const nodeDiv = container.querySelector(".stack-node")!;
    fireEvent.contextMenu(nodeDiv);
    fireEvent.click(screen.getByTestId("context-menu-lock"));
    expect(onLockToggle).toHaveBeenCalledWith("node-1", true);
  });

  it("requires a second press before deleting from the context menu", () => {
    // Deleting a node also removes every connection attached to it and there
    // is no undo, so one stray click must not be enough.
    const onDelete = vi.fn();
    const { container } = renderNode({ onDelete });
    const nodeDiv = container.querySelector(".stack-node")!;
    fireEvent.contextMenu(nodeDiv);

    fireEvent.click(screen.getByTestId("context-menu-delete"));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByTestId("context-menu-delete")).toHaveTextContent("Confirm delete");

    fireEvent.click(screen.getByTestId("context-menu-delete"));
    expect(onDelete).toHaveBeenCalledWith("node-1");
  });

  it("disarms the delete confirmation when the menu closes", () => {
    const onDelete = vi.fn();
    const { container } = renderNode({ onDelete });
    const nodeDiv = container.querySelector(".stack-node")!;
    fireEvent.contextMenu(nodeDiv);
    fireEvent.click(screen.getByTestId("context-menu-delete"));
    fireEvent.pointerDown(document.body);

    fireEvent.contextMenu(nodeDiv);
    expect(screen.getByTestId("context-menu-delete")).toHaveTextContent("Delete");
    fireEvent.click(screen.getByTestId("context-menu-delete"));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("opens node actions from the keyboard context-menu shortcut", () => {
    const { container } = renderNode({ description: "" });
    const nodeDiv = container.querySelector(".stack-node")!;

    fireEvent.keyDown(nodeDiv, { key: "F10", shiftKey: true });

    expect(screen.getByTestId("node-context-menu")).toBeInTheDocument();
    expect(screen.getByTestId("context-menu-lock")).toBeInTheDocument();
    expect(screen.getByTestId("context-menu-delete")).toBeInTheDocument();
    expect(screen.queryByText("Add note")).not.toBeInTheDocument();
  });

  it("lets keyboard-opened context-menu controls activate without clicking the node", () => {
    const onLockToggle = vi.fn();
    const onDelete = vi.fn();
    const onClick = vi.fn();
    renderNode({ onLockToggle, onDelete, onClick });
    const node = screen.getByTestId("stack-node-node-1");
    fireEvent.keyDown(node, { key: "ContextMenu" });
    const lock = screen.getByTestId("context-menu-lock");
    lock.focus();
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    lock.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
    fireEvent.click(lock);
    expect(onLockToggle).toHaveBeenCalledWith("node-1", true);
    expect(onClick).not.toHaveBeenCalled();

    fireEvent.keyDown(node, { key: "F10", shiftKey: true });
    const remove = screen.getByTestId("context-menu-delete");
    remove.focus();
    const space = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    remove.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(false);
    fireEvent.click(remove);
    expect(screen.getByTestId("context-menu-delete")).toHaveTextContent("Confirm delete");
    fireEvent.click(screen.getByTestId("context-menu-delete"));
    expect(onDelete).toHaveBeenCalledWith("node-1");
    expect(onClick).not.toHaveBeenCalled();
  });

  it("calls onClick when node is clicked", () => {
    const onClick = vi.fn();
    const { container } = renderNode({ onClick });
    const nodeDiv = container.querySelector(".stack-node")!;
    fireEvent.click(nodeDiv);
    expect(onClick).toHaveBeenCalledWith("node-1");
  });

  it("closes the context menu on a pointer press outside it, even when the target stops propagation", () => {
    const { container } = renderNode();
    const pane = document.createElement("div");
    pane.addEventListener("pointerdown", (event) => event.stopPropagation());
    document.body.append(pane);
    fireEvent.contextMenu(container.querySelector(".stack-node")!);

    fireEvent.pointerDown(screen.getByTestId("context-menu-lock"));
    expect(screen.getByTestId("node-context-menu")).toBeInTheDocument();

    fireEvent.pointerDown(pane);
    expect(screen.queryByTestId("node-context-menu")).not.toBeInTheDocument();
    pane.remove();
  });

  it("closes the context menu on Escape and returns focus to the node", () => {
    const { container } = renderNode();
    const nodeDiv = container.querySelector<HTMLElement>(".stack-node")!;
    fireEvent.contextMenu(nodeDiv);
    screen.getByTestId("context-menu-lock").focus();

    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByTestId("node-context-menu")).not.toBeInTheDocument();
    expect(nodeDiv).toHaveFocus();
  });

  it("closes the context menu when the node is deselected", () => {
    const { container, rerender } = render(
      <ReactFlowProvider>
        <StackNodeComponent {...makeProps({}, true)} />
      </ReactFlowProvider>
    );
    fireEvent.contextMenu(container.querySelector(".stack-node")!);
    expect(screen.getByTestId("node-context-menu")).toBeInTheDocument();

    rerender(
      <ReactFlowProvider>
        <StackNodeComponent {...makeProps({}, false)} />
      </ReactFlowProvider>
    );
    expect(screen.queryByTestId("node-context-menu")).not.toBeInTheDocument();
  });

  it("marks the category with a tag that pairs an icon with the word", () => {
    renderNode({ category: "data" });
    const tag = screen.getByText("Data");
    expect(tag.querySelector("svg")).not.toBeNull();
  });
});
