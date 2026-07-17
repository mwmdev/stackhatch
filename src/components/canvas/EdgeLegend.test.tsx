import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EdgeLegend from "./EdgeLegend";

describe("EdgeLegend", () => {
  it("renders toggle button", () => {
    render(<EdgeLegend />);
    expect(screen.getByTestId("edge-legend")).toHaveClass("edge-legend");
    expect(screen.getByTestId("edge-legend-toggle")).toHaveTextContent("Edge Legend");
  });

  it("is hidden by default", () => {
    render(<EdgeLegend />);
    expect(screen.queryByTestId("edge-legend-panel")).not.toBeInTheDocument();
  });

  it("shows legend panel when toggle is clicked", () => {
    render(<EdgeLegend />);
    fireEvent.click(screen.getByTestId("edge-legend-toggle"));
    expect(screen.getByTestId("edge-legend-panel")).toHaveClass("edge-legend__panel");
  });

  it("hides legend panel on second click", () => {
    render(<EdgeLegend />);
    const toggle = screen.getByTestId("edge-legend-toggle");
    fireEvent.click(toggle);
    expect(screen.getByTestId("edge-legend-panel")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByTestId("edge-legend-panel")).not.toBeInTheDocument();
  });

  it("toggle button text changes when panel is visible", () => {
    render(<EdgeLegend />);
    const toggle = screen.getByTestId("edge-legend-toggle");
    expect(toggle).toHaveTextContent("Edge Legend");
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent("Hide Legend");
  });

  it("displays all six connection types", () => {
    render(<EdgeLegend />);
    fireEvent.click(screen.getByTestId("edge-legend-toggle"));
    expect(screen.getByText("HTTP")).toBeInTheDocument();
    expect(screen.getByText("WebSocket")).toBeInTheDocument();
    expect(screen.getByText("gRPC")).toBeInTheDocument();
    expect(screen.getByText("TCP")).toBeInTheDocument();
    expect(screen.getByText("Pub/Sub")).toBeInTheDocument();
    expect(screen.getByText("File I/O")).toBeInTheDocument();
  });

  it("renders SVG line samples for each connection type", () => {
    render(<EdgeLegend />);
    fireEvent.click(screen.getByTestId("edge-legend-toggle"));
    expect(screen.getByTestId("legend-line-http")).toBeInTheDocument();
    expect(screen.getByTestId("legend-line-websocket")).toBeInTheDocument();
    expect(screen.getByTestId("legend-line-grpc")).toBeInTheDocument();
    expect(screen.getByTestId("legend-line-tcp")).toBeInTheDocument();
    expect(screen.getByTestId("legend-line-pub-sub")).toBeInTheDocument();
    expect(screen.getByTestId("legend-line-file-io")).toBeInTheDocument();
  });

  it("renders connection types heading", () => {
    render(<EdgeLegend />);
    fireEvent.click(screen.getByTestId("edge-legend-toggle"));
    expect(screen.getByText("Connection Types")).toBeInTheDocument();
  });

  it("http line is solid (no dasharray)", () => {
    render(<EdgeLegend />);
    fireEvent.click(screen.getByTestId("edge-legend-toggle"));
    const httpLine = screen.getByTestId("legend-line-http").querySelector("line");
    expect(httpLine?.getAttribute("stroke-dasharray")).toBeNull();
  });

  it("websocket line is dashed", () => {
    render(<EdgeLegend />);
    fireEvent.click(screen.getByTestId("edge-legend-toggle"));
    const wsLine = screen.getByTestId("legend-line-websocket").querySelector("line");
    expect(wsLine?.getAttribute("stroke-dasharray")).toBe("8 4");
  });
});
