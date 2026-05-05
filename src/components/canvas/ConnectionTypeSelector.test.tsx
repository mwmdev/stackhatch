import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ConnectionTypeSelector from "./ConnectionTypeSelector";

describe("ConnectionTypeSelector", () => {
  const defaultProps = {
    position: { x: 100, y: 200 },
    onSelect: vi.fn(),
    onCancel: vi.fn(),
  };

  it("renders all connection types", () => {
    render(<ConnectionTypeSelector {...defaultProps} />);

    expect(screen.getByText("HTTP")).toBeInTheDocument();
    expect(screen.getByText("WebSocket")).toBeInTheDocument();
    expect(screen.getByText("gRPC")).toBeInTheDocument();
    expect(screen.getByText("TCP")).toBeInTheDocument();
    expect(screen.getByText("Pub/Sub")).toBeInTheDocument();
    expect(screen.getByText("File I/O")).toBeInTheDocument();
  });

  it("renders descriptions for each connection type", () => {
    render(<ConnectionTypeSelector {...defaultProps} />);

    expect(screen.getByText("REST API calls")).toBeInTheDocument();
    expect(screen.getByText("Real-time bidirectional")).toBeInTheDocument();
    expect(screen.getByText("RPC calls")).toBeInTheDocument();
    expect(screen.getByText("Raw TCP connection")).toBeInTheDocument();
    expect(screen.getByText("Event messaging")).toBeInTheDocument();
    expect(screen.getByText("File read/write")).toBeInTheDocument();
  });

  it("renders the header", () => {
    render(<ConnectionTypeSelector {...defaultProps} />);
    expect(screen.getByText("Connection Type")).toBeInTheDocument();
  });

  it("calls onSelect with correct type when clicked", () => {
    const onSelect = vi.fn();
    render(<ConnectionTypeSelector {...defaultProps} onSelect={onSelect} />);

    fireEvent.click(screen.getByTestId("connection-type-http"));
    expect(onSelect).toHaveBeenCalledWith("http");
  });

  it("calls onSelect with websocket type", () => {
    const onSelect = vi.fn();
    render(<ConnectionTypeSelector {...defaultProps} onSelect={onSelect} />);

    fireEvent.click(screen.getByTestId("connection-type-websocket"));
    expect(onSelect).toHaveBeenCalledWith("websocket");
  });

  it("calls onSelect with pub-sub type", () => {
    const onSelect = vi.fn();
    render(<ConnectionTypeSelector {...defaultProps} onSelect={onSelect} />);

    fireEvent.click(screen.getByTestId("connection-type-pub-sub"));
    expect(onSelect).toHaveBeenCalledWith("pub-sub");
  });

  it("positions itself at the given coordinates", () => {
    render(<ConnectionTypeSelector {...defaultProps} position={{ x: 150, y: 300 }} />);

    const selector = screen.getByTestId("connection-type-selector");
    expect(selector.style.left).toBe("150px");
    expect(selector.style.top).toBe("300px");
  });

  it("marks the selected connection type", () => {
    render(<ConnectionTypeSelector {...defaultProps} selectedType="grpc" />);
    expect(screen.getByTestId("connection-type-grpc")).toHaveAttribute("aria-current", "true");
  });
});
