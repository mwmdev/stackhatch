import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ArchitectureDemo from "./ArchitectureDemo";

const { mockTrackEvent, mockPush } = vi.hoisted(() => ({
  mockTrackEvent: vi.fn(),
  mockPush: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  trackEvent: mockTrackEvent,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("reactflow", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({
      nodes,
      edges,
      onNodeClick,
      onEdgeClick,
      children,
    }: {
      nodes: Array<{ id: string; ariaLabel: string }>;
      edges: Array<{ id: string; ariaLabel: string }>;
      onNodeClick: (event: React.MouseEvent, node: { id: string }) => void;
      onEdgeClick: (event: React.MouseEvent, edge: { id: string }) => void;
      children: React.ReactNode;
    }) =>
      React.createElement(
        "div",
        { "data-testid": "public-flow" },
        ...nodes.map((node) =>
          React.createElement(
            "button",
            {
              key: node.id,
              type: "button",
              className: "react-flow__node",
              "data-id": node.id,
              "aria-label": node.ariaLabel,
              onClick: (event: React.MouseEvent) => onNodeClick(event, node),
            },
            node.id
          )
        ),
        ...edges.map((edge) =>
          React.createElement(
            "button",
            {
              key: edge.id,
              type: "button",
              className: "react-flow__edge",
              "data-testid": `rf__edge-${edge.id}`,
              "aria-label": edge.ariaLabel,
              onClick: (event: React.MouseEvent) => onEdgeClick(event, edge),
            },
            edge.id
          )
        ),
        children
      ),
    Background: () => null,
    Controls: () => null,
    BackgroundVariant: { Dots: "dots" },
    MarkerType: { ArrowClosed: "arrowclosed" },
  };
});

vi.mock("reactflow/dist/style.css", () => ({}));

describe("ArchitectureDemo", () => {
  beforeEach(() => {
    mockTrackEvent.mockClear();
    mockPush.mockClear();
  });

  it("supports questions, component details, connections, alternatives, and text access", () => {
    render(<ArchitectureDemo mode="full" />);

    expect(mockTrackEvent).toHaveBeenCalledWith("demo_opened", { location: "demo" });
    expect(screen.getByText("Read-only architecture overview")).toBeInTheDocument();
    expect(screen.getByText("Read the components and connections")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Where is project data stored?" }));
    expect(screen.getByText(/through Drizzle into SQLite/i)).toBeInTheDocument();
    expect(mockTrackEvent).toHaveBeenCalledWith("demo_question_opened", { location: "demo" });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open component Application data, SQLite · Drizzle",
      })
    );
    expect(screen.getByRole("heading", { name: "Application data" })).toBeInTheDocument();
    expect(mockTrackEvent).toHaveBeenCalledWith("demo_node_opened", { location: "demo" });

    fireEvent.click(screen.getByRole("button", { name: "Explore alternatives" }));
    expect(screen.getByRole("heading", { name: "PostgreSQL" })).toBeInTheDocument();
    expect(mockTrackEvent).toHaveBeenCalledWith("alternatives_opened", { location: "demo" });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Inspect connection from Route handlers to Authentication: session checks",
      })
    );
    expect(
      screen.getByRole("heading", { name: "Route handlers → Authentication" })
    ).toBeInTheDocument();
  });
});
