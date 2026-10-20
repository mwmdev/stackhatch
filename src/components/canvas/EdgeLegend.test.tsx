import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EdgeLegend from "./EdgeLegend";

function mockCompactViewport(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({ matches, media: query }) as MediaQueryList)
  );
}

describe("EdgeLegend", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the connection key by default on wide screens", () => {
    mockCompactViewport(false);
    render(<EdgeLegend />);
    const toggle = screen.getByRole("button", { name: "Legend" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("list", { name: "Connection types" })).toBeInTheDocument();
  });

  it("starts folded on phones", () => {
    mockCompactViewport(true);
    render(<EdgeLegend />);
    expect(screen.getByRole("button", { name: "Legend" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(screen.queryByTestId("edge-legend-panel")).not.toBeInTheDocument();
  });

  it("folds and unfolds the swatches, keeping the toggle in place", () => {
    render(<EdgeLegend />);
    const toggle = screen.getByRole("button", { name: "Legend" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("edge-legend-panel")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("edge-legend-panel")).toBeInTheDocument();
  });

  it("names all six connection types beside their line samples", () => {
    render(<EdgeLegend />);
    for (const name of ["HTTP", "WebSocket", "gRPC", "TCP", "Pub/Sub", "File I/O"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    for (const type of ["http", "websocket", "grpc", "tcp", "pub-sub", "file-io"]) {
      expect(screen.getByTestId(`legend-line-${type}`)).toBeInTheDocument();
    }
  });

  it("draws each type with its own line pattern", () => {
    render(<EdgeLegend />);
    const line = (type: string) =>
      screen
        .getByTestId(`legend-line-${type}`)
        .querySelector("line")
        ?.getAttribute("stroke-dasharray");
    expect(line("http")).toBeNull();
    expect(line("websocket")).toBe("8 4");
    expect(line("tcp")).not.toBe(line("file-io"));
  });

  it("keeps the React Flow credit", () => {
    render(<EdgeLegend />);
    expect(screen.getByRole("link", { name: "React Flow" })).toHaveAttribute(
      "href",
      "https://reactflow.dev"
    );
  });
});
