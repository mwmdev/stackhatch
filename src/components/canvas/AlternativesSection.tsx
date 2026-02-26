"use client";

import { Sparkles, ArrowLeftRight, Loader2 } from "lucide-react";
import type { StackNode, AlternativeNode } from "@/types/stack";

interface AlternativesSectionProps {
  nodeId: string;
  node: StackNode;
  alternatives: AlternativeNode[];
  loading: boolean;
  onSuggest: () => void;
  onSwap: (alt: AlternativeNode) => void;
}

export default function AlternativesSection({
  alternatives,
  loading,
  onSuggest,
  onSwap,
}: AlternativesSectionProps) {
  return (
    <div className="space-y-2">
      <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
        Alternatives
      </label>

      <button
        onClick={onSuggest}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Sparkles size={16} />
        )}
        {loading ? "Suggesting..." : "Suggest Alternatives"}
      </button>

      {alternatives.length > 0 && (
        <div className="space-y-2">
          {alternatives.map((alt, i) => (
            <div
              key={`${alt.technology}-${i}`}
              className="rounded border border-[var(--border)] px-3 py-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--foreground)]">
                    {alt.technology}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                    {alt.description}
                  </p>
                </div>
                <button
                  onClick={() => onSwap(alt)}
                  className="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[var(--color-client)] hover:bg-[var(--muted)]"
                  title="Swap this alternative onto the canvas"
                >
                  <ArrowLeftRight size={14} />
                  Swap
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
