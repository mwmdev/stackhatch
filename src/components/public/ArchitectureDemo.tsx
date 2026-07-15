"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import { ArrowRight, GitBranch, Route } from "lucide-react";
import { STACKHATCH_DEMO } from "@/content/stackhatch-demo";
import { trackEvent } from "@/lib/analytics";
import { PublicMapNode, type PublicMapNodeData } from "./PublicMapNode";
import RepositoryIntentForm from "./RepositoryIntentForm";
import TrackedSourceLink from "./TrackedSourceLink";

const nodeTypes = { publicMapNode: PublicMapNode };
const edgeTypes = {};

function handleReactFlowError(id: string, message: string) {
  // React Flow 11 can emit 002 under React 19 strict-mode remounts even when
  // these objects are module constants. Keep every other diagnostic visible.
  if (id !== "002") console.warn(`[React Flow ${id}] ${message}`);
}

interface ArchitectureDemoProps {
  mode?: "embedded" | "full";
}

export default function ArchitectureDemo({ mode = "full" }: ArchitectureDemoProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string>("repo-analyzer");
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>("repo-to-map");
  const [showAlternatives, setShowAlternatives] = useState(false);
  const trackedOpen = useRef(false);

  useEffect(() => {
    if (trackedOpen.current) return;
    trackedOpen.current = true;
    trackEvent("demo_opened", { location: "demo" });
  }, []);

  const selectedQuestion = STACKHATCH_DEMO.questions.find(
    (question) => question.id === selectedQuestionId
  );
  const highlightedNodes = useMemo(
    () => new Set(selectedQuestion?.nodeIds ?? []),
    [selectedQuestion]
  );
  const highlightedEdges = useMemo(
    () => new Set(selectedQuestion?.edgeIds ?? []),
    [selectedQuestion]
  );

  const nodes = useMemo<Node<PublicMapNodeData>[]>(
    () =>
      STACKHATCH_DEMO.nodes.map((node, sequence) => ({
        id: node.id,
        type: "publicMapNode",
        position: node.position,
        draggable: false,
        connectable: false,
        selectable: true,
        focusable: true,
        ariaLabel: `Open component ${node.name}, ${node.technology}`,
        data: {
          ...node,
          sequence,
          highlighted: highlightedNodes.has(node.id),
          dimmed: Boolean(selectedQuestion && !highlightedNodes.has(node.id)),
        },
      })),
    [highlightedNodes, selectedQuestion]
  );

  const edges = useMemo<Edge[]>(
    () =>
      STACKHATCH_DEMO.edges.map((edge, sequence) => {
        const highlighted = highlightedEdges.has(edge.id);
        const dimmed = Boolean(selectedQuestion && !highlighted);
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: edge.label,
          focusable: true,
          interactionWidth: 20,
          selected: edge.id === selectedEdgeId,
          ariaLabel: `Inspect connection from ${
            STACKHATCH_DEMO.nodes.find((node) => node.id === edge.source)?.name
          } to ${STACKHATCH_DEMO.nodes.find((node) => node.id === edge.target)?.name}: ${edge.label}`,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: highlighted ? "var(--brand)" : "var(--muted-foreground)",
            width: 14,
            height: 14,
          },
          style: {
            stroke: highlighted ? "var(--brand)" : "var(--muted-foreground)",
            strokeWidth: highlighted ? 2.4 : 1.2,
            opacity: dimmed ? 0.18 : 0.78,
            animationDelay: `${220 + sequence * 12}ms`,
          },
          labelStyle: {
            fill: "var(--muted-foreground)",
            fontSize: 10,
            fontFamily: "var(--font-utility)",
          },
          labelBgStyle: { fill: "var(--canvas)", fillOpacity: 0.9 },
          labelBgPadding: [5, 3] as [number, number],
          labelBgBorderRadius: 2,
        };
      }),
    [highlightedEdges, selectedEdgeId, selectedQuestion]
  );

  const selectedNode =
    STACKHATCH_DEMO.nodes.find((node) => node.id === selectedNodeId) ?? STACKHATCH_DEMO.nodes[0];
  const alternatives =
    STACKHATCH_DEMO.alternatives[selectedNode.id as keyof typeof STACKHATCH_DEMO.alternatives];
  const selectedEdge = STACKHATCH_DEMO.edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const selectedEdgeSource = selectedEdge
    ? STACKHATCH_DEMO.nodes.find((node) => node.id === selectedEdge.source)
    : null;
  const selectedEdgeTarget = selectedEdge
    ? STACKHATCH_DEMO.nodes.find((node) => node.id === selectedEdge.target)
    : null;

  function selectNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setSelectedQuestionId(null);
    setShowAlternatives(false);
    trackEvent("demo_node_opened", { location: "demo" });
  }

  function selectEdge(edgeId: string) {
    setSelectedEdgeId(edgeId);
    setSelectedQuestionId(null);
    setShowAlternatives(false);
  }

  function handleMapKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;

    const target = event.target as HTMLElement;
    const nodeId = target.closest<HTMLElement>(".react-flow__node")?.dataset.id;
    if (nodeId) {
      selectNode(nodeId);
      return;
    }

    const edgeTestId = target
      .closest<SVGGElement>(".react-flow__edge")
      ?.getAttribute("data-testid");
    if (edgeTestId?.startsWith("rf__edge-")) {
      selectEdge(edgeTestId.slice("rf__edge-".length));
    }
  }

  return (
    <section className={`architecture-demo ${mode === "embedded" ? "is-embedded" : "is-full"}`}>
      <div className="demo-toolbar">
        <div>
          <p className="demo-status">
            <span aria-hidden="true" /> Read-only architecture overview
          </p>
          <p className="demo-provenance">
            {STACKHATCH_DEMO.repository} · mapped from {STACKHATCH_DEMO.sourceCommit} ·{" "}
            {STACKHATCH_DEMO.mappedAtLabel}
          </p>
        </div>
        <TrackedSourceLink
          href={STACKHATCH_DEMO.sourceUrl}
          className="demo-source-link"
          target="_blank"
          rel="noreferrer"
          location="demo"
        >
          <GitBranch aria-hidden="true" className="h-4 w-4" />
          Source
        </TrackedSourceLink>
      </div>

      <div className="demo-workspace">
        <aside className="demo-questions" aria-label="Questions about the StackHatch architecture">
          <div>
            <p className="demo-panel-label">Ask this map</p>
            <h2>Follow a real path</h2>
          </div>
          <div className="demo-question-list">
            {STACKHATCH_DEMO.questions.map((question) => (
              <button
                key={question.id}
                type="button"
                aria-pressed={selectedQuestionId === question.id}
                onClick={() => {
                  setSelectedQuestionId(question.id);
                  setSelectedNodeId(question.id === "data-storage" ? "sqlite" : "repo-analyzer");
                  setShowAlternatives(false);
                  trackEvent("demo_question_opened", { location: "demo" });
                }}
              >
                <Route aria-hidden="true" className="h-4 w-4" />
                {question.label}
              </button>
            ))}
          </div>
          {selectedQuestion && (
            <div className="demo-answer" aria-live="polite">
              <p className="demo-panel-label">Checked-in answer</p>
              <p>{selectedQuestion.answer}</p>
            </div>
          )}
        </aside>

        <div
          className="demo-canvas"
          aria-label="Interactive map of the StackHatch architecture"
          onKeyDown={handleMapKeyDown}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={(_, node) => selectNode(node.id)}
            onEdgeClick={(_, edge) => selectEdge(edge.id)}
            fitView
            fitViewOptions={{ padding: 0.14, minZoom: 0.3, maxZoom: 1 }}
            minZoom={0.25}
            maxZoom={1.4}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            deleteKeyCode={null}
            onError={handleReactFlowError}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              color="var(--muted-foreground)"
              style={{ opacity: 0.18 }}
            />
            <Controls showInteractive={false} position="bottom-left" />
          </ReactFlow>
        </div>

        <aside className="demo-detail" aria-live="polite">
          {selectedEdge && selectedEdgeSource && selectedEdgeTarget ? (
            <>
              <p className="demo-panel-label">Selected connection</p>
              <h2>
                {selectedEdgeSource.name} → {selectedEdgeTarget.name}
              </h2>
              <p className="demo-technology">{selectedEdge.connectionType.toUpperCase()}</p>
              <p>
                {selectedEdgeSource.name} sends {selectedEdge.label} to {selectedEdgeTarget.name}.
              </p>
              <div className="demo-reasoning">
                <p className="demo-panel-label">Relationship</p>
                <p>
                  This checked-in connection is part of the generated architecture overview and can
                  be challenged or edited in a saved map.
                </p>
              </div>
            </>
          ) : (
            <>
              <p className="demo-panel-label">Selected component</p>
              <h2>{selectedNode.name}</h2>
              <p className="demo-technology">{selectedNode.technology}</p>
              <p>{selectedNode.description}</p>
              <div className="demo-reasoning">
                <p className="demo-panel-label">Why it is here</p>
                <p>{selectedNode.reasoning}</p>
              </div>
              {alternatives && (
                <button
                  type="button"
                  className="demo-alternative-toggle"
                  aria-expanded={showAlternatives}
                  onClick={() =>
                    setShowAlternatives((current) => {
                      if (!current) trackEvent("alternatives_opened", { location: "demo" });
                      return !current;
                    })
                  }
                >
                  {showAlternatives ? "Hide alternatives" : "Explore alternatives"}
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </button>
              )}
              {showAlternatives && alternatives && (
                <div className="demo-alternatives">
                  {alternatives.map((alternative) => (
                    <article key={alternative.name}>
                      <h3>{alternative.name}</h3>
                      <p className="demo-technology">{alternative.technology}</p>
                      <p>{alternative.whenToUse}</p>
                      <p className="demo-tradeoff">Tradeoff: {alternative.tradeoff}</p>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </aside>
      </div>

      <details className="demo-text-equivalent">
        <summary>Read the components and connections</summary>
        <div className="demo-text-grid">
          <div>
            <h2>Components</h2>
            <ul>
              {STACKHATCH_DEMO.nodes.map((node) => (
                <li key={node.id}>
                  <button type="button" onClick={() => selectNode(node.id)}>
                    <strong>{node.name}</strong> — {node.technology}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>Connections</h2>
            <ul>
              {STACKHATCH_DEMO.edges.map((edge) => {
                const source = STACKHATCH_DEMO.nodes.find((node) => node.id === edge.source)?.name;
                const target = STACKHATCH_DEMO.nodes.find((node) => node.id === edge.target)?.name;
                return (
                  <li key={edge.id}>
                    {source} → {target}: {edge.label}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </details>

      {mode === "full" && (
        <div className="demo-map-yours">
          <div>
            <h2>Map your repository</h2>
            <p>Start with a public GitHub repository. You will confirm before the scan begins.</p>
          </div>
          <RepositoryIntentForm location="demo" compact />
        </div>
      )}
    </section>
  );
}
