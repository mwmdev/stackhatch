"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  FolderPlus,
  MessageSquareText,
  PanelLeftClose,
  RefreshCw,
  Sparkles,
} from "lucide-react";
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
import ChatSidebar, { type ArchitectureUpdateMeta } from "@/components/chat/ChatSidebar";
import NodeDetailPanel from "@/components/canvas/NodeDetailPanel";
import AddNodeDropdown from "@/components/canvas/AddNodeDropdown";
import ConnectionTypeSelector from "@/components/canvas/ConnectionTypeSelector";
import StackNodeComponent, { type StackNodeData } from "@/components/canvas/StackNode";
import StackEdgeComponent, { edgeStyles, type StackEdgeData } from "@/components/canvas/StackEdge";
import EdgeLegend from "@/components/canvas/EdgeLegend";
import ExportDropdown from "@/components/canvas/ExportDropdown";
import EditorDisplaySettingsDropdown from "@/components/canvas/EditorDisplaySettingsDropdown";
import {
  DEFAULT_EDITOR_DISPLAY_SETTINGS,
  EditorDisplaySettingsProvider,
  type EditorDisplaySettings,
} from "@/components/canvas/EditorDisplaySettings";
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
import { DEFAULT_NOTE_COLOR, getSubtypeConfig } from "@/lib/node-config";
import { applyDagreLayout } from "@/lib/layout";
import { mergeArchitecture } from "@/lib/merge-architecture";
import { parseCustomSubtypes, type CustomSubtypesMap } from "@/lib/custom-subtypes";
import { trackEvent } from "@/lib/analytics";
import {
  APP_RESUME_RECOVERY_PATH,
  hasAppResumeMarker,
  withoutAppResumeMarker,
} from "@/lib/app-route";
import {
  buildProjectStartChooserPath,
  consumePendingProjectStart,
  getPendingProjectStart,
} from "@/lib/project-start";

interface Project {
  id: string;
  name: string;
  description: string | null;
  repoUrl: string | null;
  repoCommitSha?: string | null;
  repoScannedAt?: number | string | null;
  repoAnalysisStatus?: "complete" | "partial" | null;
  repoAnalysisWarning?: string | null;
  canvasState: StackArchitecture | null;
  createdAt: number;
  updatedAt: number;
}

type ConnectionTypePopover =
  | {
      mode: "create";
      sourceId: string;
      targetId: string;
      position: { x: number; y: number };
    }
  | {
      mode: "edit";
      edgeId: string;
      position: { x: number; y: number };
    };

interface SettingsResponse {
  customSubtypes?: string;
  hasAnthropicKey?: boolean;
}

/** Stored canvasState extends StackArchitecture with persisted positions */
interface StoredCanvasState extends StackArchitecture {
  positions?: Record<string, { x: number; y: number }>;
  alternatives?: Record<string, AlternativeNode[]>;
}

const nodeTypes = { stackNode: StackNodeComponent };
const edgeTypes = { stackEdge: StackEdgeComponent };
const EDITOR_DISPLAY_SETTINGS_STORAGE_KEY = "stackhatch:editor-display-settings:v1";

function handleReactFlowError(id: string, message: string) {
  // React Flow 11 can emit 002 under React 19 strict-mode remounts even when
  // these objects are module constants. Keep every other diagnostic visible.
  if (id !== "002") console.warn(`[React Flow ${id}] ${message}`);
}

function getDefaultConnectionLabel(type: ConnectionType) {
  return edgeStyles[type].displayName;
}

function isDefaultConnectionLabel(label: string, type: ConnectionType) {
  return label === getDefaultConnectionLabel(type) || label === type.toUpperCase();
}

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveringResume, setRecoveringResume] = useState(false);
  const [error, setError] = useState("");
  const [selectedNode, setSelectedNode] = useState<StackNode | null>(null);
  const [nodePanelOpen, setNodePanelOpen] = useState(false);
  const [connectionTypePopover, setConnectionTypePopover] = useState<ConnectionTypePopover | null>(
    null
  );
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
  const [hasAnthropicKey, setHasAnthropicKey] = useState<boolean | null>(null);
  const [aiSetupRequired, setAiSetupRequired] = useState(false);
  const [rescanConfirmOpen, setRescanConfirmOpen] = useState(false);
  const [editorDisplaySettings, setEditorDisplaySettings] = useState<EditorDisplaySettings>(() => {
    if (typeof window === "undefined") return DEFAULT_EDITOR_DISPLAY_SETTINGS;
    try {
      const stored = window.localStorage.getItem(EDITOR_DISPLAY_SETTINGS_STORAGE_KEY);
      if (!stored) return DEFAULT_EDITOR_DISPLAY_SETTINGS;
      const parsed = JSON.parse(stored) as Partial<EditorDisplaySettings>;
      return {
        showNodeCategory:
          typeof parsed.showNodeCategory === "boolean"
            ? parsed.showNodeCategory
            : DEFAULT_EDITOR_DISPLAY_SETTINGS.showNodeCategory,
        showEdgeLabels:
          typeof parsed.showEdgeLabels === "boolean"
            ? parsed.showEdgeLabels
            : DEFAULT_EDITOR_DISPLAY_SETTINGS.showEdgeLabels,
      };
    } catch {
      return DEFAULT_EDITOR_DISPLAY_SETTINGS;
    }
  });
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<StackNodeData>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<StackEdgeData>([]);
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const repositoryScanPendingRef = useRef(false);
  const rescanDialogRef = useRef<HTMLDivElement | null>(null);
  const rescanInvokerRef = useRef<HTMLButtonElement | null>(null);
  const saveTemplateDialogRef = useRef<HTMLDivElement | null>(null);
  const saveTemplateInvokerRef = useRef<HTMLButtonElement | null>(null);
  const nodePanelCloseTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestFlowRef = useRef<{
    nodes: Node<StackNodeData>[];
    edges: Edge<StackEdgeData>[];
  }>({ nodes: [], edges: [] });
  const projectRef = useRef<Project | null>(null);
  const initializedRef = useRef(false);
  const alternativesRef = useRef<Record<string, AlternativeNode[]>>({});
  const firstMapTrackedRef = useRef(false);
  const openedProjectRef = useRef<string | null>(null);
  const canUseConnectionTypes = true;

  const startRepositoryRescan = useCallback(() => {
    repositoryScanPendingRef.current = true;
    clearTimeout(saveTimerRef.current);
    setRescanConfirmOpen(false);
    setChatOpen(true);
    trackEvent("repository_rescan_started", { location: "editor" });
    setScanTrigger((trigger) => trigger + 1);
  }, []);

  // Keep refs in sync for use in stable callbacks
  projectRef.current = project;
  alternativesRef.current = alternatives;

  useEffect(() => {
    try {
      window.localStorage.setItem(
        EDITOR_DISPLAY_SETTINGS_STORAGE_KEY,
        JSON.stringify(editorDisplaySettings)
      );
    } catch {
      // localStorage can be unavailable in restricted browser contexts.
    }
  }, [editorDisplaySettings]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const loadedProjectId = project?.id;
  useEffect(() => {
    if (loadedProjectId !== projectId || openedProjectRef.current === projectId) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    async function recordProjectOpen(attempt: number) {
      try {
        const response = await fetch(`/api/projects/${projectId}/open`, { method: "POST" });
        if (!response.ok) throw new Error("project-open");
        if (!cancelled) openedProjectRef.current = projectId;
      } catch {
        if (!cancelled && attempt === 0) {
          retryTimer = setTimeout(() => void recordProjectOpen(1), 200);
        }
      }
    }

    void recordProjectOpen(0);
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, [loadedProjectId, projectId]);

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
      setNodePanelOpen(false);
      setSelectedNode(null);
    },
    [setRfNodes, setRfEdges]
  );

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
      if (repositoryScanPendingRef.current) return;
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
      if (!saveTimerRef.current || !initializedRef.current || repositoryScanPendingRef.current)
        return;
      clearTimeout(saveTimerRef.current);
      void saveCanvas(latestFlowRef.current.nodes, latestFlowRef.current.edges, {
        keepalive: true,
      });
    };
  }, [saveCanvas]);

  useEffect(() => {
    return () => clearTimeout(nodePanelCloseTimerRef.current);
  }, []);

  useEffect(() => {
    if (!rescanConfirmOpen) return;
    const previousFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const rescanInvoker = rescanInvokerRef.current;
    const editorShell = document.querySelector<HTMLElement>("[data-testid='project-editor-shell']");
    const previousAriaHidden = editorShell?.getAttribute("aria-hidden");
    editorShell?.setAttribute("inert", "");
    editorShell?.setAttribute("aria-hidden", "true");

    const focusDialog = window.requestAnimationFrame(() => {
      const preferred = rescanDialogRef.current?.querySelector<HTMLElement>("[data-autofocus]");
      const first = rescanDialogRef.current?.querySelector<HTMLElement>(
        "a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])"
      );
      (preferred ?? first)?.focus();
    });

    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setRescanConfirmOpen(false);
        return;
      }
      if (event.key !== "Tab" || !rescanDialogRef.current) return;

      const focusable = Array.from(
        rescanDialogRef.current.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])"
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      window.cancelAnimationFrame(focusDialog);
      window.removeEventListener("keydown", handleDialogKeyDown);
      editorShell?.removeAttribute("inert");
      if (previousAriaHidden == null) editorShell?.removeAttribute("aria-hidden");
      else editorShell?.setAttribute("aria-hidden", previousAriaHidden);
      (rescanInvoker ?? previousFocused)?.focus();
    };
  }, [rescanConfirmOpen]);

  useEffect(() => {
    if (!saveTemplateModalOpen) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const templateInvoker = saveTemplateInvokerRef.current;
    const focusDialog = window.requestAnimationFrame(() => {
      saveTemplateDialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    });

    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSaveTemplateModalOpen(false);
        return;
      }
      if (event.key !== "Tab" || !saveTemplateDialogRef.current) return;

      const focusable = Array.from(
        saveTemplateDialogRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      window.cancelAnimationFrame(focusDialog);
      window.removeEventListener("keydown", handleDialogKeyDown);
      (templateInvoker ?? previouslyFocused)?.focus();
    };
  }, [saveTemplateModalOpen]);

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
          onLockToggle: handleLockToggle,
          showDescription: true,
          canUseNodeLocking: true,
          onDelete: handleNodeDelete,
        },
      }));
    },
    [handleLockToggle, handleNodeDelete, customSubtypes]
  );

  // --- React Flow event handlers ---

  const closeNodePanel = useCallback(() => {
    setNodePanelOpen(false);
    clearTimeout(nodePanelCloseTimerRef.current);
    nodePanelCloseTimerRef.current = setTimeout(() => {
      setSelectedNode(null);
    }, 200);
  }, []);

  const openNodePanel = useCallback((node: StackNode) => {
    clearTimeout(nodePanelCloseTimerRef.current);
    setNodePanelOpen(false);
    setSelectedNode(node);
    requestAnimationFrame(() => {
      setNodePanelOpen(true);
    });
  }, []);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node<StackNodeData>) => {
      if (selectedNode?.id === node.id && nodePanelOpen) {
        closeNodePanel();
        return;
      }

      const data = node.data;
      openNodePanel({
        id: node.id,
        category: data.category,
        subtype: data.subtype,
        name: data.name,
        technology: data.technology,
        description: data.description,
        reasoning: data.reasoning,
        locked: data.locked,
        ...(data.noteColor ? { noteColor: data.noteColor } : {}),
      });
    },
    [closeNodePanel, nodePanelOpen, openNodePanel, selectedNode?.id]
  );

  const handlePaneClick = useCallback(() => {
    if (nodePanelOpen) closeNodePanel();
  }, [closeNodePanel, nodePanelOpen]);

  const addConnectionEdge = useCallback(
    (sourceId: string, targetId: string, type: ConnectionType) => {
      const id = crypto.randomUUID();
      const label = getDefaultConnectionLabel(type);
      const rfEdge: Edge<StackEdgeData> = {
        id,
        type: "stackEdge",
        source: sourceId,
        target: targetId,
        data: { connectionType: type, label },
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
                source: sourceId,
                target: targetId,
                connectionType: type,
                label,
              },
            ],
          },
        };
      });
    },
    [setRfEdges]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (!canUseConnectionTypes) {
        addConnectionEdge(connection.source, connection.target, "http");
        return;
      }
      setConnectionTypePopover({
        mode: "create",
        sourceId: connection.source,
        targetId: connection.target,
        position: { x: 300, y: 300 },
      });
    },
    [addConnectionEdge, canUseConnectionTypes]
  );

  const handleEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge<StackEdgeData>) => {
      if (!canUseConnectionTypes) return;
      if (event.target instanceof Element && event.target.closest(".stack-edge-label")) {
        return;
      }
      event.stopPropagation();
      if (nodePanelOpen) closeNodePanel();
      setConnectionTypePopover({
        mode: "edit",
        edgeId: edge.id,
        position: { x: event.clientX, y: event.clientY },
      });
    },
    [canUseConnectionTypes, closeNodePanel, nodePanelOpen]
  );

  // --- Connection type selected ---

  const handleConnectionTypeSelect = useCallback(
    (type: ConnectionType) => {
      if (!connectionTypePopover) return;
      if (connectionTypePopover.mode === "create") {
        addConnectionEdge(connectionTypePopover.sourceId, connectionTypePopover.targetId, type);
        setConnectionTypePopover(null);
        return;
      }

      const edgeId = connectionTypePopover.edgeId;
      setRfEdges((eds) =>
        eds.map((e) => {
          if (e.id !== edgeId) return e;
          const previousType = e.data?.connectionType ?? "http";
          const previousLabel = e.data?.label ?? "";
          const label = isDefaultConnectionLabel(previousLabel, previousType)
            ? getDefaultConnectionLabel(type)
            : previousLabel;
          return { ...e, data: { ...e.data!, connectionType: type, label } };
        })
      );
      setProject((prev) => {
        if (!prev?.canvasState) return prev;
        return {
          ...prev,
          canvasState: {
            ...prev.canvasState,
            edges: prev.canvasState.edges.map((e) => {
              if (e.id !== edgeId) return e;
              const label = isDefaultConnectionLabel(e.label, e.connectionType)
                ? getDefaultConnectionLabel(type)
                : e.label;
              return { ...e, connectionType: type, label };
            }),
          },
        };
      });
      setConnectionTypePopover(null);
    },
    [addConnectionEdge, connectionTypePopover, setRfEdges]
  );

  const handleCancelConnection = useCallback(() => {
    setConnectionTypePopover(null);
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
        data: {
          ...e.data!,
          connectionTypesEnabled: canUseConnectionTypes,
          onLabelChange: canUseConnectionTypes ? handleEdgeLabelChange : undefined,
        },
      })),
    [rfEdges, handleEdgeLabelChange, canUseConnectionTypes]
  );

  // --- Export PRD ---

  const handleExportPrd = useCallback(async () => {
    if (!project) return;
    if (hasAnthropicKey === false) {
      setAiSetupRequired(true);
      return;
    }
    setPrdLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/export-prd`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.code === "AI_NOT_CONFIGURED") {
          setAiSetupRequired(true);
          return;
        }
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
  }, [project, projectId, hasAnthropicKey]);

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
        ...(category === "note" ? { noteColor: DEFAULT_NOTE_COLOR } : {}),
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
          ...(newStackNode.noteColor ? { noteColor: newStackNode.noteColor } : {}),
          customSubtypes,
          showDescription: true,
          canUseNodeLocking: true,
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
      openNodePanel(newStackNode);
    },
    [handleLockToggle, handleNodeDelete, setRfNodes, customSubtypes, openNodePanel]
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
    closeNodePanel();
  }, [closeNodePanel]);

  // --- Suggest alternatives ---

  const handleSuggestAlternatives = useCallback(async () => {
    const node = selectedNode;
    if (!node) return;
    trackEvent("alternatives_opened", { location: "editor" });
    if (hasAnthropicKey === false) {
      setAiSetupRequired(true);
      return;
    }
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
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.code === "AI_NOT_CONFIGURED") setAiSetupRequired(true);
        else setToast(data.error || "Failed to suggest alternatives");
        return;
      }
      const data = await res.json();
      if (data.alternatives) {
        setAlternatives((prev) => ({ ...prev, [node.id]: data.alternatives }));
      }
    } finally {
      setAltLoading(false);
    }
  }, [selectedNode, projectId, hasAnthropicKey]);

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

        const res = await fetch("/api/templates", {
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
    [rfNodes, rfEdges]
  );

  // --- AI architecture handler ---

  const handleArchitecture = useCallback(
    (incoming: StackArchitecture, meta?: ArchitectureUpdateMeta) => {
      try {
        if (!incoming?.nodes || !Array.isArray(incoming.nodes)) {
          setToast("Failed to update canvas: invalid architecture data");
          return;
        }

        const currentCanvas = projectRef.current?.canvasState;
        const isFirst = !currentCanvas || currentCanvas.nodes.length === 0;
        const isRepositoryReplacement = meta?.source === "scan";

        let finalArch: StackArchitecture;
        let posMap: Map<string, { x: number; y: number }>;

        if (isFirst || isRepositoryReplacement) {
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
          const result = mergeArchitecture(currentCanvas, incoming, currentPositions, {
            nodeLockingEnabled: true,
          });
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

        if (isRepositoryReplacement) {
          clearTimeout(saveTimerRef.current);
          alternativesRef.current = {};
          setAlternatives({});
          setSelectedNode(null);
          setNodePanelOpen(false);
          setConnectionTypePopover(null);
        }
        setRfNodes(newRfNodes);
        setRfEdges(newRfEdges);
        setProject((prev) =>
          prev
            ? {
                ...prev,
                canvasState: finalArch,
                ...(meta?.provenance
                  ? {
                      repoUrl: meta.provenance.repoUrl,
                      repoCommitSha: meta.provenance.commitSha,
                      repoScannedAt: meta.provenance.scannedAt,
                      repoAnalysisStatus: meta.provenance.analysisStatus,
                      repoAnalysisWarning: meta.provenance.analysisWarning,
                    }
                  : {}),
              }
            : prev
        );
        if (isFirst && !firstMapTrackedRef.current) {
          firstMapTrackedRef.current = true;
          const startMethod = consumePendingProjectStart();
          trackEvent("first_map_viewed", {
            location: "editor",
            ...(startMethod ? { start_method: startMethod } : {}),
          });
        }

        setTimeout(() => rfInstanceRef.current?.fitView({ padding: 0.2, duration: 300 }), 100);
      } catch {
        setToast("Failed to update canvas");
      }
    },
    [rfNodes, buildRfNodes, setRfNodes, setRfEdges]
  );

  const handleScanStateChange = useCallback((scanning: boolean) => {
    repositoryScanPendingRef.current = scanning;
    if (scanning) clearTimeout(saveTimerRef.current);
  }, []);

  // --- Load project ---

  useEffect(() => {
    async function loadProject() {
      try {
        // Resolve shared subtype configuration before constructing persisted node data.
        const [settingsResponse, res] = await Promise.all([
          fetch("/api/settings")
            .then((response) =>
              response.ok ? (response.json() as Promise<SettingsResponse>) : null
            )
            .catch(() => null),
          fetch(`/api/projects/${projectId}`),
        ]);
        const loadedCustomSubtypes = parseCustomSubtypes(settingsResponse?.customSubtypes);
        if (settingsResponse) setHasAnthropicKey(Boolean(settingsResponse.hasAnthropicKey));
        setCustomSubtypes(loadedCustomSubtypes);
        if (!res.ok) {
          if (res.status === 404 && hasAppResumeMarker(window.location.search)) {
            setRecoveringResume(true);
            router.replace(APP_RESUME_RECOVERY_PATH);
            return;
          }
          setError("Project not found");
          return;
        }
        const data = await res.json();
        if (hasAppResumeMarker(window.location.search)) {
          const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
          window.history.replaceState(
            window.history.state,
            "",
            withoutAppResumeMarker(currentPath)
          );
        }
        setProject(data);
        const hasLoadedCanvas = (data.canvasState?.nodes?.length ?? 0) > 0;
        setChatOpen(!hasLoadedCanvas);

        const pendingStartMethod = getPendingProjectStart();
        const tracksOnLoad =
          (pendingStartMethod === "blank" && !hasLoadedCanvas) ||
          (pendingStartMethod === "template" && hasLoadedCanvas);
        if (tracksOnLoad && !firstMapTrackedRef.current) {
          firstMapTrackedRef.current = true;
          const startMethod = consumePendingProjectStart();
          trackEvent("first_map_viewed", {
            location: "editor",
            ...(startMethod ? { start_method: startMethod } : {}),
          });
        }

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
              customSubtypes: loadedCustomSubtypes,
              showDescription: true,
              canUseNodeLocking: true,
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
    () => project?.canvasState !== null && (project?.canvasState?.nodes?.length ?? 0) > 0,
    [project?.canvasState]
  );
  const nodeCount = project?.canvasState?.nodes?.length ?? 0;
  const liveCanvasState = useMemo<StackArchitecture | null>(() => {
    if (rfNodes.length > 0 || rfEdges.length > 0) {
      return {
        nodes: fromReactFlowNodes(rfNodes),
        edges: fromReactFlowEdges(rfEdges),
      };
    }
    return project?.canvasState
      ? { nodes: project.canvasState.nodes, edges: project.canvasState.edges }
      : null;
  }, [project?.canvasState, rfNodes, rfEdges]);
  if (recoveringResume) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] text-[var(--muted-foreground)]">
        <p role="status" aria-live="polite">
          Finding another map...
        </p>
      </div>
    );
  }

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
        <p className="mb-4 text-[var(--danger)]">{error || "Project not found"}</p>
        <Link href="/app/maps" className="text-[var(--color-client)] hover:underline">
          All Maps
        </Link>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col bg-[var(--background)] text-[var(--foreground)] md:flex-row"
      data-testid="project-editor-shell"
      style={{ height: "calc(100vh - var(--impersonation-banner-height, 0px))" }}
    >
      <button
        onClick={() => setChatOpen((value) => !value)}
        className="fixed left-4 z-50 flex h-11 w-11 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/30"
        style={{ top: "calc(var(--impersonation-banner-height, 0px) + 0.5rem)" }}
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
          canvasState={liveCanvasState}
          onArchitecture={handleArchitecture}
          onStreaming={setChatStreaming}
          onScanStateChange={handleScanStateChange}
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
          <Link
            href="/app/maps"
            className="flex min-h-11 items-center gap-2 rounded-md px-2 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            title="All Maps"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>All Maps</span>
          </Link>
          <Link
            href={buildProjectStartChooserPath(`/project/${projectId}`)}
            className="flex h-11 w-11 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            title="New Map"
            aria-label="New Map"
          >
            <FolderPlus className="h-[18px] w-[18px]" aria-hidden="true" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{project.name}</h1>
            {project.repoUrl && (
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Generated architecture overview · not verified source truth
              </p>
            )}
            {project.repoCommitSha && (
              <p className="font-mono text-[11px] text-[var(--muted-foreground)]">
                Scanned {project.repoCommitSha.slice(0, 7)}
                {project.repoAnalysisStatus === "partial" ? " · partial analysis" : ""}
                {project.repoScannedAt
                  ? ` · ${new Date(project.repoScannedAt).toLocaleDateString()}`
                  : ""}
              </p>
            )}
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:justify-end">
            <AddNodeDropdown onAddNode={handleAddNode} customSubtypes={customSubtypes} />
            {nodeCount > 0 && (
              <ExportDropdown
                rfInstanceRef={rfInstanceRef}
                projectName={project.name}
                alternatives={alternatives}
                onError={setToast}
              />
            )}
            {nodeCount > 0 && (
              <button
                onClick={handleExportPrd}
                disabled={prdLoading}
                className="flex min-h-11 items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-50"
                title="Generate PRD from architecture"
                aria-label="Generate PRD from architecture"
              >
                <Sparkles className="h-[14px] w-[14px]" aria-hidden="true" />
                <span>{prdLoading ? "Generating..." : "PRD"}</span>
              </button>
            )}
            {nodeCount > 0 && (
              <button
                ref={saveTemplateInvokerRef}
                onClick={() => setSaveTemplateModalOpen(true)}
                className="min-h-11 rounded-md border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                title="Save current map as a personal template"
              >
                Save as Template
              </button>
            )}
            {project.repoUrl ? (
              <button
                ref={rescanInvokerRef}
                onClick={() => {
                  if (nodeCount > 0) setRescanConfirmOpen(true);
                  else startRepositoryRescan();
                }}
                className="group relative flex h-11 w-11 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
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
                  className="min-h-11 rounded-md border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                  title="Map a public GitHub repository"
                >
                  Map repository
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
                      type="text"
                      inputMode="url"
                      value={scanUrlInput}
                      onChange={(e) => setScanUrlInput(e.target.value)}
                      placeholder="owner/repo"
                      className="min-h-11 w-56 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={!scanUrlInput.trim()}
                      className="min-h-11 rounded-md bg-[var(--brand)] px-3 py-2 text-xs text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)] disabled:opacity-50"
                    >
                      Map
                    </button>
                  </form>
                )}
              </>
            )}
            <EditorDisplaySettingsDropdown
              value={editorDisplaySettings}
              onChange={setEditorDisplaySettings}
            />
            <ThemeToggle />
          </div>
        </div>

        {/* Canvas area */}
        <div className="relative flex-1 bg-[var(--canvas)]">
          <EditorDisplaySettingsProvider value={editorDisplaySettings}>
            <ReactFlow
              nodes={rfNodes}
              edges={edgesWithCallbacks}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={handleConnect}
              onNodeClick={handleNodeClick}
              onEdgeClick={handleEdgeClick}
              onPaneClick={handlePaneClick}
              onInit={(instance) => {
                rfInstanceRef.current = instance;
              }}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              snapToGrid
              snapGrid={[20, 20]}
              deleteKeyCode={null}
              onError={handleReactFlowError}
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
          </EditorDisplaySettingsProvider>

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
                <p className="text-lg font-medium">Mapping the architecture...</p>
                <p className="mt-1 text-sm">Reading the evidence and connecting the pieces</p>
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
                <p className="text-lg font-medium">No architecture map yet</p>
                <p className="mt-1 text-sm">Ask an architecture question or add a component</p>
              </div>
            </div>
          )}

          {/* Edge Legend */}
          {canUseConnectionTypes && <EdgeLegend />}

          {/* Connection Type Selector popover */}
          {canUseConnectionTypes && connectionTypePopover && (
            <ConnectionTypeSelector
              position={connectionTypePopover.position}
              selectedType={
                connectionTypePopover.mode === "edit"
                  ? rfEdges.find((edge) => edge.id === connectionTypePopover.edgeId)?.data
                      ?.connectionType
                  : undefined
              }
              onSelect={handleConnectionTypeSelect}
              onCancel={handleCancelConnection}
            />
          )}

          {/* Node Detail Panel (overlays canvas from right) */}
          <NodeDetailPanel
            node={selectedNode}
            open={nodePanelOpen}
            onUpdate={handleNodeUpdate}
            onDelete={handleNodeDelete}
            onClose={handleClosePanel}
            customSubtypes={customSubtypes}
            alternatives={selectedNode ? alternatives[selectedNode.id] : undefined}
            alternativesLoading={altLoading}
            showDescription
            canUseNodeLocking
            onSuggestAlternatives={handleSuggestAlternatives}
            onSwapAlternative={handleSwapAlternative}
          />

          {/* Save Template Modal */}
          {saveTemplateModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)]">
              <div
                ref={saveTemplateDialogRef}
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
                      className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                      placeholder="e.g., Microservices API Template"
                      data-autofocus
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
                      className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                      placeholder="Describe when to use this template..."
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSaveTemplateModalOpen(false)}
                      disabled={templateSaving}
                      className="min-h-11 rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--muted)] disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={templateSaving}
                      className="min-h-11 rounded-md bg-[var(--brand)] px-4 py-2 text-sm text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)] disabled:opacity-50"
                    >
                      {templateSaving ? "Saving..." : "Save Template"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {rescanConfirmOpen &&
            typeof document !== "undefined" &&
            createPortal(
              <div
                data-rescan-modal-root
                className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)]"
                onClick={() => setRescanConfirmOpen(false)}
              >
                <div
                  ref={rescanDialogRef}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="rescan-title"
                  className="mx-4 w-full max-w-md rounded-md border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl"
                  onClick={(event) => event.stopPropagation()}
                >
                  <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--color-api)]">
                    Repository update
                  </p>
                  <h3 id="rescan-title" className="mt-2 text-xl font-semibold">
                    Replace this architecture map?
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">
                    Re-scanning reads the latest public repository state and replaces the generated
                    map and architecture chat. Manual canvas changes are not merged into the new
                    map.
                  </p>
                  {project.repoAnalysisWarning && (
                    <p className="mt-3 rounded-md bg-[var(--muted)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
                      Current scan note: {project.repoAnalysisWarning}
                    </p>
                  )}
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                    <a
                      href={`mailto:support@stackhatch.io?subject=${encodeURIComponent("Incorrect architecture map")}&body=${encodeURIComponent(`Public repository: ${project.repoUrl ?? "Not attached"}\nScanned commit: ${project.repoCommitSha ?? "Unknown"}\n\nWhat looks incorrect?\n`)}`}
                      className="text-sm text-[var(--muted-foreground)] underline-offset-4 hover:text-[var(--foreground)] hover:underline"
                    >
                      Report an incorrect map
                    </a>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setRescanConfirmOpen(false)}
                        data-autofocus
                        className="min-h-11 rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--muted)]"
                      >
                        Keep current map
                      </button>
                      <button
                        type="button"
                        onClick={startRepositoryRescan}
                        className="min-h-11 rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)]"
                      >
                        Re-scan repository
                      </button>
                    </div>
                  </div>
                </div>
              </div>,
              document.body
            )}

          {aiSetupRequired && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)]"
              onClick={() => setAiSetupRequired(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="ai-setup-title"
                className="mx-4 w-full max-w-sm rounded-lg bg-[var(--card)] p-6 shadow-xl"
                onClick={(event) => event.stopPropagation()}
              >
                <h3 id="ai-setup-title" className="text-lg font-semibold">
                  Connect Anthropic to continue
                </h3>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                  Add your own Anthropic API key in Settings. It is encrypted at rest and AI usage
                  is billed directly by Anthropic.
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setAiSetupRequired(false)}
                    className="min-h-11 rounded-md border border-[var(--border)] px-4 py-2 text-sm"
                  >
                    Cancel
                  </button>
                  <Link
                    href="/settings?setup=anthropic"
                    className="inline-flex min-h-11 items-center rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-[var(--brand-foreground)]"
                  >
                    Open Settings
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Toast notification */}
          {toast && (
            <div
              className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-[var(--danger)] px-4 py-2 text-sm text-[var(--danger-foreground)] shadow-lg shadow-[var(--shadow-color)]"
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
