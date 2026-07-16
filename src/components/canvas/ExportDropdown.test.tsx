import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { parse as parseYaml } from "yaml";
import type { RefObject } from "react";
import type { ReactFlowInstance } from "reactflow";
import { toPng, toSvg } from "html-to-image";
import ExportDropdown from "./ExportDropdown";

vi.mock("html-to-image", () => ({
  toPng: vi.fn().mockResolvedValue("data:image/png;base64,test"),
  toSvg: vi.fn().mockResolvedValue("data:image/svg+xml;base64,test"),
}));

vi.mock("reactflow", () => ({
  getNodesBounds: vi.fn(() => ({ x: 0, y: 0, width: 400, height: 300 })),
  getViewportForBounds: vi.fn(() => ({ x: 50, y: 50, zoom: 1 })),
}));

const sampleNodes = [
  {
    id: "node-1",
    type: "stackNode",
    position: { x: 120, y: 240 },
    data: {
      category: "client",
      subtype: "web-app",
      name: "Frontend",
      technology: "React",
      description: "User interface",
      reasoning: "Fast iteration",
      locked: false,
      onDelete: vi.fn(),
    },
  },
  {
    id: "node-2",
    type: "stackNode",
    position: { x: 520, y: 240 },
    data: {
      category: "api",
      subtype: "rest-api",
      name: "API",
      technology: "Next.js",
      description: "Backend API",
      reasoning: "Shared framework",
      locked: true,
      onLockToggle: vi.fn(),
    },
  },
];

const sampleEdges = [
  {
    id: "edge-1",
    type: "stackEdge",
    source: "node-1",
    target: "node-2",
    data: {
      connectionType: "http",
      label: "REST",
      onLabelChange: vi.fn(),
    },
  },
];

function makeRef(): RefObject<ReactFlowInstance | null> {
  return {
    current: {
      getNodes: () => sampleNodes,
      getEdges: () => sampleEdges,
    } as unknown as ReactFlowInstance,
  };
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe("ExportDropdown", () => {
  let capturedBlob: Blob | null;
  let clickedAnchor: HTMLAnchorElement | null;

  beforeEach(() => {
    capturedBlob = null;
    clickedAnchor = null;
    document.body.innerHTML = "";
    vi.clearAllMocks();

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        capturedBlob = blob;
        return "blob:stackhatch-export";
      }),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      clickedAnchor = this;
    });
  });

  it("exposes a named 44px secondary utility and configurable menu placement", () => {
    render(
      <ExportDropdown
        rfInstanceRef={makeRef()}
        projectName="My App"
        onError={vi.fn()}
        placement="bottom"
      />
    );

    const trigger = screen.getByRole("button", { name: "Export map" });
    expect(trigger).toHaveClass("icon-control");
    expect(trigger).toHaveClass("icon-control");
    expect(trigger).toHaveAttribute("aria-describedby");
    expect(screen.getByRole("tooltip", { name: "Export map" })).toHaveAttribute(
      "data-placement",
      "bottom"
    );
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("export-dropdown")).toHaveAttribute("data-placement", "bottom");
  });

  it("renders PNG, SVG, JSON, and YAML export options", () => {
    render(<ExportDropdown rfInstanceRef={makeRef()} projectName="My App" onError={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("Export map"));

    expect(screen.getByText("Export PNG")).toBeInTheDocument();
    expect(screen.getByText("Export SVG")).toBeInTheDocument();
    expect(screen.getByText("Export JSON")).toBeInTheDocument();
    expect(screen.getByText("Export YAML")).toBeInTheDocument();
  });

  it("downloads a clean JSON diagram payload", async () => {
    render(
      <ExportDropdown
        rfInstanceRef={makeRef()}
        projectName="My App"
        alternatives={{
          "node-1": [
            {
              name: "Vue Frontend",
              technology: "Vue",
              description: "Alternative UI",
              reasoning: "Team preference",
              category: "client",
              subtype: "web-app",
            },
          ],
        }}
        onError={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText("Export map"));
    fireEvent.click(screen.getByText("Export JSON"));

    expect(clickedAnchor?.download).toBe("My App.json");
    expect(capturedBlob?.type).toBe("application/json");

    const payload = JSON.parse(await readBlob(capturedBlob!));
    expect(payload).toMatchObject({
      schemaVersion: 1,
      project: { name: "My App" },
      diagram: {
        nodes: [
          {
            id: "node-1",
            category: "client",
            subtype: "web-app",
            name: "Frontend",
            technology: "React",
            description: "User interface",
            reasoning: "Fast iteration",
            locked: false,
          },
          {
            id: "node-2",
            category: "api",
            subtype: "rest-api",
            name: "API",
            technology: "Next.js",
            description: "Backend API",
            reasoning: "Shared framework",
            locked: true,
          },
        ],
        edges: [
          {
            id: "edge-1",
            source: "node-1",
            target: "node-2",
            connectionType: "http",
            label: "REST",
          },
        ],
        positions: {
          "node-1": { x: 120, y: 240 },
          "node-2": { x: 520, y: 240 },
        },
      },
    });
    expect(payload.exportedAt).toEqual(expect.any(String));
    expect(payload.diagram.nodes[0]).not.toHaveProperty("onDelete");
    expect(payload.diagram.edges[0]).not.toHaveProperty("onLabelChange");
    expect(payload.diagram.alternatives["node-1"][0].technology).toBe("Vue");
  });

  it("downloads a YAML diagram payload", async () => {
    render(<ExportDropdown rfInstanceRef={makeRef()} projectName="My App" onError={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("Export map"));
    fireEvent.click(screen.getByText("Export YAML"));

    expect(clickedAnchor?.download).toBe("My App.yaml");
    expect(capturedBlob?.type).toBe("application/yaml");

    const payload = parseYaml(await readBlob(capturedBlob!));
    expect(payload.project.name).toBe("My App");
    expect(payload.diagram.nodes[0].technology).toBe("React");
    expect(payload.diagram.positions["node-2"]).toEqual({ x: 520, y: 240 });
  });

  it("keeps PNG and SVG image exports wired to html-to-image", async () => {
    const viewport = document.createElement("div");
    viewport.className = "react-flow__viewport";
    document.body.appendChild(viewport);

    render(<ExportDropdown rfInstanceRef={makeRef()} projectName="My App" onError={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("Export map"));
    fireEvent.click(screen.getByText("Export PNG"));
    await vi.waitFor(() => expect(toPng).toHaveBeenCalledWith(viewport, expect.any(Object)));

    fireEvent.click(screen.getByLabelText("Export map"));
    fireEvent.click(screen.getByText("Export SVG"));
    await vi.waitFor(() => expect(toSvg).toHaveBeenCalledWith(viewport, expect.any(Object)));
  });
});
