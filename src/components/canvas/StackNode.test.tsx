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
function makeProps(
  dataOverrides: Partial<StackNodeData> = {},
  selected = false,
) {
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

function renderNode(
  dataOverrides: Partial<StackNodeData> = {},
  selected = false,
) {
  return render(
    <ReactFlowProvider>
      <StackNodeComponent {...makeProps(dataOverrides, selected)} />
    </ReactFlowProvider>,
  );
}

describe("StackNode", () => {
  it("renders node name and technology", () => {
    renderNode();
    expect(screen.getByText("PostgreSQL Database")).toBeInTheDocument();
    expect(screen.getByText("PostgreSQL 16")).toBeInTheDocument();
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
    expect(screen.getByTestId("lock-indicator")).toBeInTheDocument();
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
    expect(nodeDiv?.className).toContain("ring-blue-500");
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

  it("has connection handles", () => {
    const { container } = renderNode();
    const handles = container.querySelectorAll(".react-flow__handle");
    expect(handles.length).toBe(2);
    // One target (top) and one source (bottom)
    expect(
      container.querySelector(".react-flow__handle-top"),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".react-flow__handle-bottom"),
    ).toBeInTheDocument();
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

  it("has left border accent matching category color", () => {
    const { container } = renderNode({ category: "data" });
    const nodeDiv = container.querySelector(".stack-node") as HTMLElement;
    expect(nodeDiv.style.borderLeftColor).toBe("var(--color-data)");
  });
});
