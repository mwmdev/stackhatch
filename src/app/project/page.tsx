"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowLeft, Ellipsis, FolderPlus, LayoutTemplate, RefreshCw, Sparkles } from "lucide-react";
import ReactFlow, {
  Background,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import ChatSidebar, {
  type ArchitectureStreamOutcome,
  type ArchitectureUpdateMeta,
} from "@/components/chat/ChatSidebar";
import NodeDetailPanel from "@/components/canvas/NodeDetailPanel";
import ConnectionTypeSelector from "@/components/canvas/ConnectionTypeSelector";
import StackNodeComponent, { type StackNodeData } from "@/components/canvas/StackNode";
import StackEdgeComponent, { edgeStyles, type StackEdgeData } from "@/components/canvas/StackEdge";
import EdgeLegend from "@/components/canvas/EdgeLegend";
import ExportDropdown from "@/components/canvas/ExportDropdown";
import EditorToolSurface from "@/components/canvas/EditorToolSurface";
import {
  DEFAULT_EDITOR_DISPLAY_SETTINGS,
  EditorDisplaySettingsProvider,
  type EditorDisplaySettings,
} from "@/components/canvas/EditorDisplaySettings";
import ThemeToggle from "@/components/ThemeToggle";
import StackHatchWordmark from "@/components/shells/StackHatchWordmark";
import IconControl from "@/components/ui/IconControl";
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
import type { CustomSubtypesMap } from "@/lib/custom-subtypes";
import { buildLocalProjectPath, parseLocalProjectId } from "@/lib/app-route";
import {
  buildProjectStartChooserPath,
  consumePendingProjectStart,
  getPendingProjectStart,
} from "@/lib/project-start";
import {
  createCanvasPersistenceCoordinator,
  type CanvasPersistenceCommit,
  type CanvasPersistenceCoordinator,
} from "@/lib/canvas-persistence";
import type { VaultProjectRecord } from "@/lib/vault/schema";
import {
  getBrowserWorkspaceVault,
  type WorkspaceProjectPrecondition,
  type WorkspaceVault,
} from "@/lib/vault/workspace";

type Project = VaultProjectRecord & {
  repoCommitSha?: string | null;
  repoScannedAt?: number | string | null;
  repoAnalysisStatus?: "complete" | "partial" | null;
  repoAnalysisWarning?: string | null;
};

function EditorStateShell({
  eyebrow,
  title,
  children,
  newMapHref,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  newMapHref: string;
}) {
  return (
    <main className="app-resolver-shell text-[var(--foreground)]" data-testid="editor-state-shell">
      <header className="absolute inset-x-0 top-0 z-10 flex min-w-0 items-center justify-between gap-3 border-b border-[var(--boundary)] bg-[var(--paper)] px-2 py-1.5 sm:px-4">
        <StackHatchWordmark href="/app/maps" label="All Maps" />
        <div className="flex flex-none items-center gap-1" aria-label="Application actions">
          <IconControl href={newMapHref} label="New Map" tooltipPlacement="bottom">
            <FolderPlus />
          </IconControl>
          <ThemeToggle />
        </div>
      </header>
      <section className="relative z-[1] w-full max-w-md rounded-[var(--radius-surface)] border border-[var(--boundary)] bg-[var(--paper)] p-6 shadow-[var(--shadow-low)]">
        <p className="font-utility text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--blueprint)]">
          {eyebrow}
        </p>
        <h1 className="font-display mt-2 text-2xl font-extrabold tracking-[-0.04em]">{title}</h1>
        <div className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">{children}</div>
      </section>
    </main>
  );
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

/** Stored canvasState extends StackArchitecture with persisted positions */
interface StoredCanvasState extends StackArchitecture {
  positions?: Record<string, { x: number; y: number }>;
  alternatives?: Record<string, AlternativeNode[]>;
}

function buildStoredCanvasState(
  nodes: Node<StackNodeData>[],
  edges: Edge<StackEdgeData>[],
  alternatives: Record<string, AlternativeNode[]>
): StoredCanvasState {
  return {
    nodes: fromReactFlowNodes(nodes),
    edges: fromReactFlowEdges(edges),
    positions: Object.fromEntries(nodes.map((node) => [node.id, node.position])),
    alternatives,
  };
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

function getProjectIdentity(project: Project) {
  if (!project.repoUrl) {
    return {
      accessibleLabel: `${project.name}. Standalone map.`,
      detailTitle: "Standalone map",
      qualifier: null,
      visibleText: "Standalone map",
    };
  }

  const qualifier = "Generated architecture overview · not verified source truth";
  const accessibleLabel = `${project.name}. Repository map for ${project.repoUrl}.`;
  const titlePrefix = `Generated architecture overview for ${project.repoUrl}; not verified source truth`;

  if (!project.repoCommitSha) {
    return {
      accessibleLabel,
      detailTitle: titlePrefix,
      qualifier,
      visibleText: "Repository map · generated overview",
    };
  }

  const partialTitle = project.repoAnalysisStatus === "partial" ? "; partial analysis" : "";
  const scannedDate = project.repoScannedAt
    ? ` on ${new Date(project.repoScannedAt).toLocaleDateString()}`
    : "";
  const partialLabel = project.repoAnalysisStatus === "partial" ? " · partial analysis" : "";

  return {
    accessibleLabel,
    detailTitle: `${titlePrefix}. Scanned ${project.repoCommitSha}${partialTitle}${scannedDate}`,
    qualifier,
    visibleText: `Scanned ${project.repoCommitSha.slice(0, 7)}${partialLabel}`,
  };
}

export default function ProjectPage({ vault }: { vault?: WorkspaceVault }) {
  const [workspaceVault] = useState(() => vault ?? getBrowserWorkspaceVault());
  const [projectId, setProjectId] = useState<string | null | undefined>(undefined);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveError, setSaveError] = useState("");
  const [saveRecoveryPending, setSaveRecoveryPending] = useState(false);
  const [selectedNode, setSelectedNode] = useState<StackNode | null>(null);
  const [nodePanelOpen, setNodePanelOpen] = useState(false);
  const [connectionTypePopover, setConnectionTypePopover] = useState<ConnectionTypePopover | null>(
    null
  );
  const [toast, setToast] = useState<string | null>(null);
  const [customSubtypes, setCustomSubtypes] = useState<CustomSubtypesMap>({});
  const [scanTrigger, setScanTrigger] = useState(0);
  const [chatStreaming, setChatStreaming] = useState(false);
  const [architectureStreamPhase, setArchitectureStreamPhase] = useState<
    "idle" | "preparing" | "streaming" | "reconciling" | "reconciliation-failed"
  >("idle");
  const [chatOpen, setChatOpen] = useState(false);
  const [alternatives, setAlternatives] = useState<Record<string, AlternativeNode[]>>({});
  const [altLoading, setAltLoading] = useState(false);
  const [prdLoading, setPrdLoading] = useState(false);
  const [prdStatus, setPrdStatus] = useState("");
  const [saveTemplateModalOpen, setSaveTemplateModalOpen] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
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
  const persistenceRef = useRef<CanvasPersistenceCoordinator<StoredCanvasState> | null>(null);
  const rescanDialogRef = useRef<HTMLDivElement | null>(null);
  const rescanInvokerRef = useRef<HTMLButtonElement | null>(null);
  const saveTemplateDialogRef = useRef<HTMLDivElement | null>(null);
  const morePopoverRef = useRef<HTMLDivElement | null>(null);
  const moreMenuInvokerRef = useRef<HTMLButtonElement | null>(null);
  const canvasFocusTargetRef = useRef<HTMLDivElement | null>(null);
  const nodePanelCloseTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const projectRef = useRef<Project | null>(null);
  const acknowledgedProjectRef = useRef<Project | null>(null);
  const initializedRef = useRef(false);
  const skipNextPersistencePublishRef = useRef(false);
  const alternativesRef = useRef<Record<string, AlternativeNode[]>>({});
  const architectureStreamActiveRef = useRef(false);
  const saveBlockedRef = useRef(false);
  const authoritativeUpdatedAtRef = useRef<number | null>(null);
  const preStreamRef = useRef<{ snapshot: StoredCanvasState; updatedAt: number } | null>(null);
  const firstMapTrackedRef = useRef(false);
  const canUseConnectionTypes = true;
  const morePopoverId = `editor-more-${useId()}`;
  const isCanvasMutationBlocked = useCallback(
    () => architectureStreamActiveRef.current || saveBlockedRef.current,
    []
  );

  const startRepositoryRescan = useCallback(() => {
    if (isCanvasMutationBlocked()) return;
    setRescanConfirmOpen(false);
    setChatOpen(true);
    setScanTrigger((trigger) => trigger + 1);
  }, [isCanvasMutationBlocked]);

  const focusCanvasTarget = useCallback(() => {
    window.requestAnimationFrame(() => canvasFocusTargetRef.current?.focus());
  }, []);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (isCanvasMutationBlocked()) return;
      onNodesChange(changes);
    },
    [isCanvasMutationBlocked, onNodesChange]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (isCanvasMutationBlocked()) return;
      onEdgesChange(changes);
    },
    [isCanvasMutationBlocked, onEdgesChange]
  );

  const handleChatOpenChange = useCallback(
    (nextOpen: boolean) => {
      setChatOpen(nextOpen);
      if (!nextOpen) focusCanvasTarget();
    },
    [focusCanvasTarget]
  );

  const dismissMoreMenu = useCallback((restoreInvokerFocus = false) => {
    morePopoverRef.current?.hidePopover?.();
    if (restoreInvokerFocus) moreMenuInvokerRef.current?.focus();
  }, []);

  const handleZoomIn = useCallback(() => {
    void rfInstanceRef.current?.zoomIn();
  }, []);

  const handleZoomOut = useCallback(() => {
    void rfInstanceRef.current?.zoomOut();
  }, []);

  const handleFitView = useCallback(() => {
    void rfInstanceRef.current?.fitView({ padding: 0.16 });
  }, []);

  // Keep refs in sync for use in stable callbacks
  projectRef.current = project;
  alternativesRef.current = alternatives;
  saveBlockedRef.current = Boolean(saveError);

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

  useEffect(() => {
    const readProjectId = () => setProjectId(parseLocalProjectId(window.location.hash));
    readProjectId();
    window.addEventListener("hashchange", readProjectId);
    return () => window.removeEventListener("hashchange", readProjectId);
  }, []);

  // --- Stable callbacks for node data (context menu actions) ---

  const handleLockToggle = useCallback(
    (id: string, locked: boolean) => {
      if (isCanvasMutationBlocked()) return;
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
    [isCanvasMutationBlocked, setRfNodes]
  );

  const handleNodeDelete = useCallback(
    (id: string) => {
      if (isCanvasMutationBlocked()) return;
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
    [isCanvasMutationBlocked, setRfNodes, setRfEdges]
  );

  // --- Revision-ordered canvas persistence ---

  const writeCanvasSnapshot = useCallback(
    async (
      snapshot: StoredCanvasState,
      precondition: WorkspaceProjectPrecondition
    ): Promise<CanvasPersistenceCommit> => {
      const currentProject = acknowledgedProjectRef.current;
      if (!currentProject || currentProject.id !== projectId) {
        throw new Error("The local project changed before its canvas could be saved");
      }
      const saved = (await workspaceVault.saveCanvas(
        currentProject,
        snapshot,
        precondition
      )) as Project;
      acknowledgedProjectRef.current = saved;
      authoritativeUpdatedAtRef.current = saved.updatedAt;
      setSaveError("");
      return {
        projectRevision: saved.revision,
        vaultGeneration: precondition.expectedGeneration,
      };
    },
    [projectId, workspaceVault]
  );

  useEffect(() => {
    if (!initializedRef.current || !persistenceRef.current) return;
    if (skipNextPersistencePublishRef.current) {
      skipNextPersistencePublishRef.current = false;
      return;
    }
    persistenceRef.current.publish(buildStoredCanvasState(rfNodes, rfEdges, alternatives));
  }, [rfNodes, rfEdges, alternatives]);

  useEffect(() => {
    return () => {
      const coordinator = persistenceRef.current;
      persistenceRef.current = null;
      if (coordinator) void coordinator.dispose().catch(() => undefined);
    };
  }, [projectId]);

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
    const templateInvoker = moreMenuInvokerRef.current;
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
      if (isCanvasMutationBlocked()) return;
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
    [isCanvasMutationBlocked, setRfEdges]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (isCanvasMutationBlocked()) return;
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
    [addConnectionEdge, canUseConnectionTypes, isCanvasMutationBlocked]
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
      if (isCanvasMutationBlocked()) return;
      if (!connectionTypePopover) return;
      if (connectionTypePopover.mode === "create") {
        addConnectionEdge(connectionTypePopover.sourceId, connectionTypePopover.targetId, type);
        setConnectionTypePopover(null);
        focusCanvasTarget();
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
      focusCanvasTarget();
    },
    [
      addConnectionEdge,
      connectionTypePopover,
      focusCanvasTarget,
      isCanvasMutationBlocked,
      setRfEdges,
    ]
  );

  const handleCancelConnection = useCallback(() => {
    setConnectionTypePopover(null);
    focusCanvasTarget();
  }, [focusCanvasTarget]);

  // --- Edge label editing ---

  const handleEdgeLabelChange = useCallback(
    (edgeId: string, newLabel: string) => {
      if (isCanvasMutationBlocked()) return;
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
    [isCanvasMutationBlocked, setRfEdges]
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
    setPrdStatus("Generating PRD...");
    setPrdLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/export-prd`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.code === "AI_NOT_CONFIGURED") {
          setPrdStatus("PRD export needs Anthropic setup.");
          setAiSetupRequired(true);
          return;
        }
        setPrdStatus("PRD export failed.");
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
      setPrdStatus("PRD exported.");
    } catch {
      setPrdStatus("PRD export failed.");
      setToast("Failed to generate PRD");
    } finally {
      setPrdLoading(false);
    }
  }, [project, projectId]);

  // --- Add node ---

  const handleAddNode = useCallback(
    (category: NodeCategory, subtype: NodeSubtype) => {
      if (isCanvasMutationBlocked()) return;
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
    [
      customSubtypes,
      handleLockToggle,
      handleNodeDelete,
      isCanvasMutationBlocked,
      openNodePanel,
      setRfNodes,
    ]
  );

  // --- Detail panel update ---

  const handleNodeUpdate = useCallback(
    (id: string, updates: Partial<StackNode>) => {
      if (isCanvasMutationBlocked()) return;
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
    [isCanvasMutationBlocked, setRfNodes]
  );

  const handleClosePanel = useCallback(() => {
    closeNodePanel();
    focusCanvasTarget();
  }, [closeNodePanel, focusCanvasTarget]);

  // --- Suggest alternatives ---

  const handleSuggestAlternatives = useCallback(async () => {
    const node = selectedNode;
    if (!node || isCanvasMutationBlocked()) return;
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
      if (data.alternatives && !isCanvasMutationBlocked()) {
        setAlternatives((prev) => ({ ...prev, [node.id]: data.alternatives }));
      }
    } finally {
      setAltLoading(false);
    }
  }, [selectedNode, projectId, isCanvasMutationBlocked]);

  // --- Swap alternative ---

  const handleSwapAlternative = useCallback(
    (alt: AlternativeNode) => {
      if (isCanvasMutationBlocked()) return;
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
    [selectedNode, handleNodeUpdate, isCanvasMutationBlocked]
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

        await workspaceVault.saveTemplate({
          name: templateName,
          description: templateDescription ?? null,
          canvasState,
        });

        setToast("Template saved successfully!");
        setSaveTemplateModalOpen(false);
      } catch {
        setToast("Failed to save template");
      } finally {
        setTemplateSaving(false);
      }
    },
    [rfNodes, rfEdges, workspaceVault]
  );

  // --- AI architecture handler ---

  const adoptArchitecture = useCallback(
    async (
      incoming: StackArchitecture,
      meta?: ArchitectureUpdateMeta,
      forceReplacement = false
    ) => {
      try {
        const coordinator = persistenceRef.current;
        if (!coordinator?.getState().suspended) {
          throw new Error("Architecture replacement started without a persistence barrier");
        }
        if (!incoming?.nodes || !Array.isArray(incoming.nodes)) {
          setToast("Failed to update canvas: invalid architecture data");
          throw new Error("Invalid architecture data");
        }

        const currentCanvas = projectRef.current?.canvasState;
        const isFirst = !currentCanvas || currentCanvas.nodes.length === 0;
        const isReplacement = forceReplacement || meta?.source === "scan";

        let finalArch: StackArchitecture;
        let posMap: Map<string, { x: number; y: number }>;

        if (isFirst || isReplacement) {
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

        const replacementAlternatives = isReplacement ? {} : alternativesRef.current;
        if (isReplacement) {
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

        await coordinator.persistReplacement(
          buildStoredCanvasState(newRfNodes, newRfEdges, replacementAlternatives)
        );

        if (isFirst && !firstMapTrackedRef.current) {
          firstMapTrackedRef.current = true;
          consumePendingProjectStart();
        }

        setTimeout(() => rfInstanceRef.current?.fitView({ padding: 0.2, duration: 300 }), 100);
      } catch (error) {
        setToast("Failed to update canvas");
        throw error;
      }
    },
    [rfNodes, buildRfNodes, setRfNodes, setRfEdges]
  );

  const handleArchitecture = useCallback(
    (incoming: StackArchitecture, meta?: ArchitectureUpdateMeta) =>
      adoptArchitecture(incoming, meta),
    [adoptArchitecture]
  );

  const restoreCanvasSnapshot = useCallback(
    (snapshot: StoredCanvasState) => {
      const positions = snapshot.positions
        ? new Map(Object.entries(snapshot.positions))
        : new Map(
            applyDagreLayout(snapshot.nodes, snapshot.edges).map((item) => [item.id, item.position])
          );
      const restoredNodes = buildRfNodes(snapshot.nodes, positions);
      const restoredEdges = toReactFlowEdges(snapshot.edges);
      const restoredAlternatives = snapshot.alternatives ?? {};

      alternativesRef.current = restoredAlternatives;
      setRfNodes(restoredNodes);
      setRfEdges(restoredEdges);
      setAlternatives(restoredAlternatives);
      setSelectedNode(null);
      setNodePanelOpen(false);
      setConnectionTypePopover(null);
      setProject((previous) =>
        previous
          ? {
              ...previous,
              canvasState: { nodes: snapshot.nodes, edges: snapshot.edges },
            }
          : previous
      );
    },
    [buildRfNodes, setRfEdges, setRfNodes]
  );

  const releaseArchitectureBarrier = useCallback(() => {
    persistenceRef.current?.resume();
    architectureStreamActiveRef.current = false;
    preStreamRef.current = null;
    setArchitectureStreamPhase("idle");
  }, []);

  const handleArchitectureStreamStart = useCallback(async () => {
    const coordinator = persistenceRef.current;
    const currentProject = projectRef.current;
    if (!coordinator || !currentProject || architectureStreamActiveRef.current) {
      throw new Error("Architecture update is unavailable");
    }

    architectureStreamActiveRef.current = true;
    const snapshot = coordinator.getLatestSnapshot();
    setArchitectureStreamPhase("preparing");
    try {
      await coordinator.suspendAndFlush();
      preStreamRef.current = {
        snapshot,
        updatedAt: authoritativeUpdatedAtRef.current ?? currentProject.updatedAt,
      };
      setArchitectureStreamPhase("streaming");
    } catch (error) {
      releaseArchitectureBarrier();
      throw error;
    }
  }, [releaseArchitectureBarrier]);

  const reconcileArchitectureStream = useCallback(async () => {
    const coordinator = persistenceRef.current;
    const preStream = preStreamRef.current;
    if (!coordinator || !preStream) {
      releaseArchitectureBarrier();
      return;
    }

    setArchitectureStreamPhase("reconciling");
    try {
      if (!projectId) throw new Error("The local project identifier is missing");
      const authoritative = (await workspaceVault.getProject(projectId)) as Project | null;
      if (!authoritative) throw new Error("The local project no longer exists");
      const serverAdvanced = authoritative.updatedAt !== preStream.updatedAt;
      authoritativeUpdatedAtRef.current = authoritative.updatedAt;

      if (serverAdvanced && authoritative.canvasState) {
        setProject(authoritative);
        await adoptArchitecture(authoritative.canvasState, undefined, true);
      } else {
        coordinator.restoreAcknowledgedSnapshot(preStream.snapshot);
        restoreCanvasSnapshot(preStream.snapshot);
      }
      releaseArchitectureBarrier();
    } catch {
      setArchitectureStreamPhase("reconciliation-failed");
    }
  }, [
    adoptArchitecture,
    projectId,
    releaseArchitectureBarrier,
    restoreCanvasSnapshot,
    workspaceVault,
  ]);

  const handleArchitectureStreamEnd = useCallback(
    async (outcome: ArchitectureStreamOutcome) => {
      if (outcome === "completed") {
        releaseArchitectureBarrier();
        return;
      }
      await reconcileArchitectureStream();
    },
    [reconcileArchitectureStream, releaseArchitectureBarrier]
  );

  // --- Load project ---

  useEffect(() => {
    if (projectId === undefined) return;
    if (projectId === null) {
      initializedRef.current = false;
      persistenceRef.current = null;
      setProject(null);
      setError("This link does not identify a valid map on this device.");
      setLoading(false);
      return;
    }

    const requestedProjectId = projectId;
    let cancelled = false;
    async function loadProject() {
      setLoading(true);
      setError("");
      setSaveError("");
      try {
        initializedRef.current = false;
        const [loadedCustomSubtypes, projectSnapshot] = await Promise.all([
          workspaceVault.getCustomSubtypes(),
          workspaceVault.getProjectSnapshot(requestedProjectId),
        ]);
        if (cancelled) return;
        setCustomSubtypes(loadedCustomSubtypes);
        if (!projectSnapshot) {
          setProject(null);
          setError("Map not found on this device. It may have been cleared in another tab.");
          return;
        }
        const { project: data, generation } = projectSnapshot;
        const loadedProject = data as Project;
        setProject(loadedProject);
        projectRef.current = loadedProject;
        acknowledgedProjectRef.current = loadedProject;
        authoritativeUpdatedAtRef.current = data.updatedAt;
        const hasLoadedCanvas = (data.canvasState?.nodes?.length ?? 0) > 0;
        setChatOpen(false);

        const pendingStartMethod = getPendingProjectStart();
        const tracksOnLoad =
          (pendingStartMethod === "blank" && !hasLoadedCanvas) ||
          (pendingStartMethod === "template" && hasLoadedCanvas);
        if (tracksOnLoad && !firstMapTrackedRef.current) {
          firstMapTrackedRef.current = true;
          consumePendingProjectStart();
        }

        let persistenceBaseline: StoredCanvasState;

        // Initialize React Flow state from loaded canvas
        if (data.canvasState?.nodes?.length) {
          const stored = data.canvasState as StoredCanvasState;
          setAlternatives(stored.alternatives ?? {});
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
          persistenceBaseline = buildStoredCanvasState(nodes, edges, stored.alternatives ?? {});
        } else {
          setRfNodes([]);
          setRfEdges([]);
          setAlternatives({});
          persistenceBaseline = { nodes: [], edges: [], positions: {}, alternatives: {} };
        }

        persistenceRef.current = createCanvasPersistenceCoordinator({
          baseline: persistenceBaseline,
          baselineCommit: {
            projectRevision: loadedProject.revision,
            vaultGeneration: generation,
          },
          writer: ({ snapshot, expectedProjectRevision, expectedVaultGeneration }) => {
            if (expectedProjectRevision === undefined || expectedVaultGeneration === undefined) {
              throw new Error("The local persistence baseline is missing");
            }
            return writeCanvasSnapshot(snapshot, {
              expectedProjectRevision,
              expectedGeneration: expectedVaultGeneration,
            });
          },
          onBackgroundError: () =>
            setSaveError(
              "Auto-save paused because browser storage rejected this revision. Your visible edits remain in this tab."
            ),
        });
        skipNextPersistencePublishRef.current = true;
        initializedRef.current = true;
        void workspaceVault.recordProjectOpen(requestedProjectId).catch(() => {
          if (!cancelled) {
            setToast("The map opened, but browser storage could not update your recent map.");
          }
        });
      } catch {
        if (!cancelled) {
          setProject(null);
          setError(
            "This map could not be read from browser storage. Check storage permissions, then retry."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadProject();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadAttempt, projectId, workspaceVault]);

  useEffect(() => {
    if (!projectId) return;
    return workspaceVault.subscribeInvalidation((invalidation) => {
      if (invalidation.projectId === projectId && invalidation.stores.includes("projects")) {
        setSaveError(
          invalidation.reason === "deletion"
            ? "This map was deleted in another tab. Your visible snapshot remains here until you choose what to do."
            : "This map changed in another tab. Auto-save is paused so neither version is silently overwritten."
        );
      }
    });
  }, [projectId, workspaceVault]);

  // --- Derived state ---

  const hasCanvas = useMemo(
    () => project?.canvasState !== null && (project?.canvasState?.nodes?.length ?? 0) > 0,
    [project?.canvasState]
  );
  const nodeCount = project?.canvasState?.nodes?.length ?? 0;
  const editorNewMapHref = buildProjectStartChooserPath(
    projectId ? buildLocalProjectPath(projectId) : null
  );
  const canvasMutationBlocked = architectureStreamPhase !== "idle" || Boolean(saveError);
  const toolSurfaceObscured = chatOpen || nodePanelOpen || connectionTypePopover !== null;
  const toolSurfaceDialogOpen = saveTemplateModalOpen || rescanConfirmOpen || aiSetupRequired;
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

  const retryLocalSave = useCallback(async () => {
    const coordinator = persistenceRef.current;
    if (!coordinator) return;
    setSaveRecoveryPending(true);
    try {
      await coordinator.flushLatest();
      setSaveError("");
    } catch {
      setSaveError(
        "Auto-save is still paused. You can reload the stored map, save this snapshot as a copy, or explicitly overwrite it."
      );
    } finally {
      setSaveRecoveryPending(false);
    }
  }, []);

  const reloadStoredMap = useCallback(() => {
    persistenceRef.current = null;
    setSaveError("");
    setLoadAttempt((attempt) => attempt + 1);
  }, []);

  const duplicateLocalSnapshot = useCallback(async () => {
    const current = projectRef.current;
    const snapshot = persistenceRef.current?.getLatestSnapshot();
    if (!current || !snapshot) return;
    setSaveRecoveryPending(true);
    try {
      const duplicate = await workspaceVault.createProject({
        name: `${current.name} – Local copy`,
        description: current.description,
        repoUrl: current.repoUrl,
        canvasState: snapshot,
      });
      window.location.hash = encodeURIComponent(duplicate.id);
    } catch {
      setSaveError("This snapshot could not be saved as a copy. Check browser storage and retry.");
    } finally {
      setSaveRecoveryPending(false);
    }
  }, [workspaceVault]);

  const overwriteStoredMap = useCallback(async () => {
    const snapshot = persistenceRef.current?.getLatestSnapshot();
    if (!projectId || !snapshot) return;
    setSaveRecoveryPending(true);
    try {
      await workspaceVault.overwriteCanvas(projectId, snapshot);
      persistenceRef.current = null;
      setSaveError("");
      setLoadAttempt((attempt) => attempt + 1);
    } catch {
      setSaveError(
        "The explicit overwrite did not commit. The visible snapshot remains in this tab."
      );
    } finally {
      setSaveRecoveryPending(false);
    }
  }, [projectId, workspaceVault]);
  if (loading) {
    return (
      <EditorStateShell
        eyebrow="Architecture workspace"
        title="Loading map"
        newMapHref={editorNewMapHref}
      >
        <p role="status" aria-live="polite">
          Loading...
        </p>
      </EditorStateShell>
    );
  }

  if (error || !project || !projectId) {
    return (
      <EditorStateShell
        eyebrow="Architecture workspace"
        title="Map unavailable"
        newMapHref={editorNewMapHref}
      >
        <p className="text-[var(--danger)]">{error || "Map not found on this device."}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/app/maps"
            className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--border)] px-4 py-2 font-semibold text-[var(--foreground)]"
          >
            View maps on this device
          </Link>
          <Link
            href="/project/new"
            className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-[var(--brand)] px-4 py-2 font-semibold text-[var(--brand-foreground)]"
          >
            Create a new map
          </Link>
          {projectId ? (
            <button
              type="button"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              className="min-h-11 rounded-[var(--radius-control)] px-4 py-2 font-semibold"
            >
              Retry browser storage
            </button>
          ) : null}
        </div>
      </EditorStateShell>
    );
  }

  const projectIdentity = getProjectIdentity(project);

  return (
    <main
      className="project-editor-shell observatory-editor flex flex-col bg-[var(--background)] text-[var(--foreground)] md:flex-row"
      data-testid="project-editor-shell"
      data-height-contract="viewport"
      data-ai-writer-phase={architectureStreamPhase}
      data-mutation-blocked={String(canvasMutationBlocked)}
    >
      <div
        id="editor-chat-sidebar"
        className={`flex-shrink-0 overflow-hidden transition-[height,width] duration-200 ease-out motion-reduce:transition-none ${
          chatOpen ? "h-[45vh] md:h-auto md:w-[400px]" : "h-0 md:h-auto md:w-0"
        }`}
      >
        {chatOpen ? (
          <ChatSidebar
            projectId={projectId}
            repoUrl={project.repoUrl}
            defaultOpen={!hasCanvas}
            open={chatOpen}
            onOpenChange={handleChatOpenChange}
            showCollapsedButton={false}
            scanTrigger={scanTrigger}
            canvasState={liveCanvasState}
            onArchitecture={handleArchitecture}
            onArchitectureStreamStart={handleArchitectureStreamStart}
            onArchitectureStreamEnd={handleArchitectureStreamEnd}
            onStreaming={setChatStreaming}
          />
        ) : null}
      </div>

      {/* Canvas Area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Project bar */}
        <div
          className="observatory-editor-project-bar flex min-w-0 flex-nowrap items-center gap-0 border-b border-[var(--border)] bg-[var(--background)] px-1 py-1.5 sm:gap-1 sm:px-2"
          data-testid="editor-project-bar"
          data-layout="single-row"
        >
          <IconControl
            href="/app/maps"
            label="All maps"
            tooltip="All maps"
            tooltipPlacement="bottom"
          >
            <ArrowLeft />
          </IconControl>
          <div
            className="min-w-0 flex-1 overflow-hidden px-1 sm:px-2"
            data-testid="project-identity"
            aria-label={projectIdentity.accessibleLabel}
          >
            <h1 className="truncate text-sm font-semibold" title={project.name}>
              {project.name}
            </h1>
            <div
              className="whitespace-nowrap text-[10px] leading-4 text-[var(--muted-foreground)]"
              data-testid="project-provenance"
              title={projectIdentity.detailTitle}
            >
              {projectIdentity.qualifier && (
                <span className="sr-only">{projectIdentity.qualifier}</span>
              )}
              {projectIdentity.visibleText}
            </div>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <div className="hidden sm:block" data-editor-action-group="wide-new-map">
              <IconControl
                href={editorNewMapHref}
                label="New Map"
                tooltip="New map"
                tooltipPlacement="bottom"
                title="New Map"
                data-testid="wide-new-map"
              >
                <FolderPlus />
              </IconControl>
            </div>
            {project.repoUrl && (
              <div className="hidden sm:block" data-editor-action-group="wide-rescan">
                <IconControl
                  label={`Re-scan repository: ${project.repoUrl}`}
                  tooltip="Re-scan repository"
                  tooltipPlacement="bottom"
                  variant="outline"
                  title={`Re-scan: ${project.repoUrl}`}
                  disabled={canvasMutationBlocked}
                  data-testid="wide-rescan-button"
                  onClick={(event) => {
                    rescanInvokerRef.current = event.currentTarget;
                    if (nodeCount > 0) setRescanConfirmOpen(true);
                    else startRepositoryRescan();
                  }}
                >
                  <RefreshCw />
                </IconControl>
              </div>
            )}
            {nodeCount > 0 && (
              <ExportDropdown
                rfInstanceRef={rfInstanceRef}
                projectName={project.name}
                alternatives={alternatives}
                onError={setToast}
              />
            )}
            <div className="flex-none" data-editor-action-group="more">
              <IconControl
                controlRef={moreMenuInvokerRef}
                label="More project actions"
                tooltip="More"
                tooltipPlacement="bottom"
                popoverTarget={morePopoverId}
                popoverTargetAction="toggle"
              >
                <Ellipsis />
              </IconControl>
              <div
                ref={morePopoverRef}
                id={morePopoverId}
                popover="auto"
                data-testid="editor-more-popover"
                className="fixed inset-auto right-16 top-16 z-50 m-0 max-h-[calc(100dvh-5rem)] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-[var(--radius-surface)] border border-[var(--border)] bg-[var(--surface-raised)] p-1 shadow-xl"
              >
                <Link
                  href={editorNewMapHref}
                  className="flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:hidden"
                >
                  <FolderPlus className="h-4 w-4" aria-hidden="true" />
                  New Map
                </Link>
                <div className="sm:hidden">
                  <ThemeToggle variant="row" />
                </div>
                {project.repoUrl && (
                  <button
                    type="button"
                    disabled={canvasMutationBlocked}
                    onClick={() => {
                      rescanInvokerRef.current = moreMenuInvokerRef.current;
                      dismissMoreMenu();
                      if (nodeCount > 0) setRescanConfirmOpen(true);
                      else {
                        startRepositoryRescan();
                        moreMenuInvokerRef.current?.focus();
                      }
                    }}
                    className="flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-left text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50 sm:hidden"
                    aria-label={`Re-scan repository: ${project.repoUrl}`}
                    data-testid="compact-rescan-button"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    Re-scan repository
                  </button>
                )}
                {nodeCount > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        dismissMoreMenu(true);
                        void handleExportPrd();
                      }}
                      disabled={prdLoading}
                      className="flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-left text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
                      aria-label="Generate PRD from architecture"
                    >
                      <Sparkles className="h-4 w-4" aria-hidden="true" />
                      <span>{prdLoading ? "Generating PRD..." : "Generate PRD"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        dismissMoreMenu();
                        setSaveTemplateModalOpen(true);
                      }}
                      className="flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-left text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                      title="Save current map as a personal template"
                    >
                      <LayoutTemplate className="h-4 w-4" aria-hidden="true" />
                      <span>Save as Template</span>
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="hidden sm:block" data-editor-action-group="wide-theme">
              <ThemeToggle />
            </div>
          </div>
        </div>

        <p className="sr-only" role="status" aria-live="polite">
          {prdStatus}
        </p>

        {/* Canvas area */}
        <div className="observatory-editor-workbench relative min-h-0 flex-1 overflow-hidden bg-[var(--canvas)]">
          {saveError && (
            <div
              role="alert"
              className="absolute left-1/2 top-4 z-40 w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 rounded-[var(--radius-surface)] border border-[var(--warning-border)] bg-[var(--surface-raised)] p-4 shadow-xl"
            >
              <p className="text-sm font-semibold text-[var(--foreground)]">
                Local auto-save paused
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">{saveError}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void retryLocalSave()}
                  disabled={saveRecoveryPending}
                  className="min-h-11 rounded-[var(--radius-control)] border border-[var(--border)] px-3 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  Retry save
                </button>
                <button
                  type="button"
                  onClick={reloadStoredMap}
                  disabled={saveRecoveryPending}
                  className="min-h-11 rounded-[var(--radius-control)] border border-[var(--border)] px-3 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  Reload stored map
                </button>
                <button
                  type="button"
                  onClick={() => void duplicateLocalSnapshot()}
                  disabled={saveRecoveryPending}
                  className="min-h-11 rounded-[var(--radius-control)] border border-[var(--border)] px-3 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  Save snapshot as a copy
                </button>
                <button
                  type="button"
                  onClick={() => void overwriteStoredMap()}
                  disabled={saveRecoveryPending}
                  className="min-h-11 rounded-[var(--radius-control)] bg-[var(--danger)] px-3 py-2 text-xs font-semibold text-[var(--danger-foreground)] disabled:opacity-50"
                >
                  Overwrite stored map
                </button>
              </div>
            </div>
          )}
          {architectureStreamPhase === "reconciliation-failed" && (
            <div
              role="alert"
              className="absolute left-1/2 top-4 z-40 flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 flex-col gap-3 rounded-[var(--radius-surface)] border border-[var(--danger)] bg-[var(--surface-raised)] p-4 shadow-xl sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-semibold text-[var(--foreground)]">
                  Save status unknown
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">
                  Editing and sign out are paused until StackHatch confirms the AI update.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void reconcileArchitectureStream()}
                className="min-h-11 shrink-0 rounded-[var(--radius-control)] bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-[var(--brand-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                Retry reconciliation
              </button>
            </div>
          )}
          <EditorDisplaySettingsProvider value={editorDisplaySettings}>
            <ReactFlow
              nodes={rfNodes}
              edges={edgesWithCallbacks}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={handleConnect}
              onNodeClick={handleNodeClick}
              onEdgeClick={handleEdgeClick}
              onPaneClick={handlePaneClick}
              nodesDraggable={!canvasMutationBlocked}
              nodesConnectable={!canvasMutationBlocked}
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
            </ReactFlow>
          </EditorDisplaySettingsProvider>

          <div
            ref={canvasFocusTargetRef}
            tabIndex={-1}
            aria-label="Map canvas"
            className="pointer-events-none absolute left-0 top-0 h-px w-px outline-none"
            data-testid="editor-canvas-focus-target"
          />

          <EditorToolSurface
            chatOpen={chatOpen}
            onChatOpenChange={handleChatOpenChange}
            onAddNode={handleAddNode}
            customSubtypes={customSubtypes}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onFitView={handleFitView}
            displaySettings={editorDisplaySettings}
            onDisplaySettingsChange={setEditorDisplaySettings}
            obscured={toolSurfaceObscured}
            dialogOpen={toolSurfaceDialogOpen}
            mutationBlocked={canvasMutationBlocked}
          />

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
          {canUseConnectionTypes && connectionTypePopover && !canvasMutationBlocked && (
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
            mutationBlocked={canvasMutationBlocked}
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
    </main>
  );
}
