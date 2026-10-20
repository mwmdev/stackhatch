"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Lock, Trash2, Unlock, X } from "lucide-react";
import type {
  ConnectionType,
  NodeCategory,
  NodeSubtype,
  StackEdge,
  StackNode,
  AlternativeNode,
} from "@/types/stack";
import {
  categoryOrder,
  getCategoryConfig,
  getNoteColorConfig,
  getSubtypesForCategory,
  NOTE_COLOR_OPTIONS,
} from "@/lib/node-config";
import type { CustomSubtypesMap } from "@/lib/custom-subtypes";
import AlternativesSection from "@/components/canvas/AlternativesSection";
import DynamicLucideIcon from "@/components/ui/DynamicLucideIcon";
import IconControl from "@/components/ui/IconControl";
import { sanitizeHtml, containsHtml } from "@/lib/sanitize-html";
import { CANVAS_TEXT_LIMITS } from "@/lib/canvas-limits";
import { edgeStyles } from "@/components/canvas/StackEdge";

export interface NodeDetailPanelProps {
  node: StackNode | null;
  open?: boolean;
  onUpdate: (id: string, updates: Partial<StackNode>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  nodes?: StackNode[];
  edges?: StackEdge[];
  onConnectNode?: (sourceId: string, targetId: string) => void;
  onEdgeTypeChange?: (edgeId: string, type: ConnectionType) => void;
  onEdgeLabelChange?: (edgeId: string, label: string) => void;
  onRemoveEdge?: (edgeId: string) => void;
  customSubtypes?: CustomSubtypesMap;
  alternatives?: AlternativeNode[];
  alternativesLoading?: boolean;
  showDescription?: boolean;
  canUseNodeLocking?: boolean;
  onSuggestAlternatives?: () => void;
  onSwapAlternative?: (alt: AlternativeNode) => void;
  mutationBlocked?: boolean;
}

export default function NodeDetailPanel({
  node,
  open = !!node,
  onUpdate,
  onDelete,
  onClose,
  nodes = [],
  edges = [],
  onConnectNode,
  onEdgeTypeChange,
  onEdgeLabelChange,
  onRemoveEdge,
  customSubtypes,
  alternatives,
  alternativesLoading,
  showDescription = true,
  canUseNodeLocking = true,
  onSuggestAlternatives,
  onSwapAlternative,
  mutationBlocked = false,
}: NodeDetailPanelProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const [connectTarget, setConnectTarget] = useState("");
  const focusedNodeId = node?.id;

  useEffect(() => {
    if (open && focusedNodeId) {
      if (!wasOpenRef.current) {
        returnFocusRef.current = document.activeElement as HTMLElement | null;
      }
      nameRef.current?.focus();
    } else if (wasOpenRef.current) {
      const target = returnFocusRef.current;
      requestAnimationFrame(() => {
        if (target?.isConnected) target.focus();
      });
    }
    wasOpenRef.current = open && !!focusedNodeId;
  }, [open, focusedNodeId]);
  const confirmDelete = confirmDeleteId === node?.id;

  if (!node) return null;

  const catConfig = getCategoryConfig(node.category);
  const isNoteNode = node.category === "note";
  const selectedNoteColor = getNoteColorConfig(node.noteColor).value;
  const subtypes = getSubtypesForCategory(node.category, customSubtypes);
  const connectedEdges = edges.filter((edge) => edge.source === node.id || edge.target === node.id);
  const otherNodes = nodes.filter(
    (candidate) => candidate.id !== node.id && candidate.category !== "note"
  );
  const technologyPlaceholder: Partial<Record<NodeCategory, string>> = {
    client: "e.g., Next.js",
    api: "e.g., Express",
    services: "e.g., Node.js",
    data: "e.g., PostgreSQL 16",
    infrastructure: "e.g., AWS",
    external: "e.g., Stripe",
  };
  const hasCurrentSubtype = Object.hasOwn(subtypes, node.subtype);

  function handleCategoryChange(newCategory: NodeCategory) {
    const newSubtypes = getSubtypesForCategory(newCategory, customSubtypes);
    const firstSubtype = Object.keys(newSubtypes)[0] as NodeSubtype;
    onUpdate(node!.id, { category: newCategory, subtype: firstSubtype });
  }

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDeleteId(node!.id);
      return;
    }
    onDelete(node!.id);
    onClose();
  }

  return (
    <aside
      className="node-detail"
      data-open={open}
      aria-label="Node details"
      aria-hidden={!open}
      inert={!open || mutationBlocked || undefined}
      data-testid="node-detail-panel"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="node-detail__inner">
        <header className="node-detail__header">
          <span
            className="node-detail__tag type-tag"
            style={{ backgroundColor: catConfig.fill, color: catConfig.foreground }}
          >
            <DynamicLucideIcon name={catConfig.icon} aria-hidden="true" />
            {catConfig.displayName}
          </span>
          <span className="flex-1" />
          {canUseNodeLocking && (
            <IconControl
              label={node.locked ? "Unlock node" : "Lock node"}
              active={node.locked}
              onClick={() => onUpdate(node.id, { locked: !node.locked })}
            >
              {node.locked ? <Lock /> : <Unlock />}
            </IconControl>
          )}
          <IconControl label="Close panel" tooltip="Close" onClick={onClose}>
            <X />
          </IconControl>
        </header>

        <div className="node-detail__body">
          <input
            ref={nameRef}
            maxLength={CANVAS_TEXT_LIMITS.nodeName}
            type="text"
            value={node.name}
            onChange={(e) => onUpdate(node.id, { name: e.target.value })}
            className="node-detail__name type-field-title"
            aria-label="Node name"
          />

          {!isNoteNode && (
            <div className="field">
              <label className="field">
                <span className="field-label">Technology</span>
                <textarea
                  value={node.technology}
                  onChange={(e) => onUpdate(node.id, { technology: e.target.value })}
                  placeholder={technologyPlaceholder[node.category]}
                  maxLength={CANVAS_TEXT_LIMITS.nodeTechnology}
                  rows={1}
                  className="field-textarea field-input--mono min-h-10 resize-none [field-sizing:content]"
                />
              </label>
              {containsHtml(node.technology) && (
                <div
                  className="type-small text-ink2 [&_a]:text-link [&_a]:underline"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(node.technology) }}
                />
              )}
            </div>
          )}

          {!isNoteNode && (
            <div className="grid grid-cols-2 gap-3">
              <label className="field">
                <span className="field-label">Category</span>
                <select
                  value={node.category}
                  onChange={(e) => handleCategoryChange(e.target.value as NodeCategory)}
                  className="field-select"
                >
                  {categoryOrder.map((cat) => (
                    <option key={cat} value={cat}>
                      {getCategoryConfig(cat).displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Subtype</span>
                <select
                  value={node.subtype}
                  onChange={(e) => onUpdate(node.id, { subtype: e.target.value as NodeSubtype })}
                  className="field-select"
                >
                  {!hasCurrentSubtype && (
                    <option value={node.subtype} disabled>
                      {node.subtype} (deprecated)
                    </option>
                  )}
                  {Object.entries(subtypes).map(([key, config]) => (
                    <option key={key} value={key}>
                      {config.displayName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {showDescription && (
            <div className="field">
              <label className="field">
                <span className="field-label">{isNoteNode ? "Note" : "Description"}</span>
                <textarea
                  value={node.description}
                  onChange={(e) => onUpdate(node.id, { description: e.target.value })}
                  placeholder={isNoteNode ? "Write a note..." : "What this component does..."}
                  rows={isNoteNode ? 8 : 3}
                  className="field-textarea resize-none"
                />
              </label>
              {containsHtml(node.description) && (
                <div
                  className="type-small text-ink2 [&_a]:text-link [&_a]:underline"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(node.description) }}
                />
              )}
            </div>
          )}

          {isNoteNode && (
            <fieldset className="field">
              <legend className="field-label mb-1.5">Color</legend>
              <div className="flex gap-2">
                {NOTE_COLOR_OPTIONS.map((option) => {
                  const selected = selectedNoteColor === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-label={`Note color ${option.label}`}
                      aria-pressed={selected}
                      onClick={() => onUpdate(node.id, { noteColor: option.value })}
                      className="node-detail__swatch"
                      style={{ backgroundColor: option.fill, borderColor: option.border }}
                    >
                      {selected && (
                        <Check aria-hidden="true" style={{ color: option.foreground }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          {!isNoteNode && node.reasoning && (
            <div className="field">
              <span className="field-label">Reasoning</span>
              <p className="type-ui m-0 text-ink">{node.reasoning}</p>
            </div>
          )}

          {!isNoteNode && onSuggestAlternatives && onSwapAlternative && (
            <AlternativesSection
              nodeId={node.id}
              node={node}
              alternatives={alternatives ?? []}
              loading={alternativesLoading ?? false}
              onSuggest={onSuggestAlternatives}
              onSwap={onSwapAlternative}
            />
          )}

          {!isNoteNode && onConnectNode && onEdgeTypeChange && onRemoveEdge && (
            <section aria-labelledby="node-connections-heading" className="node-detail__section">
              <div className="flex items-baseline justify-between gap-3">
                <h3 id="node-connections-heading" className="type-subhead-sm">
                  Connections
                </h3>
                <span className="type-small tabular-nums text-ink2">{connectedEdges.length}</span>
              </div>
              {connectedEdges.length > 0 && (
                <ul className="mt-2 divide-y divide-rule">
                  {connectedEdges.map((edge) => {
                    const outgoing = edge.source === node.id;
                    const other = nodes.find(
                      (candidate) => candidate.id === (outgoing ? edge.target : edge.source)
                    );
                    const direction = outgoing ? "To" : "From";
                    const connectionName = `${direction} ${other?.name ?? (outgoing ? edge.target : edge.source)}`;
                    const DirectionIcon = outgoing ? ArrowRight : ArrowLeft;
                    return (
                      <li key={edge.id} className="grid gap-2 py-3">
                        <p className="type-label flex min-w-0 items-center gap-2 text-ink">
                          <DirectionIcon aria-hidden="true" className="h-3.5 w-3.5 flex-none" />
                          <span className="truncate">{connectionName}</span>
                        </p>
                        <div className="flex items-center gap-2">
                          <select
                            value={edge.connectionType}
                            aria-label={`${connectionName} connection type`}
                            onChange={(event) =>
                              onEdgeTypeChange(edge.id, event.target.value as ConnectionType)
                            }
                            className="field-select w-[7.375rem] flex-none"
                          >
                            {Object.entries(edgeStyles).map(([type, style]) => (
                              <option key={type} value={type}>
                                {style.displayName}
                              </option>
                            ))}
                          </select>
                          {onEdgeLabelChange && (
                            <input
                              value={edge.label}
                              maxLength={CANVAS_TEXT_LIMITS.edgeLabel}
                              aria-label={`${connectionName} label`}
                              onChange={(event) => onEdgeLabelChange(edge.id, event.target.value)}
                              className="field-input min-w-0 flex-1"
                            />
                          )}
                          <IconControl
                            label={`Remove connection ${connectionName}`}
                            tooltip="Remove connection"
                            tooltipPlacement="left"
                            variant="outline"
                            onClick={() => onRemoveEdge(edge.id)}
                          >
                            <X />
                          </IconControl>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {otherNodes.length > 0 && (
                <select
                  value={connectTarget}
                  aria-label="Connect to"
                  onChange={(event) => {
                    const targetId = event.target.value;
                    setConnectTarget("");
                    if (targetId) onConnectNode(node.id, targetId);
                  }}
                  className="field-select mt-2"
                >
                  <option value="">Connect to…</option>
                  {otherNodes.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              )}
            </section>
          )}
        </div>

        <footer className="node-detail__footer">
          <button
            type="button"
            onClick={handleDelete}
            className={`btn ${confirmDelete ? "btn--danger-solid" : "btn--danger"}`}
          >
            <Trash2 aria-hidden="true" />
            {confirmDelete ? "Confirm delete" : "Delete node"}
          </button>
        </footer>
      </div>
    </aside>
  );
}
