"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Download, Loader2 } from "lucide-react";
import { toPng, toSvg } from "html-to-image";
import { getNodesBounds, getViewportForBounds } from "reactflow";
import type { ReactFlowInstance } from "reactflow";
import type { RefObject } from "react";
import { stringify as stringifyYaml } from "yaml";
import { fromReactFlowEdges, fromReactFlowNodes } from "@/types/canvas";
import type { AlternativeNode } from "@/types/stack";
import { exportProjectBackup } from "@/lib/vault/backup";
import { createVaultRepository } from "@/lib/vault/repository";
import { activatePopoverTriggerOnSpace } from "@/components/ui/IconControl";

type ExportFormat = "png" | "svg" | "json" | "yaml";

interface ExportDropdownProps {
  rfInstanceRef: RefObject<ReactFlowInstance | null>;
  projectId?: string;
  projectName: string;
  alternatives?: Record<string, AlternativeNode[]>;
  createProjectBackup?: () => Promise<string>;
  beforeProjectBackup?: () => Promise<void>;
  diagramAvailable?: boolean;
  /** Costs an AI provider call, so it is labelled and grouped apart. */
  onGeneratePrd?: () => void;
  prdPending?: boolean;
  onError: (message: string) => void;
}

/**
 * Map names come from Markdown headings and repository paths, so they can carry
 * separators and run long. Browsers treat "/" in a download name as a path.
 */
function safeFileName(name: string) {
  const cleaned = name
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .replace(/[.\s-]+$/, "");
  return cleaned || "stackhatch-map";
}

export default function ExportDropdown({
  rfInstanceRef,
  projectId,
  projectName,
  alternatives = {},
  createProjectBackup,
  beforeProjectBackup,
  diagramAvailable = true,
  onGeneratePrd,
  prdPending = false,
  onError,
}: ExportDropdownProps) {
  const panelId = `export-popover-${useId()}`;
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);

  // The menu lives in the top layer, so it is placed against its trigger each
  // time it opens: under it, right edges aligned, clamped into the viewport.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const place = (event: Event) => {
      if ((event as ToggleEvent).newState !== "open") return;
      const trigger = triggerRef.current?.getBoundingClientRect();
      if (!trigger) return;
      panel.style.top = `${Math.round(trigger.bottom + 6)}px`;
      panel.style.right = `${Math.max(8, Math.round(window.innerWidth - trigger.right))}px`;
    };
    const sync = (event: Event) => setOpen((event as ToggleEvent).newState === "open");
    panel.addEventListener("beforetoggle", place);
    panel.addEventListener("toggle", sync);
    return () => {
      panel.removeEventListener("beforetoggle", place);
      panel.removeEventListener("toggle", sync);
    };
  }, []);

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
      link.download = `${safeFileName(projectName)}.${format}`;
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
        link.download = `${safeFileName(projectName)}.${ext}`;
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
      if (beforeProjectBackup) await beforeProjectBackup();
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
      link.download = `${safeFileName(projectName)}.stackhatch.json`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Failed to back up this map");
    }
  }, [
    beforeProjectBackup,
    closeAndRestoreFocus,
    createProjectBackup,
    onError,
    projectId,
    projectName,
  ]);

  return (
    <div className="flex-none">
      <button
        ref={triggerRef}
        type="button"
        className="frame-btn"
        aria-label="Export map"
        aria-expanded={open}
        aria-busy={prdPending}
        onKeyDown={activatePopoverTriggerOnSpace}
        popoverTarget={panelId}
        popoverTargetAction="toggle"
        data-testid="export-trigger"
      >
        {prdPending ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : (
          <Download aria-hidden="true" />
        )}
        <span className="max-[641px]:sr-only">Export</span>
        <ChevronDown aria-hidden="true" className="max-[641px]:hidden" />
      </button>
      {prdPending ? (
        <span role="status" className="sr-only">
          Generating PRD
        </span>
      ) : null}

      <div
        ref={panelRef}
        id={panelId}
        popover="auto"
        className="menu fixed inset-auto top-14 right-2 m-0 w-56"
        data-testid="export-dropdown"
      >
        {diagramAvailable ? (
          <>
            <p className="menu__label">Diagram files</p>
            {(["png", "svg", "json", "yaml"] as const).map((format) => (
              <button
                type="button"
                key={format}
                onClick={() => handleExport(format)}
                className="menu__item"
              >
                Export {format.toUpperCase()}
              </button>
            ))}
          </>
        ) : null}
        {(projectId || createProjectBackup) && (
          <>
            {diagramAvailable ? <hr className="menu__rule" /> : null}
            <p className="menu__label">Portable backup</p>
            <button type="button" onClick={() => void handleProjectBackup()} className="menu__item">
              Back up this map
            </button>
          </>
        )}
        {diagramAvailable && onGeneratePrd ? (
          <>
            <hr className="menu__rule" />
            <p className="menu__label">Documents</p>
            <button
              type="button"
              disabled={prdPending}
              onClick={() => {
                closeAndRestoreFocus();
                onGeneratePrd();
              }}
              className="menu__item"
            >
              {prdPending ? "Generating PRD..." : "Generate PRD"}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
