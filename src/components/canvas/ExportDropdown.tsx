"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Download } from "lucide-react";
import { toPng, toSvg } from "html-to-image";
import { getNodesBounds, getViewportForBounds } from "reactflow";
import type { ReactFlowInstance } from "reactflow";
import type { RefObject } from "react";
import { stringify as stringifyYaml } from "yaml";
import { fromReactFlowEdges, fromReactFlowNodes } from "@/types/canvas";
import type { AlternativeNode } from "@/types/stack";
import IconControl from "@/components/ui/IconControl";
type ExportFormat = "png" | "svg" | "json" | "yaml";

interface ExportDropdownProps {
  rfInstanceRef: RefObject<ReactFlowInstance | null>;
  projectName: string;
  alternatives?: Record<string, AlternativeNode[]>;
  onError: (message: string) => void;
  placement?: "bottom" | "top";
}

export default function ExportDropdown({
  rfInstanceRef,
  projectName,
  alternatives = {},
  onError,
  placement = "bottom",
}: ExportDropdownProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const downloadTextFile = useCallback(
    (format: "json" | "yaml") => {
      const rfInstance = rfInstanceRef.current;
      if (!rfInstance) return;

      const nodes = rfInstance.getNodes();
      if (nodes.length === 0) return;

      const positions: Record<string, { x: number; y: number }> = {};
      for (const node of nodes) {
        positions[node.id] = node.position;
      }

      const payload = {
        schemaVersion: 1,
        project: { name: projectName },
        exportedAt: new Date().toISOString(),
        diagram: {
          nodes: fromReactFlowNodes(nodes),
          edges: fromReactFlowEdges(rfInstance.getEdges()),
          positions,
          alternatives,
        },
      };

      const content = format === "json" ? JSON.stringify(payload, null, 2) : stringifyYaml(payload);
      const type = format === "json" ? "application/json" : "application/yaml";
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `${projectName}.${format}`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    },
    [rfInstanceRef, projectName, alternatives]
  );

  const downloadImageFile = useCallback(
    async (format: "png" | "svg") => {
      const rfInstance = rfInstanceRef.current;
      if (!rfInstance) return;

      const nodes = rfInstance.getNodes();
      if (nodes.length === 0) return;

      const bounds = getNodesBounds(nodes);
      const padding = 50;
      const width = bounds.width + padding * 2;
      const height = bounds.height + padding * 2;
      const viewport = getViewportForBounds(bounds, width, height, 0.5, 2);

      const viewportEl = document.querySelector(".react-flow__viewport") as HTMLElement;
      if (!viewportEl) return;

      const exportFn = format === "png" ? toPng : toSvg;
      const ext = format === "png" ? "png" : "svg";

      try {
        const dataUrl = await exportFn(viewportEl, {
          width,
          height,
          style: {
            width: `${width}px`,
            height: `${height}px`,
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          },
        });

        const link = document.createElement("a");
        link.download = `${projectName}.${ext}`;
        link.href = dataUrl;
        link.click();
      } catch {
        onError(`Failed to export as ${format.toUpperCase()}`);
      }
    },
    [rfInstanceRef, projectName, onError]
  );

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      setOpen(false);
      try {
        if (format === "json" || format === "yaml") {
          downloadTextFile(format);
          return;
        }
        await downloadImageFile(format);
      } catch {
        onError(`Failed to export as ${format.toUpperCase()}`);
      }
    },
    [downloadImageFile, downloadTextFile, onError]
  );

  return (
    <div ref={dropdownRef} className="relative">
      <IconControl
        label="Export map"
        tooltipPlacement="bottom"
        variant="outline"
        pressed={open}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="h-11 w-11"
      >
        <Download size={14} />
      </IconControl>

      {open && (
        <div
          className={`absolute right-0 z-30 w-36 rounded-lg border border-[var(--border)] bg-[var(--background)] shadow-lg ${
            placement === "top" ? "bottom-full mb-2" : "top-full mt-1"
          }`}
          data-placement={placement}
          data-testid="export-dropdown"
        >
          {(["png", "svg", "json", "yaml"] as const).map((format, index, formats) => (
            <button
              key={format}
              onClick={() => handleExport(format)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] ${
                index === 0 ? "rounded-t-lg" : ""
              } ${index === formats.length - 1 ? "rounded-b-lg" : ""}`}
            >
              Export {format.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
