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
  canUseNotes?: boolean;
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
  canUseNotes = true,
  onSuggestAlternatives,
  onSwapAlternative,
}: NodeDetailPanelProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const confirmDelete = confirmDeleteId === node?.id;

  if (!node) return null;

  const catConfig = getCategoryConfig(node.category);
  const isNoteNode = node.category === "note";
  const subtypes = getSubtypesForCategory(node.category, customSubtypes);
  const categoryOptions = categoryOrder.filter(
    (cat) => canUseNotes || cat !== "note" || node.category === "note"
  );

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
          style={{ backgroundColor: catConfig.fill, color: catConfig.foreground }}
        >
          <DynamicIcon name={catConfig.icon} size={18} />
        </div>
        <input
          type="text"
          value={node.name}
          onChange={(e) => onUpdate(node.id, { name: e.target.value })}
          className="flex-1 rounded bg-transparent px-1 text-lg font-semibold text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--ring)]"
          aria-label="Node name"
        />
        <button
          onClick={onClose}
          className="rounded-md p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          aria-label="Close panel"
        >
          <icons.X size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Technology */}
        {!isNoteNode && (
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              Technology
            </label>
            <textarea
              value={node.technology}
              onChange={(e) => onUpdate(node.id, { technology: e.target.value })}
              placeholder="e.g., PostgreSQL 16"
              rows={2}
              className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              aria-label="Technology"
            />
            {containsHtml(node.technology) && (
              <div
                className="mt-1 rounded-md bg-[var(--muted)] px-3 py-1.5 text-sm text-[var(--foreground)] [&_a]:text-[var(--link)] [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(node.technology) }}
              />
            )}
          </div>
        )}

        {/* Category */}
        {!isNoteNode && (
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              Category
            </label>
            <select
              value={node.category}
              onChange={(e) => handleCategoryChange(e.target.value as NodeCategory)}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              aria-label="Category"
            >
              {categoryOptions.map((cat) => (
                <option key={cat} value={cat}>
                  {getCategoryConfig(cat).displayName}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Subtype */}
        {!isNoteNode && (
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              Subtype
            </label>
            <select
              value={node.subtype}
              onChange={(e) => onUpdate(node.id, { subtype: e.target.value as NodeSubtype })}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              aria-label="Subtype"
            >
              {Object.entries(subtypes).map(([key, config]) => (
                <option key={key} value={key}>
                  {config.displayName}
                </option>
              ))}
            </select>
          </div>
        )}

        {showDescription && (
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              {isNoteNode ? "Note" : "Description"}
            </label>
            <textarea
              value={node.description}
              onChange={(e) => onUpdate(node.id, { description: e.target.value })}
              placeholder={isNoteNode ? "Write a note..." : "What this component does..."}
              rows={isNoteNode ? 8 : 3}
              className={`w-full resize-none rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] ${
                isNoteNode ? "font-note text-base leading-7" : ""
              }`}
              aria-label={isNoteNode ? "Note" : "Description"}
            />
            {containsHtml(node.description) && (
              <div
                className="mt-1 rounded-md bg-[var(--muted)] px-3 py-1.5 text-sm text-[var(--foreground)] [&_a]:text-[var(--link)] [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(node.description) }}
              />
            )}
          </div>
        )}

        {/* Reasoning (read-only) */}
        {!isNoteNode && node.reasoning && (
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              AI Reasoning
            </label>
            <div className="rounded-md bg-[var(--muted)] px-3 py-2 text-sm italic text-[var(--muted-foreground)]">
              {node.reasoning}
            </div>
          </div>
        )}

        {/* Alternatives */}
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
      </div>

      <div className="flex items-center gap-2 border-t border-[var(--border)] px-4 py-3">
        {canUseNodeLocking && (
          <button
            type="button"
            onClick={() => onUpdate(node.id, { locked: !node.locked })}
            aria-label={node.locked ? "Unlock node" : "Lock node"}
            title={node.locked ? "Unlock node" : "Lock node"}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] ${
              node.locked
                ? "border-[var(--color-data)] bg-[var(--color-data-fill)] text-[var(--color-data-foreground)] hover:opacity-90"
                : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {node.locked ? <icons.Lock size={18} /> : <icons.Unlock size={18} />}
          </button>
        )}
        <button
          onClick={handleDelete}
          className={`min-h-10 flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            confirmDelete
              ? "bg-[var(--danger)] text-[var(--danger-foreground)] hover:bg-[var(--danger-hover)]"
              : "border border-[var(--danger-border)] text-[var(--danger)] hover:bg-[var(--danger-surface)]"
          }`}
        >
          {confirmDelete ? "Confirm Delete" : "Delete Node"}
        </button>
      </div>
    </div>
  );
}
