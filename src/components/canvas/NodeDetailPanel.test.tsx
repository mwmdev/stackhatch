import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NodeDetailPanel from "./NodeDetailPanel";
import type { StackNode } from "@/types/stack";

function makeNode(overrides: Partial<StackNode> = {}): StackNode {
  return {
    id: "node-1",
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

describe("NodeDetailPanel", () => {
  it("renders nothing when node is null", () => {
    const { container } = render(
      <NodeDetailPanel
        node={null}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders node data correctly", () => {
    const node = makeNode();
    render(
      <NodeDetailPanel
        node={node}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue("PostgreSQL Database")).toBeInTheDocument();
    expect(screen.getByDisplayValue("PostgreSQL 16")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("Primary relational database"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Chosen for strong ACID compliance"),
    ).toBeInTheDocument();
    expect(screen.getByText("Unlocked")).toBeInTheDocument();
  });

  it("renders correct category and subtype selections", () => {
    const node = makeNode();
    render(
      <NodeDetailPanel
        node={node}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const categorySelect = screen.getByLabelText("Category") as HTMLSelectElement;
    expect(categorySelect.value).toBe("data");

    const subtypeSelect = screen.getByLabelText("Subtype") as HTMLSelectElement;
    expect(subtypeSelect.value).toBe("sql-db");
  });

  it("calls onUpdate when name is changed", () => {
    const onUpdate = vi.fn();
    const node = makeNode();
    render(
      <NodeDetailPanel
        node={node}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const nameInput = screen.getByLabelText("Node name");
    fireEvent.change(nameInput, { target: { value: "MySQL Database" } });
    expect(onUpdate).toHaveBeenCalledWith("node-1", { name: "MySQL Database" });
  });

  it("calls onUpdate when technology is changed", () => {
    const onUpdate = vi.fn();
    const node = makeNode();
    render(
      <NodeDetailPanel
        node={node}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const techInput = screen.getByLabelText("Technology");
    fireEvent.change(techInput, { target: { value: "MySQL 8" } });
    expect(onUpdate).toHaveBeenCalledWith("node-1", { technology: "MySQL 8" });
  });

  it("calls onUpdate with new category and first subtype when category changes", () => {
    const onUpdate = vi.fn();
    const node = makeNode();
    render(
      <NodeDetailPanel
        node={node}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const categorySelect = screen.getByLabelText("Category");
    fireEvent.change(categorySelect, { target: { value: "client" } });
    expect(onUpdate).toHaveBeenCalledWith("node-1", {
      category: "client",
      subtype: "web-app",
      name: "Web App",
    });
  });

  it("calls onUpdate when subtype is changed", () => {
    const onUpdate = vi.fn();
    const node = makeNode();
    render(
      <NodeDetailPanel
        node={node}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const subtypeSelect = screen.getByLabelText("Subtype");
    fireEvent.change(subtypeSelect, { target: { value: "cache" } });
    expect(onUpdate).toHaveBeenCalledWith("node-1", { subtype: "cache" });
  });

  it("calls onUpdate when description is changed", () => {
    const onUpdate = vi.fn();
    const node = makeNode();
    render(
      <NodeDetailPanel
        node={node}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const descInput = screen.getByLabelText("Description");
    fireEvent.change(descInput, { target: { value: "Updated desc" } });
    expect(onUpdate).toHaveBeenCalledWith("node-1", {
      description: "Updated desc",
    });
  });

  it("shows locked state when node is locked", () => {
    const node = makeNode({ locked: true });
    render(
      <NodeDetailPanel
        node={node}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Locked")).toBeInTheDocument();
    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("toggles lock state via onUpdate", () => {
    const onUpdate = vi.fn();
    const node = makeNode({ locked: false });
    render(
      <NodeDetailPanel
        node={node}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);
    expect(onUpdate).toHaveBeenCalledWith("node-1", { locked: true });
  });

  it("requires double click to delete (confirmation)", () => {
    const onDelete = vi.fn();
    const onClose = vi.fn();
    const node = makeNode();
    render(
      <NodeDetailPanel
        node={node}
        onUpdate={vi.fn()}
        onDelete={onDelete}
        onClose={onClose}
      />,
    );

    const deleteBtn = screen.getByText("Delete Node");
    fireEvent.click(deleteBtn);

    // First click shows confirmation
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText("Confirm Delete")).toBeInTheDocument();

    // Second click actually deletes
    fireEvent.click(screen.getByText("Confirm Delete"));
    expect(onDelete).toHaveBeenCalledWith("node-1");
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when X button is clicked", () => {
    const onClose = vi.fn();
    const node = makeNode();
    render(
      <NodeDetailPanel
        node={node}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onClose={onClose}
      />,
    );

    const closeBtn = screen.getByLabelText("Close panel");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it("does not show reasoning section when reasoning is empty", () => {
    const node = makeNode({ reasoning: "" });
    render(
      <NodeDetailPanel
        node={node}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByText("AI Reasoning")).not.toBeInTheDocument();
  });

  it("renders different categories with correct config", () => {
    const apiNode = makeNode({
      category: "api",
      subtype: "rest-api",
      name: "REST API",
    });
    render(
      <NodeDetailPanel
        node={apiNode}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const categorySelect = screen.getByLabelText("Category") as HTMLSelectElement;
    expect(categorySelect.value).toBe("api");

    // API subtypes should be shown
    const subtypeSelect = screen.getByLabelText("Subtype") as HTMLSelectElement;
    const options = Array.from(subtypeSelect.options).map((o) => o.value);
    expect(options).toContain("rest-api");
    expect(options).toContain("graphql");
    expect(options).toContain("grpc");
    expect(options).toContain("websocket-server");
  });

  it("resets delete confirmation when node changes", () => {
    const onDelete = vi.fn();
    const node = makeNode();
    const { rerender } = render(
      <NodeDetailPanel
        node={node}
        onUpdate={vi.fn()}
        onDelete={onDelete}
        onClose={vi.fn()}
      />,
    );

    // Trigger confirmation
    fireEvent.click(screen.getByText("Delete Node"));
    expect(screen.getByText("Confirm Delete")).toBeInTheDocument();

    // Change node
    const newNode = makeNode({ id: "node-2", name: "Redis Cache" });
    rerender(
      <NodeDetailPanel
        node={newNode}
        onUpdate={vi.fn()}
        onDelete={onDelete}
        onClose={vi.fn()}
      />,
    );

    // Confirmation should be reset
    expect(screen.getByText("Delete Node")).toBeInTheDocument();
  });
});
