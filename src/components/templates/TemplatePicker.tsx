"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CURATED_STARTER_TEMPLATES } from "@/lib/starter-templates";

interface Template {
  id: string;
  name: string;
  description: string | null;
  canvasState: string;
  createdAt: number;
  source?: "curated";
}

interface TemplatePickerProps {
  onSelectTemplate: (template: Template) => void;
  onCancel: () => void;
  busyTemplateId?: string | null;
  selectionError?: string;
  onRetrySelection?: () => void;
  emptyStateHref?: string;
}

interface TemplateCanvas {
  nodes?: Array<{ category?: string }>;
  edges?: unknown[];
}

function summarizeTemplate(canvasState: string): string {
  try {
    const parsed = JSON.parse(canvasState) as TemplateCanvas;
    const nodeCount = parsed.nodes?.length ?? 0;
    const edgeCount = parsed.edges?.length ?? 0;

    if (nodeCount === 0) return "Empty map";

    const categories = new Set(
      (parsed.nodes ?? [])
        .map((node) => node.category)
        .filter((category): category is string => !!category)
    );
    const categoryList = Array.from(categories).slice(0, 3).join(", ");
    const counts = `${nodeCount} node${nodeCount === 1 ? "" : "s"}, ${edgeCount} connection${edgeCount === 1 ? "" : "s"}`;

    return categoryList ? `${counts}\nIncludes: ${categoryList}` : counts;
  } catch {
    return "Map preview unavailable";
  }
}

function TemplateCard({
  template,
  onSelectTemplate,
  busyTemplateId,
}: {
  template: Template;
  onSelectTemplate: (template: Template) => void;
  busyTemplateId?: string | null;
}) {
  const isCurated = template.source === "curated";

  return (
    <button
      type="button"
      onClick={() => onSelectTemplate(template)}
      disabled={Boolean(busyTemplateId)}
      aria-busy={busyTemplateId === template.id || undefined}
      className="rounded-md border border-[var(--border)] bg-[var(--background)] p-4 text-left transition-colors hover:bg-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:cursor-wait disabled:opacity-60"
    >
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-medium">{template.name}</h4>
        <span className="font-utility rounded border border-[var(--border)] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
          {isCurated ? "Built-in" : "Personal"}
        </span>
      </div>
      {template.description && (
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
          {template.description}
        </p>
      )}
      <p className="mt-3 whitespace-pre-line font-mono text-xs leading-5 text-[var(--muted-foreground)]">
        {summarizeTemplate(template.canvasState)}
      </p>
      <p className="mt-2 text-xs text-[var(--muted-foreground)]">
        {isCurated
          ? "Included with StackHatch"
          : `Saved ${new Date(template.createdAt).toLocaleDateString()}`}
      </p>
      {busyTemplateId === template.id && (
        <p className="mt-3 text-sm font-semibold text-[var(--color-client)]" role="status">
          Creating your copy...
        </p>
      )}
    </button>
  );
}

export default function TemplatePicker({
  onSelectTemplate,
  onCancel,
  busyTemplateId,
  selectionError,
  onRetrySelection,
  emptyStateHref,
}: TemplatePickerProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusDialog = window.requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
        ?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusDialog);
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadTemplates() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/templates");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (!cancelled) setError(data.error || "Failed to load templates");
          return;
        }

        const data = await res.json();
        if (!cancelled) setTemplates(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setError("Failed to load templates");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadTemplates();
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] px-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-picker-title"
        className="flex max-h-[84vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-xl"
      >
        <div className="border-b border-[var(--border)] p-6">
          <h3 id="template-picker-title" className="text-lg font-semibold">
            Start from Template
          </h3>
          <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
            Copy a built-in starter or one of your saved maps into a separate project.
          </p>
        </div>

        <div className="flex-1 space-y-8 overflow-y-auto p-6">
          <section aria-labelledby="curated-templates-title">
            <div>
              <h4 id="curated-templates-title" className="font-display text-base font-bold">
                Curated starters
              </h4>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Read-only starting points maintained by StackHatch.
              </p>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {CURATED_STARTER_TEMPLATES.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onSelectTemplate={onSelectTemplate}
                  busyTemplateId={busyTemplateId}
                />
              ))}
            </div>
          </section>

          <section aria-labelledby="personal-templates-title">
            <div>
              <h4 id="personal-templates-title" className="font-display text-base font-bold">
                Your templates
              </h4>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Maps you saved for reuse.
              </p>
            </div>

            {loading ? (
              <p className="py-6 text-sm text-[var(--muted-foreground)]" role="status">
                Loading your templates...
              </p>
            ) : error ? (
              <div className="mt-4 rounded-md border border-[var(--danger-border)] bg-[var(--danger-surface)] p-4">
                <p className="text-sm text-[var(--danger)]" role="alert">
                  {error}. Built-in starters are still available.
                </p>
                <button
                  type="button"
                  onClick={() => setLoadAttempt((attempt) => attempt + 1)}
                  className="mt-3 min-h-11 rounded-md border border-[var(--danger-border)] px-4 py-2 text-sm font-semibold text-[var(--danger)]"
                >
                  Retry templates
                </button>
              </div>
            ) : templates.length === 0 ? (
              <div className="mt-4 rounded-md border border-dashed border-[var(--border)] p-4">
                <p className="font-medium">No personal templates yet.</p>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  Save any architecture map as a template, then reuse it here.
                </p>
                {emptyStateHref && (
                  <Link
                    href={emptyStateHref}
                    className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold hover:text-[var(--brand)]"
                  >
                    Choose another starting point
                  </Link>
                )}
              </div>
            ) : (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {templates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onSelectTemplate={onSelectTemplate}
                    busyTemplateId={busyTemplateId}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-3 border-t border-[var(--border)] p-6 sm:flex-row sm:items-center sm:justify-between">
          {selectionError ? (
            <div className="flex-1">
              <p className="text-sm text-[var(--danger)]" role="alert">
                {selectionError}
              </p>
              {onRetrySelection && (
                <button
                  type="button"
                  onClick={onRetrySelection}
                  disabled={Boolean(busyTemplateId)}
                  className="mt-2 min-h-11 rounded-md border border-[var(--danger-border)] px-4 py-2 text-sm font-semibold text-[var(--danger)] disabled:opacity-50"
                >
                  Retry selected template
                </button>
              )}
            </div>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => {
              if (!busyTemplateId) onCancel();
            }}
            aria-disabled={Boolean(busyTemplateId)}
            className="min-h-11 rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--muted)] aria-disabled:cursor-wait aria-disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
