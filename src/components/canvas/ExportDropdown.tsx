"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Download } from "lucide-react";
import { toPng, toSvg } from "html-to-image";
import { getNodesBounds, getViewportForBounds } from "reactflow";
import type { ReactFlowInstance } from "reactflow";
import type { RefObject } from "react";

interface ExportDropdownProps {
  rfInstanceRef: RefObject<ReactFlowInstance | null>;
  projectName: string;
  onError: (message: string) => void;
}

function getUserRole(): string {
  const match = document.cookie.match(/(?:^|; )dev-role=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "admin";
}

export default function ExportDropdown({ rfInstanceRef, projectName, onError }: ExportDropdownProps) {
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

  const handleExport = useCallback(async (format: "png" | "svg") => {
    setOpen(false);

    const role = getUserRole();
    if (role === "free-user") {
      onError("AI features require a paid plan. Please upgrade to export diagrams.");
      return;
    }

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
  }, [rfInstanceRef, projectName, onError]);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        title="Export diagram"
      >
        <Download size={14} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-32 rounded-lg border border-[var(--border)] bg-[var(--background)] shadow-lg">
          <button
            onClick={() => handleExport("png")}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors rounded-t-lg"
          >
            Export PNG
          </button>
          <button
            onClick={() => handleExport("svg")}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors rounded-b-lg"
          >
            Export SVG
          </button>
        </div>
      )}
    </div>
  );
}
