import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AddNodeDropdown from "./AddNodeDropdown";
import { categoryOrder, nodeConfig } from "@/lib/node-config";

describe("AddNodeDropdown", () => {
  it("renders the Add node button", () => {
    render(<AddNodeDropdown onAddNode={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Add node" })).toBeInTheDocument();
  });

  it("opens dropdown on button click and reports it as expanded", () => {
    render(<AddNodeDropdown onAddNode={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Add node" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(screen.getByTestId("add-node-dropdown")).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("shows all categories when dropdown is open", () => {
    render(<AddNodeDropdown onAddNode={vi.fn()} />);
    fireEvent.click(screen.getByTestId("add-node-button"));

    for (const category of categoryOrder) {
      const config = nodeConfig[category];
      expect(screen.getByText(config.displayName)).toBeInTheDocument();
    }
  });

  it("expands category to show subtypes on click", () => {
    render(<AddNodeDropdown onAddNode={vi.fn()} />);
    fireEvent.click(screen.getByTestId("add-node-button"));
    fireEvent.click(screen.getByTestId("category-client"));

    expect(screen.getByText("Web App")).toBeInTheDocument();
    expect(screen.getByText("Mobile App")).toBeInTheDocument();
    expect(screen.getByText("Desktop App")).toBeInTheDocument();
    expect(screen.getByText("CLI")).toBeInTheDocument();
  });

  it("collapses category on second click", () => {
    render(<AddNodeDropdown onAddNode={vi.fn()} />);
    fireEvent.click(screen.getByTestId("add-node-button"));
    fireEvent.click(screen.getByTestId("category-client"));
    expect(screen.getByText("Web App")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("category-client"));
    expect(screen.queryByTestId("subtype-web-app")).not.toBeInTheDocument();
  });

  it("calls onAddNode with correct category and subtype when subtype is clicked", () => {
    const onAddNode = vi.fn();
    render(<AddNodeDropdown onAddNode={onAddNode} />);
    fireEvent.click(screen.getByTestId("add-node-button"));
    fireEvent.click(screen.getByTestId("category-data"));
    fireEvent.click(screen.getByTestId("subtype-sql-db"));

    expect(onAddNode).toHaveBeenCalledWith("data", "sql-db");
  });

  it("closes dropdown after subtype selection", () => {
    render(<AddNodeDropdown onAddNode={vi.fn()} />);
    fireEvent.click(screen.getByTestId("add-node-button"));
    fireEvent.click(screen.getByTestId("category-api"));
    fireEvent.click(screen.getByTestId("subtype-rest-api"));

    expect(screen.queryByTestId("add-node-dropdown")).not.toBeInTheDocument();
  });

  it("toggles dropdown open/closed on button click", () => {
    render(<AddNodeDropdown onAddNode={vi.fn()} />);

    fireEvent.click(screen.getByTestId("add-node-button"));
    expect(screen.getByTestId("add-node-dropdown")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("add-node-button"));
    expect(screen.queryByTestId("add-node-dropdown")).not.toBeInTheDocument();
  });

  it("switches expanded category when different category is clicked", () => {
    render(<AddNodeDropdown onAddNode={vi.fn()} />);
    fireEvent.click(screen.getByTestId("add-node-button"));

    fireEvent.click(screen.getByTestId("category-client"));
    expect(screen.getByText("Web App")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("category-services"));
    expect(screen.queryByTestId("subtype-web-app")).not.toBeInTheDocument();
    expect(screen.getByText("Authentication")).toBeInTheDocument();
  });

  it("shows all subtypes for infrastructure category", () => {
    render(<AddNodeDropdown onAddNode={vi.fn()} />);
    fireEvent.click(screen.getByTestId("add-node-button"));
    fireEvent.click(screen.getByTestId("category-infrastructure"));

    expect(screen.getByText("CDN")).toBeInTheDocument();
    expect(screen.getByText("Load Balancer")).toBeInTheDocument();
    expect(screen.getByText("API Gateway")).toBeInTheDocument();
    expect(screen.getByText("DNS")).toBeInTheDocument();
    expect(screen.getByText("Reverse Proxy")).toBeInTheDocument();
  });

  it("adds note nodes", () => {
    const onAddNode = vi.fn();
    render(<AddNodeDropdown onAddNode={onAddNode} />);
    fireEvent.click(screen.getByTestId("add-node-button"));
    fireEvent.click(screen.getByTestId("category-note"));
    fireEvent.click(screen.getByTestId("subtype-note"));

    expect(onAddNode).toHaveBeenCalledWith("note", "note");
  });
  it("closes an expanded menu on Escape and restores focus to its trigger", () => {
    render(<AddNodeDropdown onAddNode={vi.fn()} />);
    const trigger = screen.getByTestId("add-node-button");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByTestId("category-client"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("add-node-dropdown")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    expect(screen.queryByTestId("subtype-web-app")).not.toBeInTheDocument();
  });
});
