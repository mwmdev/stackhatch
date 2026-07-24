"use client";

import { useCallback, useId, useRef } from "react";
import { Download } from "lucide-react";
import { toPng, toSvg } from "html-to-image";
import { getNodesBounds, getViewportForBounds } from "reactflow";
import type { ReactFlowInstance } from "reactflow";
import type { RefObject } from "react";
import { stringify as stringifyYaml } from "yaml";
import { fromReactFlowEdges, fromReactFlowNodes } from "@/types/canvas";
import type { AlternativeNode } from "@/types/stack";
import IconControl from "@/components/ui/IconControl";
import { exportProjectBackup } from "@/lib/vault/backup";
import { createVaultRepository } from "@/lib/vault/repository";

type ExportFormat = "png" | "svg" | "json" | "yaml";

interface ExportDropdownProps {
  rfInstanceRef: RefObject<ReactFlowInstance | null>;
  projectId?: string;
  projectName: string;
  alternatives?: Record<string, AlternativeNode[]>;
  createProjectBackup?: () => Promise<string>;
  diagramAvailable?: boolean;
  onError: (message: string) => void;
  placement?: "bottom" | "top";
}

export default function ExportDropdown({
  rfInstanceRef,
  projectId,
  projectName,
  alternatives = {},
  createProjectBackup,
  diagramAvailable = true,
  onError,
  placement = "bottom",
}: ExportDropdownProps) {
  const panelId = `export-popover-${useId()}`;
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const closeAndRestoreFocus = useCallback(() => {
    panelRef.current?.hidePopover?.();
    triggerRef.current?.focus();
  }, []);

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
      closeAndRestoreFocus();
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
    [closeAndRestoreFocus, downloadImageFile, downloadTextFile, onError]
  );

  const handleProjectBackup = useCallback(async () => {
    closeAndRestoreFocus();
    try {
      let content: string;
      if (createProjectBackup) {
        content = await createProjectBackup();
      } else {
        if (!projectId) throw new Error("The local project is unavailable");
        const repository = createVaultRepository();
        try {
          content = await exportProjectBackup(repository, projectId);
        } finally {
          repository.close();
        }
      }
      const blob = new Blob([content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `${projectName}.stackhatch.json`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Failed to back up this map");
    }
  }, [closeAndRestoreFocus, createProjectBackup, onError, projectId, projectName]);

  return (
    <div className="flex-none">
      <IconControl
        controlRef={triggerRef}
        label="Export map"
        tooltipPlacement="bottom"
        variant="outline"
        popoverTarget={panelId}
        popoverTargetAction="toggle"
      >
        <Download />
      </IconControl>

      <div
        ref={panelRef}
        id={panelId}
        popover="auto"
        className={`fixed inset-auto right-4 z-50 m-0 w-52 rounded-[var(--radius-surface)] border border-[var(--border)] bg-[var(--surface-raised)] p-1 shadow-xl ${
          placement === "top" ? "bottom-16" : "top-16"
        }`}
        data-placement={placement}
        data-testid="export-dropdown"
      >
        {(projectId || createProjectBackup) && (
          <>
            <p className="px-3 pb-1 pt-2 font-utility text-[0.625rem] font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
              Portable backup
            </p>
            <button
              type="button"
              onClick={() => void handleProjectBackup()}
              className="flex min-h-11 w-full items-center rounded-[var(--radius-control)] px-3 py-2 text-left text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              Back up this map
            </button>
            <div className="my-1 border-t border-[var(--border)]" />
          </>
        )}
        {diagramAvailable ? (
          <>
            <p className="px-3 pb-1 pt-2 font-utility text-[0.625rem] font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
              Diagram files
            </p>
            {(["png", "svg", "json", "yaml"] as const).map((format) => (
              <button
                type="button"
                key={format}
                onClick={() => handleExport(format)}
                className="flex min-h-11 w-full items-center rounded-[var(--radius-control)] px-3 py-2 text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                Export {format.toUpperCase()}
              </button>
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}
