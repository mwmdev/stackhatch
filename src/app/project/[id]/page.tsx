"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ChatSidebar from "@/components/chat/ChatSidebar";
import NodeDetailPanel from "@/components/canvas/NodeDetailPanel";
import AddNodeDropdown from "@/components/canvas/AddNodeDropdown";
import ConnectionTypeSelector from "@/components/canvas/ConnectionTypeSelector";
import type {
  StackNode,
  StackEdge,
  StackArchitecture,
  NodeCategory,
  NodeSubtype,
  ConnectionType,
} from "@/types/stack";
import { getSubtypeConfig } from "@/lib/node-config";
import { applyDagreLayout, type NodePosition } from "@/lib/layout";
import { mergeArchitecture } from "@/lib/merge-architecture";

interface Project {
  id: string;
  name: string;
  description: string | null;
  canvasState: StackArchitecture | null;
  createdAt: number;
  updatedAt: number;
}

interface PendingConnection {
  sourceId: string;
  targetId: string;
  position: { x: number; y: number };
}

function generateId(): string {
  return crypto.randomUUID();
}

export default function ProjectPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedNode, setSelectedNode] = useState<StackNode | null>(null);
  const [pendingConnection, setPendingConnection] =
    useState<PendingConnection | null>(null);
  const [nodePositions, setNodePositions] = useState<NodePosition[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const nodePositionsRef = useRef<NodePosition[]>([]);

  // Keep ref in sync for use in callbacks
  useEffect(() => {
    nodePositionsRef.current = nodePositions;
  }, [nodePositions]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const saveCanvasState = useCallback(
    (canvas: StackArchitecture) => {
      fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvasState: JSON.stringify(canvas) }),
      });
    },
    [projectId],
  );

  const handleArchitecture = useCallback(
    (incoming: StackArchitecture) => {
      try {
        // Validate incoming architecture has nodes
        if (!incoming?.nodes || !Array.isArray(incoming.nodes)) {
          setToast("Failed to update canvas: invalid architecture data");
          return;
        }

        setProject((prev) => {
          if (!prev) return prev;

          const currentCanvas = prev.canvasState;
          const isFirstArchitecture =
            !currentCanvas || currentCanvas.nodes.length === 0;

          let finalArchitecture: StackArchitecture;
          let positions: NodePosition[];

          if (isFirstArchitecture) {
            // First architecture: use incoming directly, full Dagre layout
            finalArchitecture = incoming;
            positions = applyDagreLayout(incoming.nodes, incoming.edges);
          } else {
            // Update: merge with locked node preservation
            const result = mergeArchitecture(
              currentCanvas,
              incoming,
              nodePositionsRef.current,
            );
            finalArchitecture = result.architecture;
            positions = applyDagreLayout(
              result.architecture.nodes,
              result.architecture.edges,
              result.fixedPositions,
            );
          }

          // Enable CSS transitions for smooth repositioning
          setAnimating(true);
          setNodePositions(positions);
          setTimeout(() => setAnimating(false), 350);

          // Save to DB (the API route already saved it, but keep local state consistent)
          return { ...prev, canvasState: finalArchitecture };
        });
      } catch {
        setToast("Failed to update canvas");
      }
    },
    [],
  );

  const handleNodeUpdate = useCallback(
    (id: string, updates: Partial<StackNode>) => {
      setProject((prev) => {
        if (!prev?.canvasState) return prev;
        const updatedNodes = prev.canvasState.nodes.map((n) =>
          n.id === id ? { ...n, ...updates } : n,
        );
        const newCanvas = { ...prev.canvasState, nodes: updatedNodes };
        saveCanvasState(newCanvas);
        return { ...prev, canvasState: newCanvas };
      });
      setSelectedNode((prev) =>
        prev && prev.id === id ? { ...prev, ...updates } : prev,
      );
    },
    [saveCanvasState],
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
        saveCanvasState(newCanvas);
        return { ...prev, canvasState: newCanvas };
      });
      setSelectedNode(null);
    },
    [saveCanvasState],
  );

  const handleClosePanel = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const handleAddNode = useCallback(
    (category: NodeCategory, subtype: NodeSubtype) => {
      const subtypeConfig = getSubtypeConfig(category, subtype);
      const newNode: StackNode = {
        id: generateId(),
        category,
        subtype,
        name: subtypeConfig?.displayName ?? subtype,
        technology: "",
        description: "",
        reasoning: "Manually added",
        locked: false,
      };

      setProject((prev) => {
        const currentCanvas = prev?.canvasState ?? { nodes: [], edges: [] };
        const newCanvas = {
          ...currentCanvas,
          nodes: [...currentCanvas.nodes, newNode],
        };
        saveCanvasState(newCanvas);
        return prev ? { ...prev, canvasState: newCanvas } : prev;
      });

      setSelectedNode(newNode);
    },
    [saveCanvasState],
  );

  const handleConnectionTypeSelect = useCallback(
    (type: ConnectionType) => {
      if (!pendingConnection) return;
      const newEdge: StackEdge = {
        id: generateId(),
        source: pendingConnection.sourceId,
        target: pendingConnection.targetId,
        connectionType: type,
        label: type.toUpperCase(),
      };

      setProject((prev) => {
        if (!prev?.canvasState) return prev;
        const newCanvas = {
          ...prev.canvasState,
          edges: [...prev.canvasState.edges, newEdge],
        };
        saveCanvasState(newCanvas);
        return { ...prev, canvasState: newCanvas };
      });
      setPendingConnection(null);
    },
    [pendingConnection, saveCanvasState],
  );

  const handleCancelConnection = useCallback(() => {
    setPendingConnection(null);
  }, []);

  const handleRelayout = useCallback(() => {
    if (!project?.canvasState) return;
    setAnimating(true);
    const positions = applyDagreLayout(
      project.canvasState.nodes,
      project.canvasState.edges,
    );
    setNodePositions(positions);
    setTimeout(() => setAnimating(false), 350);
  }, [project?.canvasState]);

  // Auto-compute positions when canvas state changes (non-animated, e.g. manual add)
  useEffect(() => {
    if (project?.canvasState?.nodes?.length) {
      setNodePositions(
        applyDagreLayout(project.canvasState.nodes, project.canvasState.edges),
      );
    } else {
      setNodePositions([]);
    }
  }, [project?.canvasState]);

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

  const hasCanvas =
    project.canvasState !== null && project.canvasState.nodes.length > 0;
  const nodeCount = project.canvasState?.nodes.length ?? 0;

  return (
    <div className="flex h-screen bg-[var(--background)] text-[var(--foreground)]">
      {/* Chat Sidebar - open by default for new projects (no canvas) */}
      <ChatSidebar
        projectId={projectId}
        defaultOpen={!hasCanvas}
        onArchitecture={handleArchitecture}
      />

      {/* Canvas Area */}
      <div className="flex flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-2">
          <Link
            href="/"
            className="mr-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            &larr;
          </Link>
          <h1 className="text-lg font-semibold">{project.name}</h1>
          <div className="ml-auto flex items-center gap-2">
            <AddNodeDropdown onAddNode={handleAddNode} />
            {nodeCount > 0 && (
              <button
                onClick={handleRelayout}
                className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                title="Re-layout nodes"
              >
                Re-layout
              </button>
            )}
            {nodeCount > 0 && (
              <span className="text-xs text-[var(--muted-foreground)]">
                {nodeCount} node{nodeCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
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
                Start a conversation or add nodes manually
              </p>
            </div>
          )}

          {/* Node canvas view with Dagre layout positioning */}
          {hasCanvas && (
            <div ref={canvasRef} className="absolute inset-0 overflow-auto p-6">
              <div className="relative" style={{ minHeight: "100%" }}>
                {project.canvasState!.nodes.map((node) => {
                  const pos = nodePositions.find((p) => p.id === node.id);
                  return (
                    <button
                      key={node.id}
                      onClick={() => setSelectedNode(node)}
                      className={`absolute rounded-lg border-l-4 bg-[var(--background)] p-4 text-left shadow-md hover:shadow-lg ${
                        selectedNode?.id === node.id
                          ? "ring-2 ring-[var(--color-client)]"
                          : ""
                      }`}
                      style={{
                        borderLeftColor: `var(--color-${node.category})`,
                        minWidth: "200px",
                        left: pos ? `${pos.position.x}px` : undefined,
                        top: pos ? `${pos.position.y}px` : undefined,
                        transition: animating
                          ? "left 300ms ease, top 300ms ease"
                          : undefined,
                      }}
                      data-testid={`node-card-${node.id}`}
                    >
                      <div className="font-medium text-[var(--foreground)]">
                        {node.name}
                      </div>
                      {node.technology && (
                        <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                          {node.technology}
                        </div>
                      )}
                      <div
                        className="mt-2 inline-block rounded-full px-2 py-0.5 text-xs text-white"
                        style={{
                          backgroundColor: `var(--color-${node.category})`,
                        }}
                      >
                        {node.category}
                      </div>
                      {node.locked && (
                        <span className="ml-2 text-xs text-[var(--color-data)]">
                          🔒
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Connection Type Selector popover */}
          {pendingConnection && (
            <ConnectionTypeSelector
              position={pendingConnection.position}
              onSelect={handleConnectionTypeSelect}
              onCancel={handleCancelConnection}
            />
          )}

          {/* Node Detail Panel (overlays canvas from right) */}
          <NodeDetailPanel
            node={selectedNode}
            onUpdate={handleNodeUpdate}
            onDelete={handleNodeDelete}
            onClose={handleClosePanel}
          />

          {/* Toast notification */}
          {toast && (
            <div
              className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white shadow-lg"
              data-testid="canvas-toast"
            >
              {toast}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
