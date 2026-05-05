import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ReactFlowProvider } from "reactflow";
import StackEdgeComponent, { edgeStyles } from "./StackEdge";
import type { StackEdgeData } from "./StackEdge";
import type { ConnectionType } from "@/types/stack";
import { Position } from "reactflow";

function makeProps(dataOverrides: Partial<StackEdgeData> = {}, selected = false) {
  return {
    id: "edge-1",
    source: "node-a",
    target: "node-b",
    sourceX: 100,
    sourceY: 100,
    targetX: 300,
    targetY: 300,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    selected,
    data: {
      connectionType: "http" as ConnectionType,
      label: "REST API",
      ...dataOverrides,
    },
  } as Parameters<typeof StackEdgeComponent>[0];
}

function renderEdge(dataOverrides: Partial<StackEdgeData> = {}, selected = false) {
  return render(
    <ReactFlowProvider>
      <svg>
        <StackEdgeComponent {...makeProps(dataOverrides, selected)} />
      </svg>
    </ReactFlowProvider>
  );
}

// BaseEdge renders style as inline CSS, so we check via element.style
function getEdgePath(container: HTMLElement) {
  return container.querySelector(".react-flow__edge-path") as SVGPathElement | null;
}

describe("StackEdge", () => {
  it("renders an edge path for http type", () => {
    const { container } = renderEdge({ connectionType: "http" });
    const path = getEdgePath(container);
    expect(path).toBeInTheDocument();
    expect(path?.style.stroke).toBe(edgeStyles.http.color);
  });

  it("renders solid http line", () => {
    const { container } = renderEdge({ connectionType: "http" });
    const path = getEdgePath(container);
    expect(path?.style.stroke).toBe(edgeStyles.http.color);
    expect(path?.style.strokeDasharray).toBe("0");
    expect(path?.style.strokeWidth).toBe("2");
  });

  it("renders dashed websocket line", () => {
    const { container } = renderEdge({ connectionType: "websocket" });
    const path = getEdgePath(container);
    expect(path?.style.stroke).toBe(edgeStyles.websocket.color);
    expect(path?.style.strokeDasharray).toBe("8 4");
  });

  it("renders solid thicker grpc line", () => {
    const { container } = renderEdge({ connectionType: "grpc" });
    const path = getEdgePath(container);
    expect(path?.style.stroke).toBe(edgeStyles.grpc.color);
    expect(path?.style.strokeDasharray).toBe("0");
    expect(path?.style.strokeWidth).toBe("3");
  });

  it("renders dotted tcp line", () => {
    const { container } = renderEdge({ connectionType: "tcp" });
    const path = getEdgePath(container);
    expect(path?.style.stroke).toBe(edgeStyles.tcp.color);
    expect(path?.style.strokeDasharray).toBe("4 4");
  });

  it("renders dash-dot pub-sub line", () => {
    const { container } = renderEdge({ connectionType: "pub-sub" });
    const path = getEdgePath(container);
    expect(path?.style.stroke).toBe(edgeStyles["pub-sub"].color);
    expect(path?.style.strokeDasharray).toBe("12 4 4 4");
  });

  it("renders dotted file-io line", () => {
    const { container } = renderEdge({ connectionType: "file-io" });
    const path = getEdgePath(container);
    expect(path?.style.stroke).toBe(edgeStyles["file-io"].color);
    expect(path?.style.strokeDasharray).toBe("4 4");
  });

  it("increases stroke width when selected", () => {
    const { container } = renderEdge({ connectionType: "http" }, true);
    const path = getEdgePath(container);
    expect(path?.style.strokeWidth).toBe("3");
  });

  it("uses default stroke width when not selected", () => {
    const { container } = renderEdge({ connectionType: "http" }, false);
    const path = getEdgePath(container);
    expect(path?.style.strokeWidth).toBe("2");
  });

  it("defaults to http style when data is missing", () => {
    const props = makeProps();
    props.data = undefined as unknown as StackEdgeData;
    const { container } = render(
      <ReactFlowProvider>
        <svg>
          <StackEdgeComponent {...props} />
        </svg>
      </ReactFlowProvider>
    );
    const path = getEdgePath(container);
    expect(path?.style.stroke).toBe(edgeStyles.http.color);
  });

  it("has marker-end attribute for arrow direction", () => {
    const { container } = renderEdge({ connectionType: "http" });
    const path = getEdgePath(container);
    expect(path?.getAttribute("marker-end")).toBe("arrowclosed");
  });

  it("renders with bezier curve path", () => {
    const { container } = renderEdge({ connectionType: "http" });
    const path = getEdgePath(container);
    const d = path?.getAttribute("d") ?? "";
    // Bezier paths contain C command
    expect(d).toContain("C");
  });

  it("each connection type has a unique color", () => {
    const colors = Object.values(edgeStyles).map((s) => s.color);
    expect(new Set(colors).size).toBe(colors.length);
  });
});
