"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import ReactFlow, {
  Background,
  getNodesBounds,
  getViewportForBounds,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type ReactFlowInstance,
  type OnConnectStartParams,
} from "reactflow";
import "reactflow/dist/style.css";
import ChatSidebar, {
  type ArchitectureStreamOutcome,
  type ArchitectureUpdateMeta,
} from "@/components/chat/ChatSidebar";
import ResizableChatSidebar from "@/components/chat/ResizableChatSidebar";
import NodeDetailPanel from "@/components/canvas/NodeDetailPanel";
import ConnectionTypeSelector from "@/components/canvas/ConnectionTypeSelector";
import CanvasAddNodeMenu from "@/components/canvas/CanvasAddNodeMenu";
import StackNodeComponent, { type StackNodeData } from "@/components/canvas/StackNode";
import StackEdgeComponent, { edgeStyles, type StackEdgeData } from "@/components/canvas/StackEdge";
import EdgeLegend from "@/components/canvas/EdgeLegend";
import ExportDropdown from "@/components/canvas/ExportDropdown";
import EditorToolSurface from "@/components/canvas/EditorToolSurface";
import {
  DEFAULT_EDITOR_DISPLAY_SETTINGS,
  EditorDisplaySettingsProvider,
  normalizeEditorDisplaySettings,
  type EditorDisplaySettings,
} from "@/components/canvas/EditorDisplaySettings";
import AppBar, { DeviceControls, NewMapLink } from "@/components/shells/AppBar";
import IconControl from "@/components/ui/IconControl";
import Modal from "@/components/ui/Modal";
import ProjectNameField from "@/components/canvas/ProjectNameField";
import EditorOverflowMenu from "@/components/canvas/EditorOverflowMenu";
import ProviderKeyField from "@/components/projects/ProviderKeyField";
import Toast, { type ToastMessage } from "@/components/ui/Toast";
import {
  toReactFlowNodes,
  toReactFlowEdges,
  fromReactFlowNodes,
  fromReactFlowEdges,
} from "@/types/canvas";
import type {
  StackNode,
  StackEdge,
  ConnectionSides,
  StackArchitecture,
  NodeCategory,
  NodeSubtype,
  ConnectionType,
  AlternativeNode,
} from "@/types/stack";
import { DEFAULT_NOTE_COLOR, getSubtypeConfig } from "@/lib/node-config";
import { applyDagreLayout } from "@/lib/layout";
import {
  applyLayoutMotion,
  easeLayoutProgress,
  LAYOUT_SETTLE_MS,
  type LayoutMotion,
} from "@/lib/layout-motion";
import { mergeArchitecture } from "@/lib/merge-architecture";
import {
  applyNonOverlappingNodeChanges,
  findNearestOpenPosition,
  resolveNodeOverlaps,
} from "@/lib/node-collision";
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
import {
  getBrowserProviderRunCoordinator,
  providerErrorDetails,
  type ProviderRunCoordinator,
} from "@/lib/ai/provider-run";

type Project = VaultProjectRecord & {
  repoCommitSha?: string | null;
  repoScannedAt?: number | string | null;
  repoAnalysisStatus?: "complete" | "partial" | null;
  repoAnalysisWarning?: string | null;
};

function EditorStateShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="app-shell">
      <AppBar />
      <main
        id="main"
        tabIndex={-1}
        className="page-gutter max-w-[48rem] py-11"
        data-testid="editor-state-shell"
      >
        <h1 className="type-section border-b-2 border-ink pb-3">{title}</h1>
        <div className="type-ui mt-5 text-ink2">{children}</div>
      </main>
    </div>
  );
}

type ConnectionTypePopover =
  | {
      mode: "create";
      sourceId: string;
      targetId: string;
      sides: ConnectionSides;
      position: { x: number; y: number };
    }
  | {
      mode: "edit";
      edgeId: string;
      position: { x: number; y: number };
    };

type ConnectionStartSide = "top" | "bottom" | "left" | "right";
type CanvasAddMenu = {
  /** Client coordinates: the menu origin and the node's anchor point. */
  position: { x: number; y: number };
  from?: { nodeId: string; handleType: "source" | "target"; side: ConnectionStartSide };
};
type NodeAnchor = "center" | "top" | "bottom" | "left" | "right";

// Rendered size of a node, mirroring `.stack-node` (`width: 12rem`, `min-height: 4.375rem`)
// in globals.css. Used to put the matching handle under the pointer.
const ADDED_NODE_WIDTH = 192;
const ADDED_NODE_HEIGHT = 70;

function positionForAnchor(point: { x: number; y: number }, anchor: NodeAnchor) {
  const halfWidth = ADDED_NODE_WIDTH / 2;
  const halfHeight = ADDED_NODE_HEIGHT / 2;
  switch (anchor) {
    case "center":
      return { x: point.x - halfWidth, y: point.y - halfHeight };
    case "top":
      return { x: point.x - halfWidth, y: point.y };
    case "bottom":
      return { x: point.x - halfWidth, y: point.y - ADDED_NODE_HEIGHT };
    case "left":
      return { x: point.x, y: point.y - halfHeight };
    case "right":
      return { x: point.x - ADDED_NODE_WIDTH, y: point.y - halfHeight };
  }
}

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

interface ProjectIdentity {
  accessibleLabel: string;
  detailTitle?: string;
  qualifier?: string | null;
  visibleText: string | null;
}

function briefSummary(description: string | null, projectName: string): string | null {
  if (!description) return null;
  const withoutHeading = description
    .trim()
    .replace(/^#{1,6}\s+([^\n]+)\n?/, (heading, text: string) =>
      text.trim().toLowerCase() === projectName.toLowerCase() ? "" : heading
    );
  const clean = withoutHeading
    .split(/\n\s*\n/)[0]
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(?:^|\n)\s{0,3}#{1,6}\s*/g, " ")
    .replace(/[*_`~>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(
      new RegExp(`^${projectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:—–-]?\\s*`, "i"),
      ""
    );
  const firstSentence = clean.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? clean;
  return firstSentence.slice(0, 160).trim() || null;
}

function getProjectIdentity(project: Project): ProjectIdentity {
  if (!project.repoUrl) {
    const description = briefSummary(project.description, project.name);
    return {
      accessibleLabel: `${project.name}.`,
      detailTitle: description ?? undefined,
      qualifier: null,
      visibleText: description,
    };
  }

  const titlePrefix = `Generated architecture overview for ${project.repoUrl}; not verified source truth`;

  if (!project.repoCommitSha) {
    return {
      accessibleLabel: `${project.name}. Repository map for ${project.repoUrl}, not scanned yet.`,
      detailTitle: `Staged from ${project.repoUrl}. Nothing has been scanned or generated yet.`,
      qualifier: null,
      visibleText: "Repository map, not scanned yet",
    };
  }

  return {
    accessibleLabel: `${project.name}. ${titlePrefix}.`,
    visibleText: null,
  };
}

export default function ProjectPage({
  vault,
  providerCoordinator: providedProviderCoordinator,
}: {
  vault?: WorkspaceVault;
  providerCoordinator?: ProviderRunCoordinator;
}) {
  const [workspaceVault] = useState(() => vault ?? getBrowserWorkspaceVault());
  const [providerCoordinator] = useState(
    () => providedProviderCoordinator ?? getBrowserProviderRunCoordinator()
  );
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
  const [canvasAddMenu, setCanvasAddMenu] = useState<CanvasAddMenu | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [customSubtypes, setCustomSubtypes] = useState<CustomSubtypesMap>({});
  const [scanTrigger, setScanTrigger] = useState(0);
  const [chatStreaming, setChatStreaming] = useState(false);
  const [chatMapping, setChatMapping] = useState(false);
  const [architectureStreamPhase, setArchitectureStreamPhase] = useState<
    "idle" | "preparing" | "streaming" | "reconciling" | "reconciliation-failed"
  >("idle");
  const [chatOpen, setChatOpen] = useState(false);
  const [alternatives, setAlternatives] = useState<Record<string, AlternativeNode[]>>({});
  const [altLoading, setAltLoading] = useState(false);
  const [prdLoading, setPrdLoading] = useState(false);
  const [prdStatus, setPrdStatus] = useState("");
  const [aiSetupRequired, setAiSetupRequired] = useState(false);
  const [pendingAiAction, setPendingAiAction] = useState<"prd" | "alternatives" | null>(null);
  const [rescanConfirmOpen, setRescanConfirmOpen] = useState(false);
  // React Flow fits on its first measured nodes. For a map that starts empty
  // that is the first added node, which would undo placement beside the
  // detail panel, so only maps that load with nodes are fitted.
  const [fitViewOnLoad, setFitViewOnLoad] = useState(true);
  const [editorDisplaySettings, setEditorDisplaySettings] = useState<EditorDisplaySettings>(() => {
    if (typeof window === "undefined") return DEFAULT_EDITOR_DISPLAY_SETTINGS;
    try {
      const stored = window.localStorage.getItem(EDITOR_DISPLAY_SETTINGS_STORAGE_KEY);
      if (!stored) return DEFAULT_EDITOR_DISPLAY_SETTINGS;
      return normalizeEditorDisplaySettings(JSON.parse(stored));
    } catch {
      return DEFAULT_EDITOR_DISPLAY_SETTINGS;
    }
  });
  const [rfNodes, setRfNodes] = useNodesState<StackNodeData>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<StackEdgeData>([]);
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);
  const persistenceRef = useRef<CanvasPersistenceCoordinator<StoredCanvasState> | null>(null);
  const rescanInvokerRef = useRef<HTMLButtonElement | null>(null);
  const rescanKeepRef = useRef<HTMLButtonElement | null>(null);
  const canvasFocusTargetRef = useRef<HTMLDivElement | null>(null);
  const connectionInvokerRef = useRef<HTMLElement | null>(null);
  const connectionDropRef = useRef<{ x: number; y: number } | null>(null);
  const connectStartRef = useRef<CanvasAddMenu["from"] | null>(null);
  const connectionMadeRef = useRef(false);
  const providerKeyInputRef = useRef<HTMLInputElement>(null);
  const nodePanelCloseTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const projectRef = useRef<Project | null>(null);
  const acknowledgedProjectRef = useRef<Project | null>(null);
  const initializedRef = useRef(false);
  const skipNextPersistencePublishRef = useRef(false);
  const alternativesRef = useRef<Record<string, AlternativeNode[]>>({});
  const architectureStreamActiveRef = useRef(false);
  const saveBlockedRef = useRef(false);
  const authoritativeUpdatedAtRef = useRef<number | null>(null);
  const firstMapTrackedRef = useRef(false);
  const canUseConnectionTypes = true;
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

  // Auto-layout settle: nodes move on a presentation overlay while rfNodes
  // already holds the destination, so persistence, exports and AI merges only
  // ever see final geometry. Anything that ends the settle just drops the overlay.
  const [layoutMotion, setLayoutMotion] = useState<LayoutMotion | null>(null);
  const layoutMotionRef = useRef<LayoutMotion | null>(null);
  const layoutFrameRef = useRef(0);
  const layoutMotionCleanupRef = useRef<((cameraAlreadyInterrupted: boolean) => void) | null>(null);
  const finishLayoutMotion = useCallback((cameraAlreadyInterrupted = false) => {
    window.cancelAnimationFrame(layoutFrameRef.current);
    layoutMotionCleanupRef.current?.(cameraAlreadyInterrupted);
    layoutMotionCleanupRef.current = null;
    if (!layoutMotionRef.current) return;
    layoutMotionRef.current = null;
    setLayoutMotion(null);
  }, []);
  useEffect(() => finishLayoutMotion, [finishLayoutMotion]);
  const displayNodes = useMemo(
    () => (layoutMotion ? applyLayoutMotion(rfNodes, layoutMotion) : rfNodes),
    [rfNodes, layoutMotion]
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (isCanvasMutationBlocked()) return;
      // Grabbing a node ends the decorative settle at once; it never delays a drag.
      if (changes.some((change) => change.type === "position")) finishLayoutMotion();
      setRfNodes((nodes) => applyNonOverlappingNodeChanges(changes, nodes));
    },
    [isCanvasMutationBlocked, setRfNodes, finishLayoutMotion]
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

  const handleZoomIn = useCallback(() => {
    finishLayoutMotion();
    void rfInstanceRef.current?.zoomIn();
  }, [finishLayoutMotion]);

  const handleZoomOut = useCallback(() => {
    finishLayoutMotion();
    void rfInstanceRef.current?.zoomOut();
  }, [finishLayoutMotion]);

  const handleFitView = useCallback(() => {
    const wasSettling = layoutMotionRef.current !== null;
    finishLayoutMotion();
    if (wasSettling) {
      // Let React Flow receive the destination nodes before fitting their bounds.
      layoutFrameRef.current = window.requestAnimationFrame(
        () => void rfInstanceRef.current?.fitView({ padding: 0.16 })
      );
      return;
    }
    void rfInstanceRef.current?.fitView({ padding: 0.16 });
  }, [finishLayoutMotion]);

  // The docked chat pushes the canvas; once its 180 ms slide has finished the
  // map re-fits to the new bed, not during the slide. On phones the chat is a
  // sheet over the canvas, which keeps its size, so nothing re-fits. Under
  // reduced motion there is no slide, so the refit is immediate; it must still
  // run before the node pan-into-view below (same delay, earlier effect), or it
  // would re-hide the edited node.
  const chatDockSettledRef = useRef(false);
  useEffect(() => {
    if (!chatDockSettledRef.current) {
      chatDockSettledRef.current = true;
      return;
    }
    if (window.matchMedia?.("(max-width: 640px)").matches) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const timer = setTimeout(
      () => {
        if (rfInstanceRef.current?.getNodes().length) handleFitView();
      },
      reduced ? 0 : 200
    );
    return () => clearTimeout(timer);
  }, [chatOpen, handleFitView]);
  const handleAutoLayout = useCallback(() => {
    if (isCanvasMutationBlocked() || rfNodes.length === 0) return;
    const positions = applyDagreLayout(
      fromReactFlowNodes(rfNodes),
      fromReactFlowEdges(rfEdges),
      new Map(rfNodes.filter((node) => node.data.locked).map((node) => [node.id, node.position]))
    );
    const byId = new Map(positions.map(({ id, position }) => [id, position]));
    const laidOut = rfNodes.map((node) => ({
      ...node,
      position: byId.get(node.id) ?? node.position,
    }));
    // Locked nodes keep their place; unlocked nodes move around them.
    const resolved = new Map(
      resolveNodeOverlaps([
        ...laidOut.filter((node) => node.data.locked),
        ...laidOut.filter((node) => !node.data.locked),
      ]).map((node) => [node.id, node])
    );
    const finalNodes = laidOut.map((node) => resolved.get(node.id) ?? node);

    // Where each node is on screen right now, including a settle still in flight.
    const current = layoutMotionRef.current
      ? applyLayoutMotion(rfNodes, layoutMotionRef.current)
      : rfNodes;
    const from = new Map(current.map((node) => [node.id, node.position]));
    const to = new Map(finalNodes.map((node) => [node.id, node.position]));
    const moves = finalNodes.some((node) => {
      const start = from.get(node.id);
      return !start || start.x !== node.position.x || start.y !== node.position.y;
    });

    // The canonical graph takes its destination at once, so persistence sees
    // only the final geometry; the settle below is presentation only.
    finishLayoutMotion();
    setRfNodes(finalNodes);

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const pane = canvasFocusTargetRef.current?.parentElement?.querySelector(".react-flow");
    const instance = rfInstanceRef.current;
    if (reduced || !moves || !instance || !pane) {
      layoutFrameRef.current = window.requestAnimationFrame(
        () => void instance?.fitView({ padding: 0.16 })
      );
      return;
    }

    // Fit to the destination, not the nodes' current spot, so the camera and
    // the nodes settle together.
    const viewport = getViewportForBounds(
      getNodesBounds(finalNodes.map((node) => ({ ...node, positionAbsolute: node.position }))),
      pane.clientWidth,
      pane.clientHeight,
      0.5,
      2,
      0.16
    );
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / LAYOUT_SETTLE_MS;
      if (t >= 1) {
        finishLayoutMotion();
        // An initial fit can interrupt the camera tween while nodes are measuring.
        void instance.setViewport(viewport, { duration: 0 });
        return;
      }
      const motion: LayoutMotion = { from, to, progress: easeLayoutProgress(t) };
      layoutMotionRef.current = motion;
      setLayoutMotion(motion);
      layoutFrameRef.current = window.requestAnimationFrame(tick);
    };
    const motion: LayoutMotion = { from, to, progress: 0 };
    layoutMotionRef.current = motion;
    setLayoutMotion(motion);
    layoutFrameRef.current = window.requestAnimationFrame(tick);

    // Turning reduced motion on mid-settle lands everything immediately.
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const onPreferenceChange = (event: MediaQueryListEvent) => {
      if (!event.matches) return;
      finishLayoutMotion();
      void instance.setViewport(viewport, { duration: 0 });
    };
    query?.addEventListener?.("change", onPreferenceChange);
    layoutMotionCleanupRef.current = (cameraAlreadyInterrupted) => {
      query?.removeEventListener?.("change", onPreferenceChange);
      if (!cameraAlreadyInterrupted) {
        void instance.setViewport(instance.getViewport(), { duration: 0 });
      }
    };
    void instance.setViewport(viewport, { duration: LAYOUT_SETTLE_MS });
  }, [isCanvasMutationBlocked, rfNodes, rfEdges, setRfNodes, finishLayoutMotion]);

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

  // Success notices leave after 4 s unless the dismiss control has focus;
  // errors stay until dismissed.
  useEffect(() => {
    if (toast?.tone !== "success") return;
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (document.activeElement?.closest(".toast")) schedule();
        else setToast(null);
      }, 4000);
    };
    schedule();
    return () => window.clearTimeout(timer);
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
      setAlternatives((prev) => {
        if (!(id in prev)) return prev;
        const { [id]: _removed, ...rest } = prev;
        alternativesRef.current = rest;
        return rest;
      });
      setProject((prev) => {
        if (!prev?.canvasState) return prev;
        return {
          ...prev,
          canvasState: {
            ...prev.canvasState,
            nodes: prev.canvasState.nodes.filter((n) => n.id !== id),
            edges: prev.canvasState.edges.filter((e) => e.source !== id && e.target !== id),
            positions: Object.fromEntries(
              Object.entries((prev.canvasState as StoredCanvasState).positions ?? {}).filter(
                ([nodeId]) => nodeId !== id
              )
            ),
            alternatives: Object.fromEntries(
              Object.entries((prev.canvasState as StoredCanvasState).alternatives ?? {}).filter(
                ([nodeId]) => nodeId !== id
              )
            ),
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
      acknowledgedProjectRef.current = {
        ...saved,
        name: projectRef.current?.id === saved.id ? projectRef.current.name : saved.name,
      };
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
    const snapshot = buildStoredCanvasState(rfNodes, rfEdges, alternatives);
    if (JSON.stringify(snapshot) === JSON.stringify(persistenceRef.current.getLatestSnapshot())) {
      return;
    }
    persistenceRef.current.publish(snapshot);
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

  // --- Build React Flow nodes with injected callbacks ---

  const buildRfNodes = useCallback(
    (
      nodes: StackNode[],
      positions: Map<string, { x: number; y: number }>
    ): Node<StackNodeData>[] => {
      return resolveNodeOverlaps(
        toReactFlowNodes(nodes, positions).map((n) => ({
          ...n,
          data: {
            ...n.data,
            customSubtypes,
            onLockToggle: handleLockToggle,
            showDescription: true,
            canUseNodeLocking: true,
            onDelete: handleNodeDelete,
          },
        }))
      );
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

  // Docking the detail or chat panel narrows the canvas and can hide the node
  // being edited. After the slide, pan just far enough to bring it back into
  // view; zoom is left alone. Phones sheet their panels over the whole canvas.
  const selectedNodeId = selectedNode?.id;
  useEffect(() => {
    if (!nodePanelOpen || !selectedNodeId || window.innerWidth <= 640) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const timer = setTimeout(
      () => {
        const instance = rfInstanceRef.current;
        const canvas = document.querySelector<HTMLElement>(".project-editor__canvas");
        const nodeEl = canvas?.querySelector<HTMLElement>(
          `.react-flow__node[data-id="${CSS.escape(selectedNodeId)}"]`
        );
        if (!instance || !canvas || !nodeEl) return;
        const margin = 24;
        const area = canvas.getBoundingClientRect();
        let right = area.right;
        // Between 641 and 1099 px the detail sheets over the canvas when chat
        // is also open; the visible area then ends at the sheet.
        const detail = document.querySelector<HTMLElement>('[data-testid="node-detail-panel"]');
        const detailRect = detail?.getBoundingClientRect();
        if (detailRect && detailRect.width > 0 && detailRect.left < right) {
          right = Math.max(area.left, detailRect.left);
        }
        const node = nodeEl.getBoundingClientRect();
        const overflow = (start: number, end: number, min: number, max: number) => {
          if (end - start > max - min - 2 * margin || start < min + margin) {
            return start - (min + margin);
          }
          return end > max - margin ? end - (max - margin) : 0;
        };
        const dx = overflow(node.left, node.right, area.left, right);
        const dy = overflow(node.top, node.bottom, area.top, area.bottom);
        if (dx === 0 && dy === 0) return;
        const viewport = instance.getViewport();
        instance.setViewport(
          { ...viewport, x: viewport.x - dx, y: viewport.y - dy },
          { duration: reduced ? 0 : 180 }
        );
      },
      reduced ? 0 : 200
    );
    return () => clearTimeout(timer);
  }, [nodePanelOpen, selectedNodeId, chatOpen]);

  const handleRename = useCallback((name: string) => {
    const current = projectRef.current;
    if (!current || name === current.name) return;
    const renamed = { ...current, name };
    // The acknowledgement reconciles metadata edited while an earlier write
    // was in flight; the next revision then persists this name.
    projectRef.current = renamed;
    if (acknowledgedProjectRef.current) {
      acknowledgedProjectRef.current = { ...acknowledgedProjectRef.current, name };
    }
    setProject(renamed);
    // Re-publish the current canvas so the debounced writer carries the new
    // name through the existing revision preconditions.
    const coordinator = persistenceRef.current;
    const snapshot = coordinator?.getLatestSnapshot();
    if (coordinator && snapshot) coordinator.publish(snapshot);
  }, []);

  const handleEdgeDelete = useCallback(
    (edgeId: string) => {
      if (isCanvasMutationBlocked()) return;
      setRfEdges((edges) => edges.filter((edge) => edge.id !== edgeId));
      setProject((prev) => {
        if (!prev?.canvasState) return prev;
        return {
          ...prev,
          canvasState: {
            ...prev.canvasState,
            edges: prev.canvasState.edges.filter((edge) => edge.id !== edgeId),
          },
        };
      });
      setConnectionTypePopover(null);
    },
    [isCanvasMutationBlocked, setRfEdges]
  );

  const handlePaneClick = useCallback(() => {
    if (nodePanelOpen) closeNodePanel();
  }, [closeNodePanel, nodePanelOpen]);

  const addConnectionEdge = useCallback(
    (sourceId: string, targetId: string, type: ConnectionType, sides?: ConnectionSides) => {
      if (isCanvasMutationBlocked()) return;
      const id = crypto.randomUUID();
      const label = getDefaultConnectionLabel(type);
      const edge: StackEdge = {
        id,
        source: sourceId,
        target: targetId,
        connectionType: type,
        label,
        ...(sides ? { sides } : {}),
      };
      const rfEdge = toReactFlowEdges([edge])[0];
      setRfEdges((eds) => [...eds, rfEdge]);
      setProject((prev) => {
        if (!prev?.canvasState) return prev;
        return {
          ...prev,
          canvasState: {
            ...prev.canvasState,
            edges: [...prev.canvasState.edges, edge],
          },
        };
      });
    },
    [isCanvasMutationBlocked, setRfEdges]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      connectionMadeRef.current = true;
      if (isCanvasMutationBlocked() || !connection.source || !connection.target) return;
      const sides: ConnectionSides = {
        source: connection.sourceHandle === "right" ? "right" : "bottom",
        target: connection.targetHandle === "left" ? "left" : "top",
      };
      if (!canUseConnectionTypes) {
        addConnectionEdge(connection.source, connection.target, "http", sides);
        return;
      }
      connectionInvokerRef.current = document.activeElement as HTMLElement | null;
      const rect = document
        .querySelector<HTMLElement>(".react-flow__pane")
        ?.getBoundingClientRect();
      setConnectionTypePopover({
        mode: "create",
        sourceId: connection.source,
        targetId: connection.target,
        sides,
        position: connectionDropRef.current ?? {
          x: rect ? (rect.left + rect.right) / 2 : window.innerWidth / 2,
          y: rect ? (rect.top + rect.bottom) / 2 : window.innerHeight / 2,
        },
      });
      connectionDropRef.current = null;
    },
    [addConnectionEdge, canUseConnectionTypes, isCanvasMutationBlocked]
  );

  const handleConnectStart = useCallback(
    (_event: unknown, { nodeId, handleId, handleType }: OnConnectStartParams) => {
      connectionMadeRef.current = false;
      if (!nodeId || !handleType) {
        connectStartRef.current = null;
        return;
      }
      const side: ConnectionStartSide =
        handleType === "source"
          ? handleId === "right"
            ? "right"
            : "bottom"
          : handleId === "left"
            ? "left"
            : "top";
      connectStartRef.current = { nodeId, handleType, side };
    },
    []
  );

  const handleConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      const pointer = "changedTouches" in event ? event.changedTouches[0] : event;
      if (!pointer) return;
      const position = { x: pointer.clientX, y: pointer.clientY };
      connectionDropRef.current = position;
      setConnectionTypePopover((current) =>
        current?.mode === "create" ? { ...current, position } : current
      );

      const start = connectStartRef.current;
      connectStartRef.current = null;
      if (connectionMadeRef.current || !start || isCanvasMutationBlocked()) return;
      // A touch event's target is where the touch started, so look under the finger instead.
      const dropTarget =
        "changedTouches" in event
          ? document.elementFromPoint(position.x, position.y)
          : (event.target as Element | null);
      if (dropTarget instanceof Element && dropTarget.classList.contains("react-flow__pane")) {
        setCanvasAddMenu({ position, from: start });
      }
    },
    [isCanvasMutationBlocked]
  );

  const openConnectionTypePicker = useCallback(
    (edgeId: string, position?: { x: number; y: number }) => {
      if (!canUseConnectionTypes || isCanvasMutationBlocked()) return;
      const edge = rfEdges.find((item) => item.id === edgeId);
      if (!edge) return;
      const nodes = rfInstanceRef.current?.getNodes() ?? rfNodes;
      const source = nodes.find((node) => node.id === edge.source);
      const target = nodes.find((node) => node.id === edge.target);
      const rect = document
        .querySelector<HTMLElement>(".react-flow__pane")
        ?.getBoundingClientRect();
      const viewport = rfInstanceRef.current?.getViewport();
      const midpoint =
        source && target && rect && viewport
          ? {
              x:
                rect.left +
                viewport.x +
                ((source.position.x + target.position.x) / 2 + 110) * viewport.zoom,
              y:
                rect.top +
                viewport.y +
                ((source.position.y + target.position.y) / 2 + 55) * viewport.zoom,
            }
          : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      connectionInvokerRef.current = document.activeElement as HTMLElement | null;
      if (nodePanelOpen) closeNodePanel();
      setConnectionTypePopover({ mode: "edit", edgeId, position: position ?? midpoint });
    },
    [
      canUseConnectionTypes,
      closeNodePanel,
      isCanvasMutationBlocked,
      nodePanelOpen,
      rfEdges,
      rfNodes,
    ]
  );

  const handleEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge<StackEdgeData>) => {
      if (event.target instanceof Element && event.target.closest(".stack-edge-label")) return;
      event.stopPropagation();
      openConnectionTypePicker(edge.id, { x: event.clientX, y: event.clientY });
    },
    [openConnectionTypePicker]
  );

  // --- Connection type selected ---

  const restoreConnectionFocus = useCallback(() => {
    const invoker = connectionInvokerRef.current;
    connectionInvokerRef.current = null;
    window.requestAnimationFrame(() =>
      invoker?.isConnected ? invoker.focus() : canvasFocusTargetRef.current?.focus()
    );
  }, []);

  const updateConnectionType = useCallback(
    (edgeId: string, type: ConnectionType) => {
      if (isCanvasMutationBlocked()) return;
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
    },
    [isCanvasMutationBlocked, setRfEdges]
  );

  const handleConnectionTypeSelect = useCallback(
    (type: ConnectionType) => {
      if (isCanvasMutationBlocked()) return;
      if (!connectionTypePopover) return;
      if (connectionTypePopover.mode === "create") {
        addConnectionEdge(
          connectionTypePopover.sourceId,
          connectionTypePopover.targetId,
          type,
          connectionTypePopover.sides
        );
        setConnectionTypePopover(null);
        restoreConnectionFocus();
        return;
      }

      updateConnectionType(connectionTypePopover.edgeId, type);
      setConnectionTypePopover(null);
      restoreConnectionFocus();
    },
    [
      addConnectionEdge,
      connectionTypePopover,
      isCanvasMutationBlocked,
      restoreConnectionFocus,
      updateConnectionType,
    ]
  );

  const handleCancelConnection = useCallback(() => {
    setConnectionTypePopover(null);
    restoreConnectionFocus();
  }, [restoreConnectionFocus]);

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

  const canvasNodes = useMemo(() => fromReactFlowNodes(rfNodes), [rfNodes]);
  const canvasEdges = useMemo(() => fromReactFlowEdges(rfEdges), [rfEdges]);
  const nodeNames = useMemo(
    () => new Map(rfNodes.map((node) => [node.id, node.data.name])),
    [rfNodes]
  );
  const edgesWithCallbacks = useMemo(
    () =>
      rfEdges.map((e) => ({
        ...e,
        ariaLabel: `${nodeNames.get(e.source) ?? e.source} to ${nodeNames.get(e.target) ?? e.target}, ${canUseConnectionTypes ? edgeStyles[e.data?.connectionType ?? "http"].displayName : "Connection"}`,
        data: {
          ...e.data!,
          connectionTypesEnabled: canUseConnectionTypes,
          onLabelChange: canUseConnectionTypes ? handleEdgeLabelChange : undefined,
        },
      })),
    [rfEdges, nodeNames, handleEdgeLabelChange, canUseConnectionTypes]
  );

  const flushProviderCanvas = useCallback(async () => {
    const coordinator = persistenceRef.current;
    if (!coordinator || !projectRef.current) {
      throw new Error("Architecture update is unavailable");
    }
    setArchitectureStreamPhase("preparing");
    try {
      await coordinator.flushLatest();
    } finally {
      setArchitectureStreamPhase("idle");
    }
  }, []);

  const prepareProviderCommit = useCallback(async () => {
    const coordinator = persistenceRef.current;
    if (!coordinator || !projectRef.current || architectureStreamActiveRef.current) {
      throw new Error("The local provider result cannot be committed");
    }
    architectureStreamActiveRef.current = true;
    setArchitectureStreamPhase("reconciling");
    try {
      await coordinator.suspendAndFlush();
    } catch (error) {
      architectureStreamActiveRef.current = false;
      setArchitectureStreamPhase("idle");
      throw error;
    }
  }, []);

  const acknowledgeProviderCommit = useCallback(
    async (commit: CanvasPersistenceCommit, storedCanvas?: StoredCanvasState) => {
      const coordinator = persistenceRef.current;
      const currentProject = projectRef.current;
      if (!coordinator || !currentProject) {
        throw new Error("The local provider result cannot be acknowledged");
      }
      const snapshot = storedCanvas ?? coordinator.getLatestSnapshot();
      if (coordinator.getState().suspended) {
        coordinator.restoreAcknowledgedSnapshot(snapshot, commit);
        coordinator.resume();
      } else {
        coordinator.acknowledgeExternalCommit(snapshot, commit);
      }
      architectureStreamActiveRef.current = false;
      setArchitectureStreamPhase("idle");
      const nextProject = {
        ...currentProject,
        canvasState: snapshot,
        revision: commit.projectRevision,
        updatedAt: Date.now(),
      };
      acknowledgedProjectRef.current = nextProject;
      projectRef.current = nextProject;
      authoritativeUpdatedAtRef.current = nextProject.updatedAt;
      setProject(nextProject);
    },
    []
  );

  // --- Export PRD ---

  const runExportPrd = useCallback(async () => {
    const currentProject = projectRef.current;
    if (!currentProject) return;
    setPrdStatus("Generating PRD...");
    setPrdLoading(true);
    try {
      await flushProviderCanvas();
      const result = await providerCoordinator.run({
        projectId: currentProject.id,
        kind: "prd",
        beforeCommit: prepareProviderCommit,
      });
      await acknowledgeProviderCommit({
        projectRevision: result.project.revision,
        vaultGeneration: result.generation,
      });
      const prd = result.prd ?? "";
      const blob = new Blob([prd], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `${currentProject.name}-prd.md`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      setPrdStatus("PRD exported.");
    } catch (providerError) {
      const details = providerErrorDetails(providerError);
      if (details.code === "credentials_missing") {
        setPrdStatus("PRD export needs an AI provider key.");
        setAiSetupRequired(true);
        setPendingAiAction("prd");
        return;
      }
      setPrdStatus("PRD export failed.");
      setToast({ tone: "error", message: details.message });
    } finally {
      if (persistenceRef.current?.getState().suspended) {
        persistenceRef.current.resume();
      }
      architectureStreamActiveRef.current = false;
      setArchitectureStreamPhase("idle");
      setPrdLoading(false);
    }
  }, [acknowledgeProviderCommit, flushProviderCanvas, prepareProviderCommit, providerCoordinator]);

  const handleExportPrd = useCallback(() => {
    void runExportPrd();
  }, [runExportPrd]);

  // --- Add node ---

  const handleAddNode = useCallback(
    (
      category: NodeCategory,
      subtype: NodeSubtype,
      at?: { x: number; y: number; anchor: NodeAnchor } // client coordinates
    ): string | null => {
      if (isCanvasMutationBlocked()) return null;
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

      // Reserve the detail panel that opens immediately after adding this node.
      const rect = document
        .querySelector<HTMLElement>(".react-flow__pane")
        ?.getBoundingClientRect();
      const chatRect = chatOpen
        ? document.getElementById("editor-chat-sidebar")?.getBoundingClientRect()
        : null;
      const panel = document.querySelector<HTMLElement>('[data-testid="node-detail-panel"]');
      const desktop = window.innerWidth >= 768;
      const left = rect ? Math.max(rect.left, chatRect?.right ?? rect.left) : 0;
      const right = rect
        ? rect.right - (desktop ? (panel?.getBoundingClientRect().width ?? 400) : 0)
        : window.innerWidth;
      // On phones the details open as a bottom sheet; keep the node above it.
      const bottom = rect
        ? desktop
          ? rect.bottom
          : Math.min(
              rect.bottom,
              window.innerHeight -
                (panel?.getBoundingClientRect().height ?? window.innerHeight * 0.7)
            )
        : window.innerHeight;
      const center = {
        x: (left + Math.max(left, right)) / 2,
        y: rect ? (rect.top + Math.max(rect.top, bottom)) / 2 : window.innerHeight / 2,
      };
      const flowPoint = rfInstanceRef.current?.screenToFlowPosition(at ?? center) ?? {
        x: 200,
        y: 200,
      };
      const position = at
        ? positionForAnchor(flowPoint, at.anchor)
        : { x: flowPoint.x - 140, y: flowPoint.y - 50 };

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

      const placedPosition = findNearestOpenPosition(rfNode, rfNodes, position);
      setRfNodes((nds) => [
        ...nds,
        { ...rfNode, position: findNearestOpenPosition(rfNode, nds, position) },
      ]);
      const instance = rfInstanceRef.current;
      if (!at && rect && instance) {
        const { zoom, x, y } = instance.getViewport();
        const nodeLeft = rect.left + x + placedPosition.x * zoom;
        const nodeTop = rect.top + y + placedPosition.y * zoom;
        if (
          nodeLeft < left ||
          nodeLeft + 280 * zoom > right ||
          nodeTop < rect.top ||
          nodeTop + 100 * zoom > bottom
        ) {
          void instance.setViewport({
            x: center.x - rect.left - (placedPosition.x + 140) * zoom,
            y: center.y - rect.top - (placedPosition.y + 50) * zoom,
            zoom,
          });
        }
      }
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
      return id;
    },
    [
      chatOpen,
      customSubtypes,
      handleLockToggle,
      handleNodeDelete,
      isCanvasMutationBlocked,
      rfNodes,
      openNodePanel,
      setRfNodes,
    ]
  );

  const handlePaneContextMenu = useCallback(
    (event: ReactMouseEvent) => {
      if (isCanvasMutationBlocked()) return;
      event.preventDefault();
      setCanvasAddMenu({ position: { x: event.clientX, y: event.clientY } });
    },
    [isCanvasMutationBlocked]
  );

  const handleCanvasAddNode = useCallback(
    (category: NodeCategory, subtype: NodeSubtype) => {
      const menu = canvasAddMenu;
      setCanvasAddMenu(null);
      if (!menu) return;
      const from = menu.from;
      // The new node sits so that its matching handle is under the pointer.
      const anchor: NodeAnchor = !from
        ? "center"
        : from.handleType === "source"
          ? from.side === "right"
            ? "left"
            : "top"
          : from.side === "left"
            ? "right"
            : "bottom";
      const id = handleAddNode(category, subtype, { ...menu.position, anchor });
      if (!id || !from || category === "note") return;
      if (!projectRef.current?.canvasState?.nodes.some((node) => node.id === from.nodeId)) return;
      if (from.handleType === "source") {
        addConnectionEdge(from.nodeId, id, "http", {
          source: from.side as "bottom" | "right",
          target: from.side === "right" ? "left" : "top",
        });
      } else {
        addConnectionEdge(id, from.nodeId, "http", {
          source: from.side === "left" ? "right" : "bottom",
          target: from.side as "top" | "left",
        });
      }
    },
    [canvasAddMenu, handleAddNode, addConnectionEdge]
  );

  const handleCanvasAddCancel = useCallback((restoreFocus: boolean) => {
    setCanvasAddMenu(null);
    if (restoreFocus) canvasFocusTargetRef.current?.focus();
  }, []);

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

  const runSuggestAlternatives = useCallback(async () => {
    const node = selectedNode;
    if (!node || !projectId || isCanvasMutationBlocked()) return;
    setAltLoading(true);
    try {
      await flushProviderCanvas();
      const result = await providerCoordinator.run({
        projectId,
        kind: "alternatives",
        targetNode: node,
        beforeCommit: prepareProviderCommit,
      });
      const storedCanvas = result.project.canvasState as StoredCanvasState | null;
      if (!storedCanvas) throw new Error("The provider result did not include the local map");
      skipNextPersistencePublishRef.current = true;
      const storedAlternatives = storedCanvas.alternatives ?? {};
      alternativesRef.current = storedAlternatives;
      setAlternatives(storedAlternatives);
      await acknowledgeProviderCommit(
        {
          projectRevision: result.project.revision,
          vaultGeneration: result.generation,
        },
        storedCanvas
      );
    } catch (providerError) {
      const details = providerErrorDetails(providerError);
      if (details.code === "credentials_missing") {
        setAiSetupRequired(true);
        setPendingAiAction("alternatives");
      } else {
        setToast({ tone: "error", message: details.message });
      }
    } finally {
      if (persistenceRef.current?.getState().suspended) {
        persistenceRef.current.resume();
      }
      architectureStreamActiveRef.current = false;
      setArchitectureStreamPhase("idle");
      setAltLoading(false);
    }
  }, [
    acknowledgeProviderCommit,
    flushProviderCanvas,
    isCanvasMutationBlocked,
    projectId,
    prepareProviderCommit,
    providerCoordinator,
    selectedNode,
  ]);

  const handleSuggestAlternatives = useCallback(() => {
    if (!selectedNode || isCanvasMutationBlocked()) return;
    void runSuggestAlternatives();
  }, [isCanvasMutationBlocked, runSuggestAlternatives, selectedNode]);

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

  // --- AI architecture handler ---

  const adoptArchitecture = useCallback(
    async (
      incoming: StackArchitecture,
      meta?: ArchitectureUpdateMeta,
      forceReplacement = false
    ) => {
      try {
        const coordinator = persistenceRef.current;
        if (!coordinator) {
          throw new Error("Canvas persistence is unavailable");
        }
        if (!meta?.persisted && !coordinator.getState().suspended) {
          throw new Error("Architecture replacement started without a persistence barrier");
        }
        if (!incoming?.nodes || !Array.isArray(incoming.nodes)) {
          setToast({
            tone: "error",
            message: "Failed to update canvas: invalid architecture data",
          });
          throw new Error("Invalid architecture data");
        }

        const currentCanvas = projectRef.current?.canvasState;
        const isFirst = !currentCanvas || currentCanvas.nodes.length === 0;
        const isReplacement = forceReplacement || meta?.source === "scan" || meta?.persisted;

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

        const persistedAlternatives =
          meta?.persisted && "alternatives" in incoming
            ? ((incoming as StoredCanvasState).alternatives ?? {})
            : null;
        const replacementAlternatives =
          persistedAlternatives ?? (isReplacement ? {} : alternativesRef.current);
        if (isReplacement) {
          alternativesRef.current = replacementAlternatives;
          setAlternatives(replacementAlternatives);
          setSelectedNode(null);
          setNodePanelOpen(false);
          setConnectionTypePopover(null);
          setCanvasAddMenu(null);
        }
        if (meta?.persisted) skipNextPersistencePublishRef.current = true;
        finishLayoutMotion();
        setRfNodes(newRfNodes);
        setRfEdges(newRfEdges);
        const storedCanvas = buildStoredCanvasState(
          newRfNodes,
          newRfEdges,
          replacementAlternatives
        );
        if (meta?.persisted) {
          const currentProject = projectRef.current;
          if (!currentProject) throw new Error("The local project is unavailable");
          const persistedCanvas = incoming as StoredCanvasState;
          const committedCanvas: StoredCanvasState = {
            nodes: persistedCanvas.nodes,
            edges: persistedCanvas.edges,
            positions: persistedCanvas.positions ?? {},
            alternatives: persistedCanvas.alternatives ?? replacementAlternatives,
          };
          const nextProject = {
            ...currentProject,
            canvasState: storedCanvas,
            revision: meta.commit.projectRevision,
            updatedAt: Date.now(),
            ...(meta.provenance
              ? {
                  repoUrl: meta.provenance.repoUrl,
                  repoCommitSha: meta.provenance.commitSha,
                  repoScannedAt: meta.provenance.scannedAt,
                  repoAnalysisStatus: meta.provenance.analysisStatus,
                  repoAnalysisWarning: meta.provenance.analysisWarning,
                }
              : {}),
          };
          projectRef.current = nextProject;
          acknowledgedProjectRef.current = {
            ...nextProject,
            canvasState: committedCanvas,
          };
          authoritativeUpdatedAtRef.current = nextProject.updatedAt;
          setProject(nextProject);
          if (coordinator.getState().suspended) {
            coordinator.restoreAcknowledgedSnapshot(committedCanvas, meta.commit);
            coordinator.resume();
          } else {
            coordinator.acknowledgeExternalCommit(committedCanvas, meta.commit);
          }
          if (JSON.stringify(committedCanvas) !== JSON.stringify(storedCanvas)) {
            coordinator.publish(storedCanvas);
          }
          architectureStreamActiveRef.current = false;
          setArchitectureStreamPhase("idle");
        } else {
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
          await coordinator.persistReplacement(storedCanvas);
        }

        if (isFirst && !firstMapTrackedRef.current) {
          firstMapTrackedRef.current = true;
          consumePendingProjectStart();
        }

        setTimeout(() => rfInstanceRef.current?.fitView({ padding: 0.2, duration: 300 }), 100);
      } catch (error) {
        setToast({ tone: "error", message: "Failed to update canvas" });
        throw error;
      }
    },
    [rfNodes, buildRfNodes, setRfNodes, setRfEdges, finishLayoutMotion]
  );

  const handleArchitecture = useCallback(
    (incoming: StackArchitecture, meta?: ArchitectureUpdateMeta) =>
      adoptArchitecture(incoming, meta),
    [adoptArchitecture]
  );

  const handleArchitectureStreamStart = flushProviderCanvas;

  const handleArchitectureStreamEnd = useCallback(async (_outcome: ArchitectureStreamOutcome) => {
    if (persistenceRef.current?.getState().suspended) {
      persistenceRef.current.resume();
    }
    architectureStreamActiveRef.current = false;
    setArchitectureStreamPhase("idle");
  }, []);

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
        const [loadedCustomSubtypes, projectSnapshot, provenance] = await Promise.all([
          workspaceVault.getCustomSubtypes(),
          workspaceVault.getProjectSnapshot(requestedProjectId),
          workspaceVault.getRepositoryProvenance(requestedProjectId),
        ]);
        if (cancelled) return;
        setCustomSubtypes(loadedCustomSubtypes);
        if (!projectSnapshot) {
          setProject(null);
          setError("Map not found on this device. It may have been cleared in another tab.");
          return;
        }
        const { project: data, generation } = projectSnapshot;
        const loadedProject: Project = {
          ...data,
          ...(provenance
            ? {
                repoUrl: provenance.repositoryUrl,
                repoCommitSha: provenance.commitSha,
                repoScannedAt: provenance.scannedAt,
                repoAnalysisStatus: provenance.analysisStatus,
                repoAnalysisWarning: provenance.warning,
              }
            : {}),
        };
        setProject(loadedProject);
        projectRef.current = loadedProject;
        acknowledgedProjectRef.current = loadedProject;
        authoritativeUpdatedAtRef.current = data.updatedAt;
        const hasLoadedCanvas = (data.canvasState?.nodes?.length ?? 0) > 0;
        // Open the assistant only when it has something to act on. A blank
        // map keeps the canvas call to action, which offers manual editing too.
        const assistantOwnsNextStep = !hasLoadedCanvas && Boolean(data.repoUrl || data.description);
        setChatOpen(assistantOwnsNextStep);

        const pendingStartMethod = getPendingProjectStart();
        const tracksOnLoad = pendingStartMethod === "blank" && !hasLoadedCanvas;
        if (tracksOnLoad && !firstMapTrackedRef.current) {
          firstMapTrackedRef.current = true;
          consumePendingProjectStart();
        }

        let persistenceBaseline: StoredCanvasState;
        let normalizedCanvas: StoredCanvasState | null = null;

        // Initialize React Flow state from loaded canvas
        setFitViewOnLoad(Boolean(data.canvasState?.nodes?.length));
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

          const positionedNodes = toReactFlowNodes(stored.nodes, posMap).map((n) => ({
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
          const nodes = resolveNodeOverlaps(positionedNodes);
          const edges = toReactFlowEdges(stored.edges);

          finishLayoutMotion();
          setRfNodes(nodes);
          setRfEdges(edges);
          persistenceBaseline = buildStoredCanvasState(
            positionedNodes,
            edges,
            stored.alternatives ?? {}
          );
          if (
            nodes.some(
              (node, index) =>
                node.position.x !== positionedNodes[index].position.x ||
                node.position.y !== positionedNodes[index].position.y
            )
          ) {
            normalizedCanvas = buildStoredCanvasState(nodes, edges, stored.alternatives ?? {});
          }
        } else {
          finishLayoutMotion();
          setRfNodes([]);
          setRfEdges([]);
          setAlternatives({});
          persistenceBaseline = { nodes: [], edges: [], positions: {}, alternatives: {} };
        }

        const persistenceCoordinator = createCanvasPersistenceCoordinator({
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
              "Auto-save is paused because this map changed somewhere else. Your edits are still here in this tab."
            ),
        });
        persistenceRef.current = persistenceCoordinator;
        if (normalizedCanvas) persistenceCoordinator.publish(normalizedCanvas);
        skipNextPersistencePublishRef.current = true;
        initializedRef.current = true;
        void workspaceVault.recordProjectOpen(requestedProjectId).catch(() => {
          if (!cancelled) {
            setToast({
              tone: "error",
              message: "The map opened, but browser storage could not update your recent map.",
            });
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
  // A blocked canvas can be replaced or reloaded underneath the menu, leaving its source node stale.
  useEffect(() => {
    if (canvasMutationBlocked) setCanvasAddMenu(null);
  }, [canvasMutationBlocked]);
  const toolSurfaceDialogOpen = rescanConfirmOpen || aiSetupRequired;
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
      <EditorStateShell title="Loading map">
        <p role="status" aria-live="polite">
          Loading...
        </p>
      </EditorStateShell>
    );
  }

  if (error || !project || !projectId) {
    return (
      <EditorStateShell title="Map unavailable">
        <p className="text-danger">{error || "Map not found on this device."}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/project/new" className="btn btn--primary">
            Create a new map
          </Link>
          <Link href="/app/maps" className="btn">
            View maps on this device
          </Link>
          {projectId ? (
            <button
              type="button"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              className="btn btn--quiet"
            >
              Retry browser storage
            </button>
          ) : null}
        </div>
      </EditorStateShell>
    );
  }

  const autoStartKind: "repository" | "brief" | null =
    nodeCount > 0
      ? null
      : project.repoUrl && !project.repoCommitSha
        ? "repository"
        : !project.repoUrl && project.description
          ? "brief"
          : null;

  const flushBeforeBackup = async () => {
    const coordinator = persistenceRef.current;
    if (!coordinator || isCanvasMutationBlocked() || coordinator.getState().suspended) {
      throw new Error(
        "This map has unsaved changes. Resolve the save conflict before backing it up."
      );
    }
    await coordinator.flushLatest();
    if (isCanvasMutationBlocked() || coordinator.getState().suspended) {
      throw new Error(
        "This map has unsaved changes. Resolve the save conflict before backing it up."
      );
    }
  };

  const projectIdentity = getProjectIdentity(project);

  const rescanVerb = project.repoCommitSha ? "Re-scan" : "Scan";
  const requestRescan = (invoker: HTMLButtonElement) => {
    rescanInvokerRef.current = invoker;
    if (nodeCount > 0) setRescanConfirmOpen(true);
    else startRepositoryRescan();
  };

  return (
    <main
      id="main"
      tabIndex={-1}
      className="project-editor-shell"
      data-testid="project-editor-shell"
      data-height-contract="viewport"
      data-ai-writer-phase={architectureStreamPhase}
      data-mutation-blocked={String(canvasMutationBlocked)}
    >
      <header className="app-bar ink-frame project-editor__bar" data-testid="editor-project-bar">
        <IconControl href="/app/maps" label="All maps" surface="frame" tooltipPlacement="bottom">
          <ArrowLeft />
        </IconControl>
        <span className="ink-frame__divider project-editor__wide-only" aria-hidden="true" />
        <div className="project-editor__identity" data-testid="project-identity">
          {/* The name and hidden context below carry this information; a
              plain div cannot take aria-label, having no role to accept it. */}
          <span className="sr-only">{projectIdentity.accessibleLabel}</span>
          <h1 className="min-w-0">
            <ProjectNameField
              name={project.name}
              onRename={handleRename}
              disabled={canvasMutationBlocked}
            />
          </h1>
          {projectIdentity.visibleText ? (
            <p
              className="project-editor__provenance"
              data-testid="project-provenance"
              title={projectIdentity.detailTitle}
            >
              {projectIdentity.qualifier && (
                <span className="sr-only">{projectIdentity.qualifier}</span>
              )}
              {projectIdentity.visibleText}
            </p>
          ) : null}
        </div>
        <span className="app-bar__spacer" />
        {project.repoUrl ? (
          <IconControl
            label={`${rescanVerb} repository: ${project.repoUrl}`}
            tooltip={`${rescanVerb} repository`}
            surface="frame"
            tooltipPlacement="bottom"
            disabled={canvasMutationBlocked}
            data-testid="rescan-button"
            onClick={(event) => requestRescan(event.currentTarget)}
          >
            <RefreshCw />
          </IconControl>
        ) : null}
        <span className="project-editor__wide-only">
          <NewMapLink href={editorNewMapHref} primary={false} />
        </span>
        {/* An export reads the live canvas, so it first lets any layout settle finish. */}
        <span
          className="contents"
          onPointerDownCapture={() => finishLayoutMotion()}
          onKeyDownCapture={() => finishLayoutMotion()}
        >
          <ExportDropdown
            rfInstanceRef={rfInstanceRef}
            projectId={project.id}
            projectName={project.name}
            beforeProjectBackup={flushBeforeBackup}
            alternatives={alternatives}
            diagramAvailable={nodeCount > 0}
            onGeneratePrd={() => void handleExportPrd()}
            prdPending={prdLoading}
            onError={(message) => setToast({ tone: "error", message })}
          />
        </span>
        <span className="ink-frame__divider project-editor__wide-only" aria-hidden="true" />
        <span className="project-editor__wide-only">
          <DeviceControls />
        </span>
        <span className="project-editor__phone-only">
          <EditorOverflowMenu newMapHref={editorNewMapHref} />
        </span>
      </header>

      <p className="sr-only" role="status" aria-live="polite">
        {prdStatus}
      </p>

      <div className="project-editor__body">
        <EditorToolSurface
          chatOpen={chatOpen}
          onChatOpenChange={handleChatOpenChange}
          onAddNode={handleAddNode}
          customSubtypes={customSubtypes}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFitView={handleFitView}
          onAutoLayout={handleAutoLayout}
          displaySettings={editorDisplaySettings}
          onDisplaySettingsChange={setEditorDisplaySettings}
          dialogOpen={toolSurfaceDialogOpen}
          mutationBlocked={canvasMutationBlocked}
        />

        <ResizableChatSidebar open={chatOpen}>
          <ChatSidebar
            projectId={projectId}
            hasRequirementsBrief={Boolean(project.description) && !project.repoUrl}
            autoStart={autoStartKind}
            repoUrl={project.repoUrl}
            open={chatOpen}
            onOpenChange={handleChatOpenChange}
            scanTrigger={scanTrigger}
            coordinator={providerCoordinator}
            onArchitecture={handleArchitecture}
            onProviderCommit={acknowledgeProviderCommit}
            onArchitectureStreamStart={handleArchitectureStreamStart}
            onProviderCommitStart={prepareProviderCommit}
            onArchitectureStreamEnd={handleArchitectureStreamEnd}
            onStreaming={setChatStreaming}
            onMapping={setChatMapping}
            nodeNames={canvasNodes
              .filter((node) => node.category !== "note")
              .map((node) => node.name)}
          />
        </ResizableChatSidebar>

        <div className="project-editor__canvas-column">
          {saveError && (
            <div role="alert" className="project-editor__alert">
              <p className="type-label text-ink">Local auto-save paused</p>
              <p className="type-small mt-1 text-ink2">{saveError}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void retryLocalSave()}
                  disabled={saveRecoveryPending}
                  className="btn btn--sm"
                >
                  Retry save
                </button>
                <button
                  type="button"
                  onClick={reloadStoredMap}
                  disabled={saveRecoveryPending}
                  className="btn btn--sm"
                >
                  Reload stored map
                </button>
                <button
                  type="button"
                  onClick={() => void duplicateLocalSnapshot()}
                  disabled={saveRecoveryPending}
                  className="btn btn--sm"
                >
                  Save snapshot as a copy
                </button>
                <button
                  type="button"
                  onClick={() => void overwriteStoredMap()}
                  disabled={saveRecoveryPending}
                  className="btn btn--sm btn--danger"
                >
                  Overwrite stored map
                </button>
              </div>
            </div>
          )}

          <div className="project-editor__canvas">
            <EditorDisplaySettingsProvider value={editorDisplaySettings}>
              <ReactFlow
                nodes={displayNodes}
                edges={edgesWithCallbacks}
                onNodesChange={handleNodesChange}
                onEdgesChange={handleEdgesChange}
                onMoveStart={(event) => {
                  // D3 already interrupted its tween. A zero-duration viewport
                  // restore here would overwrite the gesture on the next frame.
                  if (event) finishLayoutMotion(true);
                }}
                onConnect={handleConnect}
                onConnectStart={handleConnectStart}
                onConnectEnd={handleConnectEnd}
                onPaneContextMenu={handlePaneContextMenu}
                onNodeClick={handleNodeClick}
                onEdgeClick={handleEdgeClick}
                onKeyDownCapture={(event) => {
                  if (
                    event.target instanceof Element &&
                    event.target.matches(".react-flow__edge") &&
                    (event.key === "Enter" || event.key === " ")
                  ) {
                    const edgeId = event.target
                      .getAttribute("data-testid")
                      ?.replace(/^rf__edge-/, "");
                    if (edgeId) {
                      event.preventDefault();
                      event.stopPropagation();
                      openConnectionTypePicker(edgeId);
                    }
                  }
                }}
                onPaneClick={handlePaneClick}
                nodesDraggable={!canvasMutationBlocked}
                nodesConnectable={!canvasMutationBlocked}
                // React Flow's wrapper would be a second tab stop that swallows
                // the key events before they reach the node's own handler, so the
                // node element itself owns focus and activation.
                nodesFocusable={false}
                onInit={(instance) => {
                  rfInstanceRef.current = instance;
                }}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                fitView={fitViewOnLoad}
                // Without explicit padding the initial fit clips wide maps at
                // narrow widths; minZoom keeps a dense map from fitting to
                // illegibility on a phone.
                fitViewOptions={{ padding: 0.2, minZoom: 0.35, maxZoom: 1 }}
                snapToGrid
                snapGrid={[20, 20]}
                deleteKeyCode={null}
                // The credit moves into the docked legend strip, which links it.
                proOptions={{ hideAttribution: true }}
                onError={handleReactFlowError}
                data-testid="react-flow-canvas"
              >
                <Background
                  variant={BackgroundVariant.Dots}
                  gap={20}
                  size={1.25}
                  color="var(--dot)"
                />
              </ReactFlow>
            </EditorDisplaySettingsProvider>

            {/* Where focus lands after a panel closes. Needs a role that can
                carry the label; a plain div cannot. */}
            <div
              ref={canvasFocusTargetRef}
              tabIndex={-1}
              role="group"
              aria-label="Map canvas"
              className="pointer-events-none absolute left-0 top-0 h-px w-px outline-none"
              data-testid="editor-canvas-focus-target"
            />

            {/* The reply replaces the map, so the canvas stays untouchable until it lands. The
                assistant panel sits outside this layer and keeps Stop reachable. */}
            {chatMapping && (
              <div
                className="absolute inset-0 z-10 flex items-center justify-center bg-ink/20 p-4"
                data-testid="mapping-overlay"
              >
                <div
                  className="flex items-center gap-3 border-[1.5px] border-ink bg-paper px-6 py-4 text-ink shadow-[var(--elevation-menu)]"
                  role="status"
                  aria-live="polite"
                >
                  <svg
                    className="h-6 w-6 flex-none animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    aria-hidden="true"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  <p className="type-section">Mapping the architecture…</p>
                </div>
              </div>
            )}

            {/* Empty state. Suppressed while the assistant panel is open,
                because that panel already owns the next step — showing both put
                four competing primary actions on one screen. */}
            {!chatStreaming && !hasCanvas && !chatOpen && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
                <div className="project-editor__empty pointer-events-auto">
                  <h2 className="type-section">Nothing on the canvas yet</h2>
                  {project.repoUrl ? (
                    <>
                      <p className="type-ui mt-2 text-ink2">
                        This map is staged from {project.repoUrl}. Review what the scan found, then
                        generate the map.
                      </p>
                      <div className="mt-5 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleChatOpenChange(true)}
                          className="btn btn--primary"
                        >
                          Review the repository evidence
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="type-ui mt-2 text-ink2">
                        Add components yourself, or let the assistant draft a map you can edit.
                      </p>
                      <div className="mt-5 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleAddNode("client", "web-app")}
                          disabled={canvasMutationBlocked}
                          className="btn btn--primary"
                        >
                          Add first component
                        </button>
                        <button
                          type="button"
                          onClick={() => handleChatOpenChange(true)}
                          className="btn"
                        >
                          Ask the assistant
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <EdgeLegend />
        </div>

        <NodeDetailPanel
          node={selectedNode}
          open={nodePanelOpen}
          nodes={canvasNodes}
          edges={canvasEdges}
          onConnectNode={(sourceId, targetId) => addConnectionEdge(sourceId, targetId, "http")}
          onEdgeTypeChange={updateConnectionType}
          onEdgeLabelChange={handleEdgeLabelChange}
          onRemoveEdge={handleEdgeDelete}
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
      </div>

      {canvasAddMenu && !canvasMutationBlocked && (
        <CanvasAddNodeMenu
          position={canvasAddMenu.position}
          customSubtypes={customSubtypes}
          onAddNode={handleCanvasAddNode}
          onCancel={handleCanvasAddCancel}
        />
      )}

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
          onDelete={
            connectionTypePopover.mode === "edit"
              ? () => handleEdgeDelete(connectionTypePopover.edgeId)
              : undefined
          }
        />
      )}

      {typeof document !== "undefined" &&
        createPortal(
          // Portalled out of the shell, which the dialog marks inert while open.
          <Modal
            open={rescanConfirmOpen}
            onClose={() => setRescanConfirmOpen(false)}
            title="Replace this architecture map?"
            invokerRef={rescanInvokerRef}
            initialFocusRef={rescanKeepRef}
            inertSelector="[data-testid='project-editor-shell']"
            footer={
              <>
                <button
                  ref={rescanKeepRef}
                  type="button"
                  onClick={() => setRescanConfirmOpen(false)}
                  className="btn btn--quiet"
                >
                  Keep current map
                </button>
                <button
                  type="button"
                  onClick={startRepositoryRescan}
                  className="btn btn--danger-solid"
                >
                  Re-scan repository
                </button>
              </>
            }
          >
            <p>
              Re-scanning reads the latest repository state and replaces the generated map and
              architecture chat. Manual canvas changes are not merged into the new map.
            </p>
            {project.repoAnalysisWarning && (
              <p className="type-small mt-3 text-ink2">
                Current scan note: {project.repoAnalysisWarning}
              </p>
            )}
            <p className="type-small mt-4">
              <a
                href="https://github.com/mwmdev/stackhatch/issues/new?labels=feedback&title=Incorrect%20architecture%20map"
                target="_blank"
                rel="noreferrer"
                className="link"
              >
                Report an incorrect map
              </a>
            </p>
          </Modal>,
          document.body
        )}

      <Modal
        open={aiSetupRequired}
        onClose={() => {
          setAiSetupRequired(false);
          setPendingAiAction(null);
        }}
        title="Connect an AI provider to continue"
        titleId="ai-setup-title"
        initialFocusRef={providerKeyInputRef}
        footer={
          <button
            type="button"
            onClick={() => {
              setAiSetupRequired(false);
              setPendingAiAction(null);
            }}
            className="btn btn--quiet"
          >
            Cancel
          </button>
        }
      >
        <ProviderKeyField
          inputRef={providerKeyInputRef}
          heading={false}
          labelledBy="ai-setup-title"
          onReady={(status) => {
            if (status.state === "absent" || !pendingAiAction) return;
            const action = pendingAiAction;
            setPendingAiAction(null);
            setAiSetupRequired(false);
            if (action === "prd") void runExportPrd();
            else void runSuggestAlternatives();
          }}
        />
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} data-testid="canvas-toast" />
    </main>
  );
}
