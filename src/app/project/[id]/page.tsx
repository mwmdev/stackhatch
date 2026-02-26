"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ChatSidebar from "@/components/chat/ChatSidebar";
import NodeDetailPanel from "@/components/canvas/NodeDetailPanel";
import type { StackNode, StackArchitecture } from "@/types/stack";

interface Project {
  id: string;
  name: string;
  description: string | null;
  canvasState: StackArchitecture | null;
  createdAt: number;
  updatedAt: number;
}

export default function ProjectPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedNode, setSelectedNode] = useState<StackNode | null>(null);

  const handleNodeUpdate = useCallback(
    (id: string, updates: Partial<StackNode>) => {
      setProject((prev) => {
        if (!prev?.canvasState) return prev;
        const updatedNodes = prev.canvasState.nodes.map((n) =>
          n.id === id ? { ...n, ...updates } : n,
        );
        const newCanvas = { ...prev.canvasState, nodes: updatedNodes };
        // Debounced save will be handled by the canvas component (T-009)
        fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ canvasState: JSON.stringify(newCanvas) }),
        });
        return { ...prev, canvasState: newCanvas };
      });
      // Update selected node in-place
      setSelectedNode((prev) =>
        prev && prev.id === id ? { ...prev, ...updates } : prev,
      );
    },
    [projectId],
  );

  const handleNodeDelete = useCallback(
    (id: string) => {
      setProject((prev) => {
        if (!prev?.canvasState) return prev;
        const updatedNodes = prev.canvasState.nodes.filter((n) => n.id !== id);
        const updatedEdges = prev.canvasState.edges.filter(
          (e) => e.source !== id && e.target !== id,
        );
        const newCanvas = { nodes: updatedNodes, edges: updatedEdges };
        fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ canvasState: JSON.stringify(newCanvas) }),
        });
        return { ...prev, canvasState: newCanvas };
      });
      setSelectedNode(null);
    },
    [projectId],
  );

  const handleClosePanel = useCallback(() => {
    setSelectedNode(null);
  }, []);

  useEffect(() => {
    async function loadProject() {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (!res.ok) {
          setError("Project not found");
          return;
        }
        const data = await res.json();
        setProject(data);
      } catch {
        setError("Failed to load project");
      } finally {
        setLoading(false);
      }
    }
    loadProject();
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] text-[var(--muted-foreground)]">
        Loading...
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)]">
        <p className="mb-4 text-red-500">{error || "Project not found"}</p>
        <Link href="/" className="text-[var(--color-client)] hover:underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const hasCanvas = project.canvasState !== null;

  return (
    <div className="flex h-screen bg-[var(--background)] text-[var(--foreground)]">
      {/* Chat Sidebar - open by default for new projects (no canvas) */}
      <ChatSidebar projectId={projectId} defaultOpen={!hasCanvas} />

      {/* Canvas Area */}
      <div className="flex flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex items-center border-b border-[var(--border)] px-4 py-2">
          <Link
            href="/"
            className="mr-4 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            &larr;
          </Link>
          <h1 className="text-lg font-semibold">{project.name}</h1>
        </div>

        {/* Canvas area (relative container for detail panel overlay) */}
        <div className="relative flex flex-1 items-center justify-center overflow-hidden">
          {!hasCanvas && (
            <div className="text-center text-[var(--muted-foreground)]">
              <svg
                className="mx-auto mb-4 h-16 w-16 opacity-30"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <circle cx="15.5" cy="8.5" r="1.5" />
                <circle cx="12" cy="15.5" r="1.5" />
                <line x1="8.5" y1="10" x2="12" y2="14" />
                <line x1="15.5" y1="10" x2="12" y2="14" />
              </svg>
              <p className="text-lg font-medium">No architecture yet</p>
              <p className="mt-1 text-sm">
                Start a conversation to generate your architecture
              </p>
            </div>
          )}

          {/* Node Detail Panel (overlays canvas from right) */}
          <NodeDetailPanel
            node={selectedNode}
            onUpdate={handleNodeUpdate}
            onDelete={handleNodeDelete}
            onClose={handleClosePanel}
          />
        </div>
      </div>
    </div>
  );
}
