"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  type Node,
  type Edge,
  type Connection,
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import ChatSidebar from "@/components/chat/ChatSidebar";
import NodeDetailPanel from "@/components/canvas/NodeDetailPanel";
import AddNodeDropdown from "@/components/canvas/AddNodeDropdown";
import ConnectionTypeSelector from "@/components/canvas/ConnectionTypeSelector";
import StackNodeComponent, {
  type StackNodeData,
} from "@/components/canvas/StackNode";
import StackEdgeComponent, {
  type StackEdgeData,
} from "@/components/canvas/StackEdge";
import EdgeLegend from "@/components/canvas/EdgeLegend";
import ExportDropdown from "@/components/canvas/ExportDropdown";
import UserAvatar from "@/components/UserAvatar";
import {
  toReactFlowNodes,
  toReactFlowEdges,
  fromReactFlowNodes,
  fromReactFlowEdges,
} from "@/types/canvas";
import type {
  StackNode,
  StackArchitecture,
  NodeCategory,
  NodeSubtype,
  ConnectionType,
  AlternativeNode,
} from "@/types/stack";
import { getSubtypeConfig } from "@/lib/node-config";
import { applyDagreLayout } from "@/lib/layout";
import { mergeArchitecture } from "@/lib/merge-architecture";
import { parseCustomSubtypes, type CustomSubtypesMap } from "@/lib/custom-subtypes";

interface Project {
  id: string;
  name: string;
  description: string | null;
  repoUrl: string | null;
  canvasState: StackArchitecture | null;
  teamId: string | null;
  createdAt: number;
  updatedAt: number;
}

interface PendingConnection {
  sourceId: string;
  targetId: string;
  position: { x: number; y: number };
}

/** Stored canvasState extends StackArchitecture with persisted positions */
interface StoredCanvasState extends StackArchitecture {
  positions?: Record<string, { x: number; y: number }>;
  alternatives?: Record<string, AlternativeNode[]>;
}

const nodeTypes = { stackNode: StackNodeComponent };
const edgeTypes = { stackEdge: StackEdgeComponent };

const MINIMAP_COLORS: Record<string, string> = {
  client: "#3B82F6",
  api: "#10B981",
  services: "#8B5CF6",
  data: "#F59E0B",
  infrastructure: "#64748B",
  external: "#F43F5E",
};

export default function ProjectPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedNode, setSelectedNode] = useState<StackNode | null>(null);
  const [pendingConnection, setPendingConnection] =
    useState<PendingConnection | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [customSubtypes, setCustomSubtypes] = useState<CustomSubtypesMap>({});
  const [scanTrigger, setScanTrigger] = useState(0);
  const [chatStreaming, setChatStreaming] = useState(false);
  const [showScanInput, setShowScanInput] = useState(false);
  const [scanUrlInput, setScanUrlInput] = useState("");
  const [alternatives, setAlternatives] = useState<Record<string, AlternativeNode[]>>({});
  const [altLoading, setAltLoading] = useState(false);
  const [prdLoading, setPrdLoading] = useState(false);
  const [saveTemplateModalOpen, setSaveTemplateModalOpen] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<StackNodeData>(
    [],
  );
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<StackEdgeData>(
    [],
  );
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const projectRef = useRef<Project | null>(null);
  const initializedRef = useRef(false);
  const alternativesRef = useRef<Record<string, AlternativeNode[]>>({});

  // Keep refs in sync for use in stable callbacks
  projectRef.current = project;
  alternativesRef.current = alternatives;

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // --- Stable callbacks for node data (context menu actions) ---

  const handleLockToggle = useCallback(
    (id: string, locked: boolean) => {
      setRfNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, locked } } : n,
        ),
      );
      setProject((prev) => {
        if (!prev?.canvasState) return prev;
        return {
          ...prev,
          canvasState: {
            ...prev.canvasState,
            nodes: prev.canvasState.nodes.map((n) =>
              n.id === id ? { ...n, locked } : n,
            ),
          },
        };
      });
      setSelectedNode((prev) =>
        prev && prev.id === id ? { ...prev, locked } : prev,
      );
    },
    [setRfNodes],
  );

  const handleNodeDelete = useCallback(
    (id: string) => {
      setRfNodes((nds) => nds.filter((n) => n.id !== id));
      setRfEdges((eds) =>
        eds.filter((e) => e.source !== id && e.target !== id),
      );
      setProject((prev) => {
        if (!prev?.canvasState) return prev;
        return {
          ...prev,
          canvasState: {
            nodes: prev.canvasState.nodes.filter((n) => n.id !== id),
            edges: prev.canvasState.edges.filter(
              (e) => e.source !== id && e.target !== id,
            ),
          },
        };
      });
      setSelectedNode(null);
    },
    [setRfNodes, setRfEdges],
  );

  // --- Debounced save ---

  const debouncedSave = useCallback(
    (nodes: Node<StackNodeData>[], edges: Edge<StackEdgeData>[]) => {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const stackNodes = fromReactFlowNodes(nodes);
        const stackEdges = fromReactFlowEdges(edges);
        const positions: Record<string, { x: number; y: number }> = {};
        for (const node of nodes) {
          positions[node.id] = node.position;
        }
        const stored: StoredCanvasState = {
          nodes: stackNodes,
          edges: stackEdges,
          positions,
          alternatives: alternativesRef.current,
        };
        fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ canvasState: JSON.stringify(stored) }),
        });
        // Keep project domain state in sync
        setProject((prev) =>
          prev
            ? {
                ...prev,
                canvasState: { nodes: stackNodes, edges: stackEdges },
              }
            : prev,
        );
      }, 500);
    },
    [projectId],
  );

  // Trigger debounced save when React Flow state changes
  useEffect(() => {
    if (!initializedRef.current) return;
    if (rfNodes.length === 0 && rfEdges.length === 0) return;
    debouncedSave(rfNodes, rfEdges);
  }, [rfNodes, rfEdges, debouncedSave]);

  // Clean up save timer on unmount
  useEffect(() => {
    return () => clearTimeout(saveTimerRef.current);
  }, []);

  // --- Build React Flow nodes with injected callbacks ---

  const buildRfNodes = useCallback(
    (
      nodes: StackNode[],
      positions: Map<string, { x: number; y: number }>,
    ): Node<StackNodeData>[] => {
      return toReactFlowNodes(nodes, positions).map((n) => ({
        ...n,
        data: {
          ...n.data,
          customSubtypes,
          onLockToggle: handleLockToggle,
          onDelete: handleNodeDelete,
        },
      }));
    },
    [handleLockToggle, handleNodeDelete, customSubtypes],
  );

  // --- React Flow event handlers ---

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node<StackNodeData>) => {
      const data = node.data;
      setSelectedNode({
        id: node.id,
        category: data.category,
        subtype: data.subtype,
        name: data.name,
        technology: data.technology,
        description: data.description,
        reasoning: data.reasoning,
        locked: data.locked,
      });
    },
    [],
  );

  const handleConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    setPendingConnection({
      sourceId: connection.source,
      targetId: connection.target,
      position: { x: 300, y: 300 },
    });
  }, []);

  // --- Connection type selected ---

  const handleConnectionTypeSelect = useCallback(
    (type: ConnectionType) => {
      if (!pendingConnection) return;
      const id = crypto.randomUUID();
      const rfEdge: Edge<StackEdgeData> = {
        id,
        type: "stackEdge",
        source: pendingConnection.sourceId,
        target: pendingConnection.targetId,
        data: { connectionType: type, label: type.toUpperCase() },
      };
      setRfEdges((eds) => [...eds, rfEdge]);
      setProject((prev) => {
        if (!prev?.canvasState) return prev;
        return {
          ...prev,
          canvasState: {
            ...prev.canvasState,
            edges: [
              ...prev.canvasState.edges,
              {
                id,
                source: pendingConnection.sourceId,
                target: pendingConnection.targetId,
                connectionType: type,
                label: type.toUpperCase(),
              },
            ],
          },
        };
      });
      setPendingConnection(null);
    },
    [pendingConnection, setRfEdges],
  );

  const handleCancelConnection = useCallback(() => {
    setPendingConnection(null);
  }, []);

  // --- Edge label editing ---

  const handleEdgeLabelChange = useCallback(
    (edgeId: string, newLabel: string) => {
      setRfEdges((eds) =>
        eds.map((e) =>
          e.id === edgeId ? { ...e, data: { ...e.data!, label: newLabel } } : e,
        ),
      );
      setProject((prev) => {
        if (!prev?.canvasState) return prev;
        return {
          ...prev,
          canvasState: {
            ...prev.canvasState,
            edges: prev.canvasState.edges.map((e) =>
              e.id === edgeId ? { ...e, label: newLabel } : e,
            ),
          },
        };
      });
    },
    [setRfEdges],
  );

  const edgesWithCallbacks = useMemo(
    () =>
      rfEdges.map((e) => ({
        ...e,
        data: { ...e.data!, onLabelChange: handleEdgeLabelChange },
      })),
    [rfEdges, handleEdgeLabelChange],
  );

  // --- Export PRD ---

  const handleExportPrd = useCallback(async () => {
    if (!project) return;
    setPrdLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/export-prd`, {
        method: "POST",
      });
      if (res.status === 403) {
        setToast("AI features require a paid plan. Please upgrade to export PRD.");
        return;
      }
      if (!res.ok) {
        const data = await res.json();
        setToast(data.error || "Failed to generate PRD");
        return;
      }
      const { prd, projectName } = await res.json();
      const blob = new Blob([prd], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `${projectName}-prd.md`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setToast("Failed to generate PRD");
    } finally {
      setPrdLoading(false);
    }
  }, [project, projectId]);

  // --- Add node ---

  const handleAddNode = useCallback(
    (category: NodeCategory, subtype: NodeSubtype) => {
      const subtypeConfig = getSubtypeConfig(category, subtype, customSubtypes);
      const id = crypto.randomUUID();
      const newStackNode: StackNode = {
        id,
        category,
        subtype,
        name: subtypeConfig?.displayName ?? subtype,
        technology: "",
        description: "",
        reasoning: "Manually added",
        locked: false,
      };

      // Position at viewport center
      const position = rfInstanceRef.current?.screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      }) ?? { x: 200, y: 200 };

      const rfNode: Node<StackNodeData> = {
        id,
        type: "stackNode",
        position,
        data: {
          category: newStackNode.category,
          subtype: newStackNode.subtype,
          name: newStackNode.name,
          technology: newStackNode.technology,
          description: newStackNode.description,
          reasoning: newStackNode.reasoning,
          locked: newStackNode.locked,
          customSubtypes,
          onLockToggle: handleLockToggle,
          onDelete: handleNodeDelete,
        },
      };

      setRfNodes((nds) => [...nds, rfNode]);
      setProject((prev) => {
        const currentCanvas = prev?.canvasState ?? { nodes: [], edges: [] };
        return prev
          ? {
              ...prev,
              canvasState: {
                ...currentCanvas,
                nodes: [...currentCanvas.nodes, newStackNode],
              },
            }
          : prev;
      });
      setSelectedNode(newStackNode);
    },
    [handleLockToggle, handleNodeDelete, setRfNodes, customSubtypes],
  );

  // --- Detail panel update ---

  const handleNodeUpdate = useCallback(
    (id: string, updates: Partial<StackNode>) => {
      setRfNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...updates } } : n,
        ),
      );
      setProject((prev) => {
        if (!prev?.canvasState) return prev;
        return {
          ...prev,
          canvasState: {
            ...prev.canvasState,
            nodes: prev.canvasState.nodes.map((n) =>
              n.id === id ? { ...n, ...updates } : n,
            ),
          },
        };
      });
      setSelectedNode((prev) =>
        prev && prev.id === id ? { ...prev, ...updates } : prev,
      );
    },
    [setRfNodes],
  );

  const handleClosePanel = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // --- Suggest alternatives ---

  const handleSuggestAlternatives = useCallback(async () => {
    const node = selectedNode;
    if (!node) return;
    setAltLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/alternatives`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          node: {
            name: node.name,
            technology: node.technology,
            category: node.category,
            subtype: node.subtype,
            description: node.description,
          },
        }),
      });
      if (res.status === 403) {
        setToast("AI features require a paid plan. Please upgrade to use alternatives.");
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      if (data.alternatives) {
        setAlternatives((prev) => ({ ...prev, [node.id]: data.alternatives }));
      }
    } finally {
      setAltLoading(false);
    }
  }, [selectedNode, projectId]);

  // --- Swap alternative ---

  const handleSwapAlternative = useCallback(
    (alt: AlternativeNode) => {
      const node = selectedNode;
      if (!node) return;

      // Save current node data as an alternative
      const currentAsAlt: AlternativeNode = {
        name: node.name,
        technology: node.technology,
        description: node.description,
        reasoning: node.reasoning,
        category: node.category,
        subtype: node.subtype,
      };

      // Apply alternative fields to canvas node
      handleNodeUpdate(node.id, {
        name: alt.name,
        technology: alt.technology,
        description: alt.description,
        reasoning: alt.reasoning,
        category: alt.category,
        subtype: alt.subtype,
      });

      // Swap in alternatives list: remove the swapped-in, add the swapped-out
      setAlternatives((prev) => {
        const list = prev[node.id] ?? [];
        const updated = list.filter(
          (a) => a.technology !== alt.technology || a.name !== alt.name,
        );
        updated.push(currentAsAlt);
        return { ...prev, [node.id]: updated };
      });
    },
    [selectedNode, handleNodeUpdate],
  );

  // --- Save as template ---

  const handleSaveAsTemplate = useCallback(async (templateName: string, templateDescription?: string) => {
    if (!project?.teamId) return;

    setTemplateSaving(true);
    try {
      // Get current canvas state
      const stackNodes = fromReactFlowNodes(rfNodes);
      const stackEdges = fromReactFlowEdges(rfEdges);
      const positions: Record<string, { x: number; y: number }> = {};
      for (const node of rfNodes) {
        positions[node.id] = node.position;
      }
      const canvasState = {
        nodes: stackNodes,
        edges: stackEdges,
        positions,
      };

      const res = await fetch(`/api/teams/${project.teamId}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateName,
          description: templateDescription,
          canvasState: JSON.stringify(canvasState),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setToast(data.error || "Failed to save template");
        return;
      }

      setToast("Template saved successfully!");
      setSaveTemplateModalOpen(false);
    } catch {
      setToast("Failed to save template");
    } finally {
      setTemplateSaving(false);
    }
  }, [project?.teamId, rfNodes, rfEdges]);

  // --- Re-layout ---

  const handleRelayout = useCallback(() => {
    const canvas = projectRef.current?.canvasState;
    if (!canvas) return;
    const positions = applyDagreLayout(canvas.nodes, canvas.edges);
    const posMap = new Map(positions.map((p) => [p.id, p.position]));
    setRfNodes((nds) =>
      nds.map((n) => ({
        ...n,
        position: posMap.get(n.id) ?? n.position,
      })),
    );
    setTimeout(
      () => rfInstanceRef.current?.fitView({ padding: 0.2, duration: 300 }),
      100,
    );
  }, [setRfNodes]);

  // --- AI architecture handler ---

  const handleArchitecture = useCallback(
    (incoming: StackArchitecture) => {
      try {
        if (!incoming?.nodes || !Array.isArray(incoming.nodes)) {
          setToast("Failed to update canvas: invalid architecture data");
          return;
        }

        const currentCanvas = projectRef.current?.canvasState;
        const isFirst = !currentCanvas || currentCanvas.nodes.length === 0;

        let finalArch: StackArchitecture;
        let posMap: Map<string, { x: number; y: number }>;

        if (isFirst) {
          finalArch = incoming;
          const positions = applyDagreLayout(incoming.nodes, incoming.edges);
          posMap = new Map(positions.map((p) => [p.id, p.position]));
        } else {
          // Get current positions from React Flow nodes
          const currentRfNodes = rfNodes;
          const currentPositions = currentRfNodes.map((n) => ({
            id: n.id,
            position: n.position,
          }));
          const result = mergeArchitecture(
            currentCanvas,
            incoming,
            currentPositions,
          );
          finalArch = result.architecture;
          const positions = applyDagreLayout(
            result.architecture.nodes,
            result.architecture.edges,
            result.fixedPositions,
          );
          posMap = new Map(positions.map((p) => [p.id, p.position]));
        }

        const newRfNodes = buildRfNodes(finalArch.nodes, posMap);
        const newRfEdges = toReactFlowEdges(finalArch.edges);

        setRfNodes(newRfNodes);
        setRfEdges(newRfEdges);
        setProject((prev) =>
          prev ? { ...prev, canvasState: finalArch } : prev,
        );

        setTimeout(
          () =>
            rfInstanceRef.current?.fitView({ padding: 0.2, duration: 300 }),
          100,
        );
      } catch {
        setToast("Failed to update canvas");
      }
    },
    [rfNodes, buildRfNodes, setRfNodes, setRfEdges],
  );

  // --- MiniMap node color ---

  const minimapNodeColor = useCallback((node: Node) => {
    const cat = (node.data as StackNodeData)?.category;
    return MINIMAP_COLORS[cat] ?? "#888";
  }, []);

  // --- Load project ---

  useEffect(() => {
    async function loadProject() {
      try {
        // Fetch custom subtypes in parallel
        fetch("/api/settings")
          .then((r) => r.json())
          .then((s) => {
            if (s.customSubtypes) setCustomSubtypes(parseCustomSubtypes(s.customSubtypes));
          })
          .catch(() => {});
        const res = await fetch(`/api/projects/${projectId}`);
        if (!res.ok) {
          setError("Project not found");
          return;
        }
        const data = await res.json();
        setProject(data);

        // Initialize React Flow state from loaded canvas
        if (data.canvasState?.nodes?.length) {
          const stored = data.canvasState as StoredCanvasState;
          if (stored.alternatives) {
            setAlternatives(stored.alternatives);
          }
          let posMap: Map<string, { x: number; y: number }>;

          if (stored.positions && Object.keys(stored.positions).length > 0) {
            // Use persisted positions
            posMap = new Map(Object.entries(stored.positions));
          } else {
            // Compute positions with Dagre
            const positions = applyDagreLayout(stored.nodes, stored.edges);
            posMap = new Map(positions.map((p) => [p.id, p.position]));
          }

          const nodes = toReactFlowNodes(stored.nodes, posMap).map((n) => ({
            ...n,
            data: {
              ...n.data,
              customSubtypes,
              onLockToggle: handleLockToggle,
              onDelete: handleNodeDelete,
            },
          }));
          const edges = toReactFlowEdges(stored.edges);

          setRfNodes(nodes);
          setRfEdges(edges);

          // Mark as initialized after a tick to skip the debounced save effect
          requestAnimationFrame(() => {
            initializedRef.current = true;
          });
        } else {
          initializedRef.current = true;
        }
      } catch {
        setError("Failed to load project");
      } finally {
        setLoading(false);
      }
    }
    loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // --- Derived state ---

  const hasCanvas = useMemo(
    () =>
      project?.canvasState !== null &&
      (project?.canvasState?.nodes?.length ?? 0) > 0,
    [project?.canvasState],
  );
  const nodeCount = project?.canvasState?.nodes?.length ?? 0;

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

  return (
    <div className="flex h-screen bg-[var(--background)] text-[var(--foreground)]">
      {/* Chat Sidebar - open by default for new projects (no canvas) */}
      <ChatSidebar
        projectId={projectId}
        repoUrl={project.repoUrl}
        defaultOpen={!hasCanvas}
        scanTrigger={scanTrigger}
        onArchitecture={handleArchitecture}
        onStreaming={setChatStreaming}
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
            <AddNodeDropdown onAddNode={handleAddNode} customSubtypes={customSubtypes} />
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
              <ExportDropdown
                rfInstanceRef={rfInstanceRef}
                projectName={project.name}
                onError={setToast}
              />
            )}
            {nodeCount > 0 && (
              <button
                onClick={handleExportPrd}
                disabled={prdLoading}
                className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50"
                title="Generate PRD from architecture"
              >
                {prdLoading ? "Generating..." : "PRD"}
              </button>
            )}
            {nodeCount > 0 && project?.teamId && (
              <button
                onClick={() => setSaveTemplateModalOpen(true)}
                className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                title="Save current canvas as team template"
              >
                Save as Template
              </button>
            )}
            {nodeCount > 0 && (
              <span className="text-xs text-[var(--muted-foreground)]">
                {nodeCount} node{nodeCount !== 1 ? "s" : ""}
              </span>
            )}
            {project.repoUrl ? (
              <button
                onClick={() => setScanTrigger((t) => t + 1)}
                className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                title={`Re-scan: ${project.repoUrl}`}
              >
                Re-scan Repo
              </button>
            ) : (
              <>
                <button
                  onClick={() => setShowScanInput((v) => !v)}
                  className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                  title="Scan a GitHub repository"
                >
                  Scan Repo
                </button>
                {showScanInput && (
                  <form
                    className="flex items-center gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!scanUrlInput.trim()) return;
                      setProject((prev) =>
                        prev ? { ...prev, repoUrl: scanUrlInput.trim() } : prev,
                      );
                      setShowScanInput(false);
                      setScanTrigger((t) => t + 1);
                    }}
                  >
                    <input
                      type="url"
                      value={scanUrlInput}
                      onChange={(e) => setScanUrlInput(e.target.value)}
                      placeholder="https://github.com/owner/repo"
                      className="w-56 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-client)]"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={!scanUrlInput.trim()}
                      className="rounded bg-[var(--color-client)] px-2 py-1 text-xs text-white hover:opacity-90 disabled:opacity-50"
                    >
                      Go
                    </button>
                  </form>
                )}
              </>
            )}
            <UserAvatar />
          </div>
        </div>

        {/* Canvas area */}
        <div className="relative flex-1">
          <ReactFlow
            nodes={rfNodes}
            edges={edgesWithCallbacks}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            onNodeClick={handleNodeClick}
            onInit={(instance) => {
              rfInstanceRef.current = instance;
            }}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            snapToGrid
            snapGrid={[20, 20]}
            deleteKeyCode={null}
            data-testid="react-flow-canvas"
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="var(--muted-foreground)"
              style={{ opacity: 0.3 }}
            />
            <Controls />
            <MiniMap
              nodeColor={minimapNodeColor}
              maskColor="rgba(0, 0, 0, 0.1)"
            />
          </ReactFlow>

          {/* Generating architecture overlay */}
          {chatStreaming && !hasCanvas && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="text-center text-[var(--muted-foreground)]">
                <svg
                  className="mx-auto mb-3 h-10 w-10 animate-spin opacity-50"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <p className="text-lg font-medium">Generating architecture...</p>
                <p className="mt-1 text-sm">
                  The AI is designing your stack
                </p>
              </div>
            </div>
          )}

          {/* Empty state overlay */}
          {!chatStreaming && !hasCanvas && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
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
            </div>
          )}

          {/* Edge Legend */}
          <EdgeLegend />

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
            customSubtypes={customSubtypes}
            alternatives={selectedNode ? alternatives[selectedNode.id] : undefined}
            alternativesLoading={altLoading}
            onSuggestAlternatives={handleSuggestAlternatives}
            onSwapAlternative={handleSwapAlternative}
          />

          {/* Save Template Modal */}
          {saveTemplateModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
              <div className="w-96 rounded-lg bg-[var(--card)] p-6 shadow-xl">
                <h3 className="mb-4 text-lg font-semibold">Save as Template</h3>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const name = formData.get('name') as string;
                  const description = formData.get('description') as string;
                  if (name.trim()) {
                    handleSaveAsTemplate(name.trim(), description.trim() || undefined);
                  }
                }}>
                  <div className="mb-4">
                    <label htmlFor="template-name" className="mb-2 block text-sm font-medium">
                      Template Name *
                    </label>
                    <input
                      id="template-name"
                      name="name"
                      type="text"
                      required
                      className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-client)]"
                      placeholder="e.g., Microservices API Template"
                      autoFocus
                    />
                  </div>
                  <div className="mb-4">
                    <label htmlFor="template-description" className="mb-2 block text-sm font-medium">
                      Description
                    </label>
                    <textarea
                      id="template-description"
                      name="description"
                      rows={3}
                      className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-client)]"
                      placeholder="Describe when to use this template..."
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSaveTemplateModalOpen(false)}
                      disabled={templateSaving}
                      className="rounded border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--muted)] disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={templateSaving}
                      className="rounded bg-[var(--color-client)] px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {templateSaving ? "Saving..." : "Save Template"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Toast notification */}
          {toast && (
            <div
              className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white shadow-lg"
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
