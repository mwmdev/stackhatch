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
    <section aria-labelledby="node-alternatives-heading" className="node-detail__section">
      <div className="flex items-center justify-between gap-3">
        <h3 id="node-alternatives-heading" className="type-subhead-sm">
          Alternatives
        </h3>
        <button type="button" onClick={onSuggest} disabled={loading} className="btn btn--sm">
          {loading ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <Sparkles aria-hidden="true" />
          )}
          {loading ? "Suggesting..." : "Suggest alternatives"}
        </button>
      </div>

      {alternatives.length > 0 && (
        <ul className="mt-3 divide-y divide-rule border-t border-rule">
          {alternatives.map((alt, i) => (
            <li key={`${alt.technology}-${i}`} className="flex items-start gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="font-utility text-[13px] text-ink">{alt.technology}</p>
                <p className="type-small mt-0.5 text-ink2">{alt.description}</p>
              </div>
              <button type="button" onClick={() => onSwap(alt)} className="btn btn--quiet btn--sm">
                <ArrowLeftRight aria-hidden="true" />
                Swap
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
