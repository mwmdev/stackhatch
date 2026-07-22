"use client";

import { useMemo, useState } from "react";
import {
  CUSTOM_SUBTYPE_LIMITS,
  isSupportedLucideIcon,
  isValidCustomSubtypeDisplayName,
  isValidCustomSubtypeSlug,
  validateCustomSubtypes,
  type CustomSubtypeEntry,
  type CustomSubtypesMap,
} from "@/lib/custom-subtypes";
import { categoryOrder, getCategoryConfig, nodeConfig } from "@/lib/node-config";
import type { NodeCategory } from "@/types/stack";

interface CustomSubtypesSettingsProps {
  initialCatalog: CustomSubtypesMap;
}

function cloneCatalog(catalog: CustomSubtypesMap): CustomSubtypesMap {
  return structuredClone(catalog);
}

function catalogFingerprint(catalog: CustomSubtypesMap) {
  return JSON.stringify(catalog);
}

function entryErrors(
  category: NodeCategory,
  entry: CustomSubtypeEntry,
  entries: CustomSubtypeEntry[]
) {
  const errors: Partial<Record<keyof CustomSubtypeEntry, string>> = {};
  if (!isValidCustomSubtypeSlug(entry.slug)) {
    errors.slug = "Use lowercase kebab-case, up to 40 characters.";
  } else if (Object.hasOwn(nodeConfig[category].subtypes, entry.slug)) {
    errors.slug = "This slug is already a built-in subtype.";
  } else if (entries.filter((candidate) => candidate.slug === entry.slug).length > 1) {
    errors.slug = "Each slug must be unique in its category.";
  }

  if (!isValidCustomSubtypeDisplayName(entry.displayName)) {
    errors.displayName = "Use 1–60 trimmed characters on one line.";
  }

  if (!isSupportedLucideIcon(entry.icon)) {
    errors.icon = "Enter a supported Lucide icon name.";
  }
  return errors;
}

export default function CustomSubtypesSettings({ initialCatalog }: CustomSubtypesSettingsProps) {
  const [confirmed, setConfirmed] = useState(() => cloneCatalog(initialCatalog));
  const [draft, setDraft] = useState(() => cloneCatalog(initialCatalog));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "indeterminate">("idle");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const pending = saveState !== "idle";

  const validation = useMemo(() => {
    const byEntry = new Map<string, ReturnType<typeof entryErrors>>();
    let valid = true;
    for (const category of categoryOrder) {
      const entries = draft[category] ?? [];
      if (entries.length > CUSTOM_SUBTYPE_LIMITS.entriesPerCategory) valid = false;
      entries.forEach((entry, index) => {
        const errors = entryErrors(category, entry, entries);
        if (Object.keys(errors).length > 0) valid = false;
        byEntry.set(`${category}:${index}`, errors);
      });
    }
    return { byEntry, valid };
  }, [draft]);

  const dirty = catalogFingerprint(draft) !== catalogFingerprint(confirmed);

  function updateEntry(
    category: NodeCategory,
    index: number,
    key: keyof CustomSubtypeEntry,
    value: string
  ) {
    setFeedback(null);
    setDraft((current) => {
      const entries = [...(current[category] ?? [])];
      entries[index] = { ...entries[index], [key]: value };
      return { ...current, [category]: entries };
    });
  }

  function addEntry(category: NodeCategory) {
    setFeedback(null);
    setDraft((current) => ({
      ...current,
      [category]: [...(current[category] ?? []), { slug: "", displayName: "", icon: "Box" }],
    }));
  }

  function removeEntry(category: NodeCategory, index: number) {
    setFeedback(null);
    setDraft((current) => {
      const entries = (current[category] ?? []).filter((_, entryIndex) => entryIndex !== index);
      const next = { ...current };
      if (entries.length === 0) delete next[category];
      else next[category] = entries;
      return next;
    });
  }

  async function save() {
    if (!dirty || !validation.valid || pending) return;

    let validated: CustomSubtypesMap;
    try {
      validated = validateCustomSubtypes(draft);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Check the subtype fields and try again.",
      });
      return;
    }

    setSaveState("saving");
    setFeedback(null);

    async function reconcileAmbiguousSave() {
      try {
        const response = await fetch("/api/settings", { cache: "no-store" });
        if (!response.ok) throw new Error("Settings refresh failed");
        const data = (await response.json()) as { customSubtypes?: unknown };
        const saved = validateCustomSubtypes(data.customSubtypes);
        setConfirmed(cloneCatalog(saved));
        setDraft(cloneCatalog(saved));
        setFeedback({
          type: "error",
          message: "The save response was interrupted. Your saved subtype settings were reloaded.",
        });
        setSaveState("idle");
      } catch {
        setFeedback({
          type: "error",
          message:
            "Could not confirm whether subtype changes were saved. Reload settings before editing again.",
        });
        setSaveState("indeterminate");
      }
    }

    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customSubtypes: validated }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        customSubtypes?: CustomSubtypesMap;
        error?: string;
      };
      if (!response.ok) {
        setDraft(cloneCatalog(confirmed));
        setFeedback({
          type: "error",
          message: data.error || "Subtype changes could not be saved",
        });
        setSaveState("idle");
        return;
      }

      let saved: CustomSubtypesMap;
      try {
        saved = validateCustomSubtypes(data.customSubtypes);
      } catch {
        await reconcileAmbiguousSave();
        return;
      }
      setConfirmed(cloneCatalog(saved));
      setDraft(cloneCatalog(saved));
      setFeedback({ type: "success", message: "Subtype changes saved" });
      setSaveState("idle");
    } catch {
      await reconcileAmbiguousSave();
    }
  }

  return (
    <section
      id="node-subtypes"
      className="scroll-mt-24 rounded-sm border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-low)] sm:p-6"
    >
      <p className="font-utility mb-1 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
        Vocabulary · 04
      </p>
      <h2 className="text-xl font-semibold text-[var(--card-foreground)]">Node subtypes</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">
        Add personal labels for the components you map. Changes apply to your account after you save
        them; existing nodes keep retired values until you replace them.
      </p>

      <div className="mt-6 space-y-5">
        {categoryOrder.map((category) => {
          const categoryConfig = getCategoryConfig(category);
          const entries = draft[category] ?? [];
          return (
            <fieldset
              key={category}
              disabled={pending}
              className="rounded-sm border border-[var(--border)] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <legend className="font-display px-1 text-sm font-bold">
                  {categoryConfig.displayName}
                </legend>
                <button
                  type="button"
                  onClick={() => addEntry(category)}
                  disabled={entries.length >= CUSTOM_SUBTYPE_LIMITS.entriesPerCategory}
                  className="min-h-10 rounded-sm border border-[var(--border)] px-3 py-2 text-xs font-bold hover:bg-[var(--muted)] disabled:opacity-50"
                  aria-label={`Add ${categoryConfig.displayName} subtype`}
                >
                  Add subtype
                </button>
              </div>

              {entries.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--muted-foreground)]">No custom subtypes.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {entries.map((entry, index) => {
                    const errors = validation.byEntry.get(`${category}:${index}`) ?? {};
                    const labelPrefix = `${categoryConfig.displayName} subtype ${index + 1}`;
                    return (
                      <div
                        key={`${category}:${index}`}
                        className="grid gap-3 rounded-sm bg-[var(--background)] p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)_auto]"
                      >
                        {(
                          [
                            ["slug", "Slug", entry.slug, "e.g. edge-worker"],
                            ["displayName", "Display name", entry.displayName, "e.g. Edge worker"],
                            ["icon", "Lucide icon", entry.icon, "e.g. Box"],
                          ] as const
                        ).map(([key, label, value, placeholder]) => {
                          const errorId = `${category}-${index}-${key}-error`;
                          return (
                            <label key={key} className="min-w-0 text-xs font-semibold">
                              {label}
                              <input
                                value={value}
                                onChange={(event) =>
                                  updateEntry(category, index, key, event.target.value)
                                }
                                placeholder={placeholder}
                                aria-label={`${labelPrefix} ${key === "displayName" ? "display name" : key}`}
                                aria-invalid={Boolean(errors[key])}
                                aria-describedby={errors[key] ? errorId : undefined}
                                className="mt-1 min-h-10 w-full rounded-sm border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                              />
                              {errors[key] && (
                                <span
                                  id={errorId}
                                  className="mt-1 block text-xs text-[var(--danger)]"
                                >
                                  {errors[key]}
                                </span>
                              )}
                            </label>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => removeEntry(category, index)}
                          className="min-h-10 self-end rounded-sm border border-[var(--danger-border)] px-3 py-2 text-xs font-bold text-[var(--danger)] hover:bg-[var(--danger-surface)]"
                          aria-label={`Remove ${labelPrefix}`}
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </fieldset>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || !validation.valid || pending}
          className="min-h-11 rounded-sm bg-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)] disabled:opacity-50"
        >
          {saveState === "saving"
            ? "Saving subtype changes..."
            : saveState === "indeterminate"
              ? "Reload settings to continue"
              : "Save subtype changes"}
        </button>
        {dirty && !pending && (
          <span className="text-xs text-[var(--muted-foreground)]">Unsaved changes</span>
        )}
      </div>

      {feedback && (
        <p
          className={`mt-3 text-sm ${feedback.type === "error" ? "text-[var(--danger)]" : "text-[var(--success)]"}`}
          role={feedback.type === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      )}
    </section>
  );
}
