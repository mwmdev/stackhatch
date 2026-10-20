import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CanvasAddNodeMenu from "./CanvasAddNodeMenu";

function renderMenu() {
  const onAddNode = vi.fn();
  const onCancel = vi.fn();
  render(
    <CanvasAddNodeMenu position={{ x: 40, y: 60 }} onAddNode={onAddNode} onCancel={onCancel} />
  );
  return { onAddNode, onCancel };
}

describe("CanvasAddNodeMenu", () => {
  it("reports the chosen category and subtype", () => {
    const { onAddNode } = renderMenu();
    fireEvent.click(screen.getByTestId("category-data"));
    fireEvent.click(screen.getByTestId("subtype-sql-db"));
    expect(onAddNode).toHaveBeenCalledTimes(1);
    expect(onAddNode).toHaveBeenCalledWith("data", "sql-db");
  });

  it("cancels with focus restore on Escape", () => {
    const { onCancel, onAddNode } = renderMenu();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledWith(true);
    expect(onAddNode).not.toHaveBeenCalled();
  });

  it("cancels without focus restore on a press outside", () => {
    const { onCancel } = renderMenu();
    fireEvent.mouseDown(document.body);
    expect(onCancel).toHaveBeenCalledWith(false);
  });
});
