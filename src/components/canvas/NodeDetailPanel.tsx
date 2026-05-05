"use client";

import { useState } from "react";
import * as icons from "lucide-react";
import type { NodeCategory, NodeSubtype, StackNode, AlternativeNode } from "@/types/stack";
import { categoryOrder, getCategoryConfig, getSubtypesForCategory } from "@/lib/node-config";
import type { CustomSubtypesMap } from "@/lib/custom-subtypes";
import AlternativesSection from "@/components/canvas/AlternativesSection";
import { sanitizeHtml, containsHtml } from "@/lib/sanitize-html";

function DynamicIcon({
  name,
  size,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const Icon = (icons as unknown as Record<string, typeof icons.Box>)[name] ?? icons.Box;
  return <Icon size={size} className={className} />;
}

export interface NodeDetailPanelProps {
  node: StackNode | null;
  open?: boolean;
  onUpdate: (id: string, updates: Partial<StackNode>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  customSubtypes?: CustomSubtypesMap;
  alternatives?: AlternativeNode[];
  alternativesLoading?: boolean;
  showDescription?: boolean;
  canUseNodeLocking?: boolean;
  onSuggestAlternatives?: () => void;
  onSwapAlternative?: (alt: AlternativeNode) => void;
}

export default function NodeDetailPanel({
  node,
  open = !!node,
  onUpdate,
  onDelete,
  onClose,
  customSubtypes,
  alternatives,
  alternativesLoading,
  showDescription = true,
  canUseNodeLocking = true,
  onSuggestAlternatives,
  onSwapAlternative,
}: NodeDetailPanelProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const confirmDelete = confirmDeleteId === node?.id;

  if (!node) return null;

  const catConfig = getCategoryConfig(node.category);
  const subtypes = getSubtypesForCategory(node.category, customSubtypes);

  function handleCategoryChange(newCategory: NodeCategory) {
    const newSubtypes = getSubtypesForCategory(newCategory, customSubtypes);
    const firstSubtype = Object.keys(newSubtypes)[0] as NodeSubtype;
    onUpdate(node!.id, {
      category: newCategory,
      subtype: firstSubtype,
      name: newSubtypes[firstSubtype]?.displayName ?? node!.name,
    });
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
    <div
      className={`absolute inset-x-0 bottom-0 z-20 flex max-h-[70vh] w-full flex-col border-t border-[var(--border)] bg-[var(--background)] shadow-xl transition-transform duration-200 ease-out motion-reduce:transition-none md:inset-x-auto md:right-0 md:top-0 md:h-full md:max-h-none md:w-[400px] md:border-l md:border-t-0 ${
        open
          ? "pointer-events-auto translate-y-0 md:translate-x-0"
          : "pointer-events-none translate-y-full md:translate-x-full md:translate-y-0"
      }`}
      aria-hidden={!open}
      data-testid="node-detail-panel"
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
        <div
          className="flex h-8 w-8 items-center justify-center rounded"
          style={{ backgroundColor: catConfig.color, color: "white" }}
        >
          <DynamicIcon name={catConfig.icon} size={18} />
        </div>
        <input
          type="text"
          value={node.name}
          onChange={(e) => onUpdate(node.id, { name: e.target.value })}
          className="flex-1 bg-transparent text-lg font-semibold text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--color-client)] focus:rounded px-1"
          aria-label="Node name"
        />
        <button
          onClick={onClose}
          className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          aria-label="Close panel"
        >
          <icons.X size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Technology */}
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
            Technology
          </label>
          <textarea
            value={node.technology}
            onChange={(e) => onUpdate(node.id, { technology: e.target.value })}
            placeholder="e.g., PostgreSQL 16"
            rows={2}
            className="w-full resize-none rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-client)]"
            aria-label="Technology"
          />
          {containsHtml(node.technology) && (
            <div
              className="mt-1 rounded bg-[var(--muted)] px-3 py-1.5 text-sm text-[var(--foreground)] [&_a]:text-blue-500 [&_a]:underline"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(node.technology) }}
            />
          )}
        </div>

        {/* Category */}
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
            Category
          </label>
          <select
            value={node.category}
            onChange={(e) => handleCategoryChange(e.target.value as NodeCategory)}
            className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-client)]"
            aria-label="Category"
          >
            {categoryOrder.map((cat) => (
              <option key={cat} value={cat}>
                {getCategoryConfig(cat).displayName}
              </option>
            ))}
          </select>
        </div>

        {/* Subtype */}
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
            Subtype
          </label>
          <select
            value={node.subtype}
            onChange={(e) => onUpdate(node.id, { subtype: e.target.value as NodeSubtype })}
            className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-client)]"
            aria-label="Subtype"
          >
            {Object.entries(subtypes).map(([key, config]) => (
              <option key={key} value={key}>
                {config.displayName}
              </option>
            ))}
          </select>
        </div>

        {showDescription && (
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              Description
            </label>
            <textarea
              value={node.description}
              onChange={(e) => onUpdate(node.id, { description: e.target.value })}
              placeholder="What this component does..."
              rows={3}
              className="w-full resize-none rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-client)]"
              aria-label="Description"
            />
            {containsHtml(node.description) && (
              <div
                className="mt-1 rounded bg-[var(--muted)] px-3 py-1.5 text-sm text-[var(--foreground)] [&_a]:text-blue-500 [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(node.description) }}
              />
            )}
          </div>
        )}

        {/* Reasoning (read-only) */}
        {node.reasoning && (
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              AI Reasoning
            </label>
            <div className="rounded bg-[var(--muted)] px-3 py-2 text-sm italic text-[var(--muted-foreground)]">
              {node.reasoning}
            </div>
          </div>
        )}

        {/* Lock Toggle */}
        {canUseNodeLocking && (
          <div className="flex items-center justify-between rounded border border-[var(--border)] px-3 py-3">
            <div className="flex items-center gap-2">
              {node.locked ? (
                <icons.Lock size={16} className="text-[var(--color-data)]" />
              ) : (
                <icons.Unlock size={16} className="text-[var(--muted-foreground)]" />
              )}
              <span className="text-sm font-medium text-[var(--foreground)]">
                {node.locked ? "Locked" : "Unlocked"}
              </span>
            </div>
            <button
              onClick={() => onUpdate(node.id, { locked: !node.locked })}
              role="switch"
              aria-checked={node.locked}
              aria-label="Lock toggle"
              className={`relative h-6 w-11 rounded-full transition-colors ${
                node.locked ? "bg-[var(--color-data)]" : "bg-[var(--muted-foreground)]"
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  node.locked ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        )}

        {/* Alternatives */}
        {onSuggestAlternatives && onSwapAlternative && (
          <AlternativesSection
            nodeId={node.id}
            node={node}
            alternatives={alternatives ?? []}
            loading={alternativesLoading ?? false}
            onSuggest={onSuggestAlternatives}
            onSwap={onSwapAlternative}
          />
        )}
      </div>

      {/* Footer - Delete */}
      <div className="border-t border-[var(--border)] px-4 py-3">
        <button
          onClick={handleDelete}
          className={`w-full rounded px-4 py-2 text-sm font-medium transition-colors ${
            confirmDelete
              ? "bg-red-600 text-white hover:bg-red-700"
              : "border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
          }`}
        >
          {confirmDelete ? "Confirm Delete" : "Delete Node"}
        </button>
      </div>
    </div>
  );
}
