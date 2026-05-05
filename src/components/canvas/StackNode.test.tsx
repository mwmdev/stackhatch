import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReactFlowProvider } from "reactflow";
import StackNodeComponent from "./StackNode";
import type { StackNodeData } from "./StackNode";

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
    expect(nodeDiv).not.toHaveAttribute("tabindex");
  });

  it("sanitizes HTML descriptions in the tooltip", () => {
    const { container } = renderNode({
      description:
        '<strong>Primary</strong> <script>alert("x")</script><a href="javascript:alert(1)">docs</a>',
    });
    const tooltip = screen.getByTestId("node-description-tooltip");

    expect(tooltip.querySelector("strong")).toHaveTextContent("Primary");
    expect(tooltip.querySelector("script")).not.toBeInTheDocument();
    expect(tooltip.querySelector("a")).toHaveAttribute("href", "#");
    expect(tooltip).toHaveTextContent("docs");

    const nodeDiv = container.querySelector(".stack-node") as HTMLElement;
    expect(nodeDiv).toHaveAttribute("aria-describedby", tooltip.id);
  });

  it("renders category badge with display name", () => {
    renderNode();
    expect(screen.getByText("Data")).toBeInTheDocument();
  });

  it("does not show technology when empty", () => {
    renderNode({ technology: "" });
    expect(screen.getByText("PostgreSQL Database")).toBeInTheDocument();
    expect(screen.queryByText("PostgreSQL 16")).not.toBeInTheDocument();
  });

  it("shows lock indicator when locked", () => {
    renderNode({ locked: true });
    const lockIndicator = screen.getByTestId("lock-indicator");

    expect(lockIndicator).toBeInTheDocument();
    expect(lockIndicator.className).toContain("bottom-2");
    expect(lockIndicator.className).toContain("right-2");
    expect(lockIndicator.className).not.toContain("top-2");
  });

  it("does not show lock indicator when unlocked", () => {
    renderNode({ locked: false });
    expect(screen.queryByTestId("lock-indicator")).not.toBeInTheDocument();
  });

  it("applies dashed border when locked", () => {
    const { container } = renderNode({ locked: true });
    const nodeDiv = container.querySelector(".stack-node");
    expect(nodeDiv?.className).toContain("border-dashed");
  });

  it("does not apply dashed border when unlocked", () => {
    const { container } = renderNode({ locked: false });
    const nodeDiv = container.querySelector(".stack-node");
    expect(nodeDiv?.className).not.toContain("border-dashed");
  });

  it("shows selection ring when selected", () => {
    const { container } = renderNode({}, true);
    const nodeDiv = container.querySelector(".stack-node");
    expect(nodeDiv?.className).toContain("ring-2");
    expect(nodeDiv?.className).toContain("ring-[var(--ring)]");
  });

  it("does not show selection ring when not selected", () => {
    const { container } = renderNode({}, false);
    const nodeDiv = container.querySelector(".stack-node");
    expect(nodeDiv?.className).not.toContain("ring-2");
  });

  it("renders correct category color for client nodes", () => {
    renderNode({ category: "client", subtype: "web-app", name: "My App" });
    expect(screen.getByText("Client")).toBeInTheDocument();
    expect(screen.getByText("My App")).toBeInTheDocument();
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

  it("renders note nodes as post-it notes with handwritten styling", () => {
    const { container } = renderNode({
      category: "note",
      subtype: "note",
      name: "Decision note",
      technology: "",
      description: "Use a boring queue until traffic proves otherwise.",
    });

    const nodeDiv = container.querySelector(".stack-node") as HTMLElement;
    expect(nodeDiv).toHaveClass("font-note");
    expect(nodeDiv.style.backgroundColor).toBe("var(--color-note-fill)");
    expect(screen.getByText("Decision note")).toBeInTheDocument();
    expect(screen.getByText("Use a boring queue until traffic proves otherwise.")).toBeInTheDocument();
    expect(screen.queryByText("Note")).not.toBeInTheDocument();
  });

  it("does not show connection handles for note nodes", () => {
    const { container } = renderNode({
      category: "note",
      subtype: "note",
      name: "Decision note",
    });

    expect(container.querySelectorAll(".react-flow__handle").length).toBe(0);
  });

  it("has connection handles", () => {
    const { container } = renderNode();
    const handles = container.querySelectorAll(".react-flow__handle");
    expect(handles.length).toBe(2);
    // One target (top) and one source (bottom)
    expect(container.querySelector(".react-flow__handle-top")).toBeInTheDocument();
    expect(container.querySelector(".react-flow__handle-bottom")).toBeInTheDocument();
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

  it("calls onDelete from context menu", () => {
    const onDelete = vi.fn();
    const { container } = renderNode({ onDelete });
    const nodeDiv = container.querySelector(".stack-node")!;
    fireEvent.contextMenu(nodeDiv);
    fireEvent.click(screen.getByTestId("context-menu-delete"));
    expect(onDelete).toHaveBeenCalledWith("node-1");
  });

  it("calls onClick when node is clicked", () => {
    const onClick = vi.fn();
    const { container } = renderNode({ onClick });
    const nodeDiv = container.querySelector(".stack-node")!;
    fireEvent.click(nodeDiv);
    expect(onClick).toHaveBeenCalledWith("node-1");
  });

  it("closes context menu on outside click", () => {
    const { container } = renderNode();
    const nodeDiv = container.querySelector(".stack-node")!;
    fireEvent.contextMenu(nodeDiv);
    expect(screen.getByTestId("node-context-menu")).toBeInTheDocument();

    // Click outside
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId("node-context-menu")).not.toBeInTheDocument();
  });

  it("has border accent matching category color", () => {
    const { container } = renderNode({ category: "data" });
    const nodeDiv = container.querySelector(".stack-node") as HTMLElement;
    expect(nodeDiv.style.borderColor).toBe("var(--color-data)");
  });
});
