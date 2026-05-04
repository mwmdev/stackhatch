"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { MessageSquareText, PanelLeftClose, RefreshCw } from "lucide-react";
import ReactFlow, {
  Background,
  Controls,
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
import StackNodeComponent, { type StackNodeData } from "@/components/canvas/StackNode";
import StackEdgeComponent, { type StackEdgeData } from "@/components/canvas/StackEdge";
import EdgeLegend from "@/components/canvas/EdgeLegend";
import ExportDropdown from "@/components/canvas/ExportDropdown";
import CommentsPanel from "@/components/comments/CommentsPanel";
import ThemeToggle from "@/components/ThemeToggle";
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
import UpgradePrompt from "@/components/UpgradePrompt";

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

interface SettingsResponse {
  role?: string;
  isAdmin?: boolean;
  customSubtypes?: string;
}

interface BillingResponse {
  plan?: string;
  status?: string | null;
}

/** Stored canvasState extends StackArchitecture with persisted positions */
interface StoredCanvasState extends StackArchitecture {
  positions?: Record<string, { x: number; y: number }>;
  alternatives?: Record<string, AlternativeNode[]>;
}

const nodeTypes = { stackNode: StackNodeComponent };
const edgeTypes = { stackEdge: StackEdgeComponent };

export default function ProjectPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedNode, setSelectedNode] = useState<StackNode | null>(null);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [customSubtypes, setCustomSubtypes] = useState<CustomSubtypesMap>({});
  const [scanTrigger, setScanTrigger] = useState(0);
  const [chatStreaming, setChatStreaming] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [showScanInput, setShowScanInput] = useState(false);
  const [scanUrlInput, setScanUrlInput] = useState("");
  const [alternatives, setAlternatives] = useState<Record<string, AlternativeNode[]>>({});
  const [altLoading, setAltLoading] = useState(false);
  const [prdLoading, setPrdLoading] = useState(false);
  const [saveTemplateModalOpen, setSaveTemplateModalOpen] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [activeCommentNodeId, setActiveCommentNodeId] = useState<string | null>(null);
  const [commentsPanelOpenTrigger, setCommentsPanelOpenTrigger] = useState(0);
  const [upgradeFeature, setUpgradeFeature] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [billingPlan, setBillingPlan] = useState("free");
  const [billingStatus, setBillingStatus] = useState<string | null>(null);
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<StackNodeData>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<StackEdgeData>([]);
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestFlowRef = useRef<{
    nodes: Node<StackNodeData>[];
    edges: Edge<StackEdgeData>[];
  }>({ nodes: [], edges: [] });
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
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, locked } } : n))
      );
      setProject((prev) => {
        if (!prev?.canvasState) return prev;
        return {
          ...prev,
          canvasState: {
            ...prev.canvasState,
            nodes: prev.canvasState.nodes.map((n) => (n.id === id ? { ...n, locked } : n)),
          },
        };
      });
      setSelectedNode((prev) => (prev && prev.id === id ? { ...prev, locked } : prev));
    },
    [setRfNodes]
  );

  const handleNodeDelete = useCallback(
    (id: string) => {
      setRfNodes((nds) => nds.filter((n) => n.id !== id));
      setRfEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setProject((prev) => {
        if (!prev?.canvasState) return prev;
        return {
          ...prev,
          canvasState: {
            nodes: prev.canvasState.nodes.filter((n) => n.id !== id),
            edges: prev.canvasState.edges.filter((e) => e.source !== id && e.target !== id),
          },
        };
      });
      setSelectedNode(null);
    },
    [setRfNodes, setRfEdges]
  );

  const handleAddComment = useCallback((id: string) => {
    setActiveCommentNodeId(id);
    setCommentsPanelOpenTrigger((t) => t + 1);
  }, []);

  const handleCommentBadgeClick = useCallback((id: string) => {
    setActiveCommentNodeId(id);
    setCommentsPanelOpenTrigger((t) => t + 1);
  }, []);

  const handleCommentCountsChange = useCallback((counts: Record<string, number>) => {
    setCommentCounts(counts);
  }, []);

  // --- Debounced save ---

  const saveCanvas = useCallback(
    async (
      nodes: Node<StackNodeData>[],
      edges: Edge<StackEdgeData>[],
      options?: { keepalive?: boolean }
    ) => {
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
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        keepalive: options?.keepalive,
        body: JSON.stringify({ canvasState: JSON.stringify(stored) }),
      });
      if (!response.ok) {
        throw new Error("Failed to save canvas");
      }
      // Keep project domain state in sync
      setProject((prev) =>
        prev
          ? {
              ...prev,
              canvasState: { nodes: stackNodes, edges: stackEdges },
            }
          : prev
      );
    },
    [projectId]
  );

  const debouncedSave = useCallback(
    (nodes: Node<StackNodeData>[], edges: Edge<StackEdgeData>[]) => {
      latestFlowRef.current = { nodes, edges };
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveCanvas(nodes, edges).catch(() => {
          setToast("Failed to save canvas");
        });
      }, 500);
    },
    [saveCanvas]
  );

  // Trigger debounced save when React Flow state changes
  useEffect(() => {
    if (!initializedRef.current) return;
    debouncedSave(rfNodes, rfEdges);
  }, [rfNodes, rfEdges, debouncedSave]);

  // Flush a pending save on unmount so fast navigation does not drop edits.
  useEffect(() => {
    return () => {
      if (!saveTimerRef.current || !initializedRef.current) return;
      clearTimeout(saveTimerRef.current);
      void saveCanvas(latestFlowRef.current.nodes, latestFlowRef.current.edges, {
        keepalive: true,
      });
    };
  }, [saveCanvas]);

  // --- Build React Flow nodes with injected callbacks ---

  const buildRfNodes = useCallback(
    (
      nodes: StackNode[],
      positions: Map<string, { x: number; y: number }>
    ): Node<StackNodeData>[] => {
      return toReactFlowNodes(nodes, positions).map((n) => ({
        ...n,
        data: {
          ...n.data,
          customSubtypes,
          commentCount: commentCounts[n.id] ?? 0,
          onLockToggle: handleLockToggle,
          onDelete: handleNodeDelete,
          onAddComment: handleAddComment,
          onCommentBadgeClick: handleCommentBadgeClick,
        },
      }));
    },
    [
      handleLockToggle,
      handleNodeDelete,
      handleAddComment,
      handleCommentBadgeClick,
      customSubtypes,
      commentCounts,
    ]
  );

  // Update comment counts on existing nodes when they change
  useEffect(() => {
    setRfNodes((nds) =>
      nds.map((n) => {
        const count = commentCounts[n.id] ?? 0;
        if (n.data.commentCount === count) return n;
        return { ...n, data: { ...n.data, commentCount: count } };
      })
    );
  }, [commentCounts, setRfNodes]);

  // --- React Flow event handlers ---

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node<StackNodeData>) => {
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
  }, []);

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
    [pendingConnection, setRfEdges]
  );

  const handleCancelConnection = useCallback(() => {
    setPendingConnection(null);
  }, []);

  // --- Edge label editing ---

  const handleEdgeLabelChange = useCallback(
    (edgeId: string, newLabel: string) => {
      setRfEdges((eds) =>
        eds.map((e) => (e.id === edgeId ? { ...e, data: { ...e.data!, label: newLabel } } : e))
      );
      setProject((prev) => {
        if (!prev?.canvasState) return prev;
        return {
          ...prev,
          canvasState: {
            ...prev.canvasState,
            edges: prev.canvasState.edges.map((e) =>
              e.id === edgeId ? { ...e, label: newLabel } : e
            ),
          },
        };
      });
    },
    [setRfEdges]
  );

  const edgesWithCallbacks = useMemo(
    () =>
      rfEdges.map((e) => ({
        ...e,
        data: { ...e.data!, onLabelChange: handleEdgeLabelChange },
      })),
    [rfEdges, handleEdgeLabelChange]
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
        setUpgradeFeature("export PRD");
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
          onAddComment: handleAddComment,
          onCommentBadgeClick: handleCommentBadgeClick,
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
    [
      handleLockToggle,
      handleNodeDelete,
      handleAddComment,
      handleCommentBadgeClick,
      setRfNodes,
      customSubtypes,
    ]
  );

  // --- Detail panel update ---

  const handleNodeUpdate = useCallback(
    (id: string, updates: Partial<StackNode>) => {
      setRfNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...updates } } : n))
      );
      setProject((prev) => {
        if (!prev?.canvasState) return prev;
        return {
          ...prev,
          canvasState: {
            ...prev.canvasState,
            nodes: prev.canvasState.nodes.map((n) => (n.id === id ? { ...n, ...updates } : n)),
          },
        };
      });
      setSelectedNode((prev) => (prev && prev.id === id ? { ...prev, ...updates } : prev));
    },
    [setRfNodes]
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
        setUpgradeFeature("use alternatives");
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
        const updated = list.filter((a) => a.technology !== alt.technology || a.name !== alt.name);
        updated.push(currentAsAlt);
        return { ...prev, [node.id]: updated };
      });
    },
    [selectedNode, handleNodeUpdate]
  );

  // --- Save as template ---

  const handleSaveAsTemplate = useCallback(
    async (templateName: string, templateDescription?: string) => {
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
    },
    [project?.teamId, rfNodes, rfEdges]
  );

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
          const result = mergeArchitecture(currentCanvas, incoming, currentPositions);
          finalArch = result.architecture;
          const positions = applyDagreLayout(
            result.architecture.nodes,
            result.architecture.edges,
            result.fixedPositions
          );
          posMap = new Map(positions.map((p) => [p.id, p.position]));
        }

        const newRfNodes = buildRfNodes(finalArch.nodes, posMap);
        const newRfEdges = toReactFlowEdges(finalArch.edges);

        setRfNodes(newRfNodes);
        setRfEdges(newRfEdges);
        setProject((prev) => (prev ? { ...prev, canvasState: finalArch } : prev));

        setTimeout(() => rfInstanceRef.current?.fitView({ padding: 0.2, duration: 300 }), 100);
      } catch {
        setToast("Failed to update canvas");
      }
    },
    [rfNodes, buildRfNodes, setRfNodes, setRfEdges]
  );

  // --- Load project ---

  useEffect(() => {
    async function loadProject() {
      try {
        // Fetch effective user capabilities in parallel. These endpoints use impersonation-aware auth.
        fetch("/api/settings")
          .then((r) => r.json())
          .then((s: SettingsResponse) => {
            setCurrentUserRole(s.role ?? null);
            if (s.customSubtypes) setCustomSubtypes(parseCustomSubtypes(s.customSubtypes));
          })
          .catch(() => {});
        fetch("/api/billing/subscription")
          .then((r) => (r.ok ? r.json() : null))
          .then((s: BillingResponse | null) => {
            setBillingPlan(s?.plan ?? "free");
            setBillingStatus(s?.status ?? null);
          })
          .catch(() => {});
        const res = await fetch(`/api/projects/${projectId}`);
        if (!res.ok) {
          setError("Project not found");
          return;
        }
        const data = await res.json();
        setProject(data);
        setChatOpen(!((data.canvasState?.nodes?.length ?? 0) > 0));

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
              onAddComment: handleAddComment,
              onCommentBadgeClick: handleCommentBadgeClick,
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
    () => project?.canvasState !== null && (project?.canvasState?.nodes?.length ?? 0) > 0,
    [project?.canvasState]
  );
  const nodeCount = project?.canvasState?.nodes?.length ?? 0;
  const isAdmin = currentUserRole === "admin";
  const canUseAlternatives = isAdmin || currentUserRole === "paid-user";
  const canExportPrd =
    isAdmin || ((billingPlan === "pro" || billingPlan === "team") && billingStatus === "active");

  // Map nodeId → name for comment labels
  const nodeNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const n of project?.canvasState?.nodes ?? []) {
      map[n.id] = n.name;
    }
    return map;
  }, [project?.canvasState?.nodes]);

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
        <Link href="/app" className="text-[var(--color-client)] hover:underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--background)] text-[var(--foreground)] md:flex-row">
      <button
        onClick={() => setChatOpen((value) => !value)}
        className="fixed left-4 top-2 z-50 flex h-11 w-11 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-client)]/30"
        title={chatOpen ? "Hide chat sidebar" : "Show chat sidebar"}
        aria-label={chatOpen ? "Hide chat sidebar" : "Show chat sidebar"}
        aria-pressed={chatOpen}
        aria-controls="editor-chat-sidebar"
      >
        {chatOpen ? (
          <PanelLeftClose className="h-[18px] w-[18px]" />
        ) : (
          <MessageSquareText className="h-[18px] w-[18px]" />
        )}
      </button>

      <div
        id="editor-chat-sidebar"
        className={`flex-shrink-0 overflow-hidden transition-[height,width] duration-200 ease-out motion-reduce:transition-none ${
          chatOpen ? "h-[45vh] md:h-auto md:w-[400px]" : "h-0 md:h-auto md:w-0"
        }`}
      >
        <ChatSidebar
          projectId={projectId}
          repoUrl={project.repoUrl}
          defaultOpen={!hasCanvas}
          open={chatOpen}
          onOpenChange={setChatOpen}
          showCollapsedButton={false}
          scanTrigger={scanTrigger}
          onArchitecture={handleArchitecture}
          onStreaming={setChatStreaming}
        />
      </div>

      {/* Canvas Area */}
      <div className="flex flex-1 flex-col">
        {/* Toolbar */}
        <div
          className={`flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-4 py-2 ${
            chatOpen ? "" : "pl-16"
          }`}
        >
          <h1 className="text-lg font-semibold">{project.name}</h1>
          <div className="ml-auto flex items-center gap-2">
            <AddNodeDropdown onAddNode={handleAddNode} customSubtypes={customSubtypes} />
            {nodeCount > 0 && (
              <ExportDropdown
                rfInstanceRef={rfInstanceRef}
                projectName={project.name}
                onError={setToast}
              />
            )}
            {nodeCount > 0 && canExportPrd && (
              <button
                onClick={handleExportPrd}
                disabled={prdLoading}
                className="min-h-11 rounded border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50"
                title="Generate PRD from architecture"
              >
                {prdLoading ? "Generating..." : "PRD"}
              </button>
            )}
            {nodeCount > 0 && project?.teamId && (
              <button
                onClick={() => setSaveTemplateModalOpen(true)}
                className="min-h-11 rounded border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                title="Save current canvas as team template"
              >
                Save as Template
              </button>
            )}
            {project.repoUrl ? (
              <button
                onClick={() => setScanTrigger((t) => t + 1)}
                className="group relative flex h-11 w-11 items-center justify-center rounded border border-[var(--border)] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-client)]/30"
                aria-label={`Re-scan repository: ${project.repoUrl}`}
                title={`Re-scan: ${project.repoUrl}`}
              >
                <RefreshCw className="h-[18px] w-[18px]" />
                <span className="pointer-events-none absolute right-0 top-full z-50 mt-2 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs font-medium text-[var(--foreground)] opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  Re-scan Repo
                </span>
              </button>
            ) : (
              <>
                <button
                  onClick={() => setShowScanInput((v) => !v)}
                  className="min-h-11 rounded border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
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
                        prev ? { ...prev, repoUrl: scanUrlInput.trim() } : prev
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
                      className="min-h-11 w-56 rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-client)]"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={!scanUrlInput.trim()}
                      className="min-h-11 rounded bg-[var(--color-client)] px-3 py-2 text-xs text-white hover:bg-[var(--color-client-hover)] disabled:opacity-50"
                    >
                      Go
                    </button>
                  </form>
                )}
              </>
            )}
            <ThemeToggle />
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
                <p className="mt-1 text-sm">The AI is designing your stack</p>
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
                <p className="mt-1 text-sm">Start a conversation or add nodes manually</p>
              </div>
            </div>
          )}

          {/* Edge Legend */}
          <EdgeLegend />

          {/* Comments Panel */}
          <CommentsPanel
            projectId={projectId}
            isTeamProject={!!project.teamId}
            nodeNames={nodeNames}
            activeNodeId={activeCommentNodeId}
            onClearNodeFilter={() => setActiveCommentNodeId(null)}
            onCommentCountsChange={handleCommentCountsChange}
            openTrigger={commentsPanelOpenTrigger}
          />

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
            onSuggestAlternatives={canUseAlternatives ? handleSuggestAlternatives : undefined}
            onSwapAlternative={canUseAlternatives ? handleSwapAlternative : undefined}
          />

          {/* Save Template Modal */}
          {saveTemplateModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="save-template-title"
                className="mx-4 w-full max-w-sm rounded-lg bg-[var(--card)] p-6 shadow-xl"
              >
                <h3 id="save-template-title" className="mb-4 text-lg font-semibold">
                  Save as Template
                </h3>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const name = formData.get("name") as string;
                    const description = formData.get("description") as string;
                    if (name.trim()) {
                      handleSaveAsTemplate(name.trim(), description.trim() || undefined);
                    }
                  }}
                >
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
                    <label
                      htmlFor="template-description"
                      className="mb-2 block text-sm font-medium"
                    >
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
                      className="min-h-11 rounded border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--muted)] disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={templateSaving}
                      className="min-h-11 rounded bg-[var(--color-client)] px-4 py-2 text-sm text-white hover:bg-[var(--color-client-hover)] disabled:opacity-50"
                    >
                      {templateSaving ? "Saving..." : "Save Template"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Upgrade Prompt */}
          {upgradeFeature && (
            <UpgradePrompt
              feature={upgradeFeature}
              variant="modal"
              onDismiss={() => setUpgradeFeature(null)}
            />
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
