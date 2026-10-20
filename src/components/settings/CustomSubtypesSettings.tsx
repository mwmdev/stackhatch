"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  CUSTOM_SUBTYPE_ICONS,
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
import SettingsRow from "@/components/settings/SettingsRow";

interface CustomSubtypesSettingsProps {
  initialCatalog: CustomSubtypesMap;
  saveCatalog: (catalog: CustomSubtypesMap) => Promise<CustomSubtypesMap>;
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
    errors.displayName = `Use 1–${CUSTOM_SUBTYPE_LIMITS.displayNameLength} trimmed characters on one line.`;
  }

  if (!isSupportedLucideIcon(entry.icon)) {
    errors.icon = "Choose a supported icon.";
  }
  return errors;
}

function slugFromName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, CUSTOM_SUBTYPE_LIMITS.slugLength)
    .replace(/-$/g, "");
}

export default function CustomSubtypesSettings({
  initialCatalog,
  saveCatalog,
}: CustomSubtypesSettingsProps) {
  const [confirmed, setConfirmed] = useState(() => cloneCatalog(initialCatalog));
  const [draft, setDraft] = useState(() => cloneCatalog(initialCatalog));
  const [manualSlugs, setManualSlugs] = useState<Set<string>>(
    () =>
      new Set(
        Object.entries(initialCatalog).flatMap(([category, entries]) =>
          (entries ?? []).map((_, index) => `${category}:${index}`)
        )
      )
  );
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [showErrors, setShowErrors] = useState(false);
  const customCount = useMemo(
    () => Object.values(draft).reduce((total, entries) => total + (entries?.length ?? 0), 0),
    [draft]
  );
  const [saveState, setSaveState] = useState<"idle" | "saving">("idle");
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
    const row = `${category}:${index}`;
    if (key === "slug") setManualSlugs((current) => new Set(current).add(row));
    setDraft((current) => {
      const entries = [...(current[category] ?? [])];
      const previous = entries[index];
      entries[index] = {
        ...previous,
        [key]: value,
        ...(key === "displayName" &&
        !manualSlugs.has(row) &&
        previous.slug === slugFromName(previous.displayName)
          ? { slug: slugFromName(value) }
          : {}),
      };
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
    const shift = (keys: Set<string>) =>
      new Set(
        [...keys].flatMap((key) => {
          const [keyCategory, position, field] = key.split(":");
          if (keyCategory !== category) return [key];
          const value = Number(position);
          if (value === index) return [];
          return [`${category}:${value > index ? value - 1 : value}${field ? `:${field}` : ""}`];
        })
      );
    setManualSlugs(shift);
    setTouched(shift);
  }

  async function save() {
    if (!dirty || pending) return;
    if (!validation.valid) {
      setShowErrors(true);
      return;
    }

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

    try {
      const saved = validateCustomSubtypes(await saveCatalog(validated));
      setConfirmed(cloneCatalog(saved));
      setDraft(cloneCatalog(saved));
      setManualSlugs(
        new Set(
          Object.entries(saved).flatMap(([category, entries]) =>
            (entries ?? []).map((_, index) => `${category}:${index}`)
          )
        )
      );
      setTouched(new Set());
      setShowErrors(false);
      setFeedback({ type: "success", message: "Subtype changes saved on this device" });
      setSaveState("idle");
    } catch (error) {
      setDraft(cloneCatalog(confirmed));
      setManualSlugs(
        new Set(
          Object.entries(confirmed).flatMap(([category, entries]) =>
            (entries ?? []).map((_, index) => `${category}:${index}`)
          )
        )
      );
      setTouched(new Set());
      setShowErrors(false);
      setFeedback({
        type: "error",
        message:
          error instanceof Error && error.message
            ? error.message
            : "Subtype changes could not be saved on this device",
      });
      setSaveState("idle");
    }
  }

  return (
    <SettingsRow id="node-subtypes" title="Node subtypes">
      {/* Collapsed by default: seven category fieldsets, usually all empty,
          otherwise dominate the page above the key that gates every AI action. */}
      <details className="group" open={customCount > 0}>
        <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-2 text-[14.5px] font-bold [&::-webkit-details-marker]:hidden">
          <ChevronRight
            className="size-4 transition-transform duration-120 ease-standard group-open:rotate-90"
            aria-hidden="true"
          />
          {customCount > 0
            ? `Edit your ${customCount} custom ${customCount === 1 ? "subtype" : "subtypes"}`
            : "Add a custom subtype"}
        </summary>

        <div className="mt-3">
          <p className="type-small m-0 mb-3 text-ink2">
            Personal labels for the components you map. Saved changes stay in this browser; existing
            nodes keep retired values until you replace them.
          </p>
          {categoryOrder.map((category) => {
            const categoryConfig = getCategoryConfig(category);
            const entries = draft[category] ?? [];
            return (
              <fieldset
                key={category}
                disabled={pending}
                className="m-0 min-w-0 border-0 border-t border-rule p-0 py-3"
              >
                <legend className="type-subhead-sm float-left py-2">
                  {categoryConfig.displayName}
                </legend>
                <button
                  type="button"
                  onClick={() => addEntry(category)}
                  disabled={entries.length >= CUSTOM_SUBTYPE_LIMITS.entriesPerCategory}
                  className="btn btn--sm float-right"
                  aria-label={`Add ${categoryConfig.displayName} subtype`}
                >
                  Add subtype
                </button>

                {entries.length === 0 ? null : (
                  <div className="clear-both grid gap-4 pt-2">
                    {entries.map((entry, index) => {
                      const errors = validation.byEntry.get(`${category}:${index}`) ?? {};
                      const labelPrefix = `${categoryConfig.displayName} subtype ${index + 1}`;
                      return (
                        <div
                          key={`${category}:${index}`}
                          className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)_auto]"
                        >
                          {(
                            [
                              ["slug", "Slug", entry.slug, "e.g. edge-worker"],
                              [
                                "displayName",
                                "Display name",
                                entry.displayName,
                                "e.g. Edge worker",
                              ],
                              ["icon", "Icon", entry.icon, ""],
                            ] as const
                          ).map(([key, label, value, placeholder]) => {
                            const errorId = `${category}-${index}-${key}-error`;
                            return (
                              <label key={key} className="field min-w-0">
                                <span className="field-label">{label}</span>
                                {key === "icon" ? (
                                  <select
                                    value={value}
                                    onChange={(event) =>
                                      updateEntry(category, index, key, event.target.value)
                                    }
                                    onBlur={() =>
                                      setTouched((current) =>
                                        new Set(current).add(`${category}:${index}:${key}`)
                                      )
                                    }
                                    aria-label={`${labelPrefix} icon`}
                                    aria-invalid={Boolean(
                                      errors[key] &&
                                      (showErrors || touched.has(`${category}:${index}:${key}`))
                                    )}
                                    className="field-select"
                                  >
                                    {!CUSTOM_SUBTYPE_ICONS.includes(
                                      value as (typeof CUSTOM_SUBTYPE_ICONS)[number]
                                    ) && <option value={value}>{value}</option>}
                                    {CUSTOM_SUBTYPE_ICONS.map((icon) => (
                                      <option key={icon} value={icon}>
                                        {icon}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    value={value}
                                    maxLength={
                                      key === "slug"
                                        ? CUSTOM_SUBTYPE_LIMITS.slugLength
                                        : CUSTOM_SUBTYPE_LIMITS.displayNameLength
                                    }
                                    onChange={(event) =>
                                      updateEntry(category, index, key, event.target.value)
                                    }
                                    onBlur={() =>
                                      setTouched((current) =>
                                        new Set(current).add(`${category}:${index}:${key}`)
                                      )
                                    }
                                    placeholder={placeholder}
                                    aria-label={`${labelPrefix} ${key === "displayName" ? "display name" : key}`}
                                    aria-invalid={Boolean(
                                      errors[key] &&
                                      (showErrors || touched.has(`${category}:${index}:${key}`))
                                    )}
                                    aria-describedby={
                                      errors[key] &&
                                      (showErrors || touched.has(`${category}:${index}:${key}`))
                                        ? errorId
                                        : undefined
                                    }
                                    className="field-input"
                                  />
                                )}
                                {errors[key] &&
                                  (showErrors || touched.has(`${category}:${index}:${key}`)) && (
                                    <span id={errorId} className="field-error m-0">
                                      {errors[key]}
                                    </span>
                                  )}
                              </label>
                            );
                          })}
                          <div className="field">
                            {/* Holds the label line so the button sits level with the inputs. */}
                            <span className="field-label max-md:hidden" aria-hidden="true">
                              &nbsp;
                            </span>
                            <button
                              type="button"
                              onClick={() => removeEntry(category, index)}
                              className="btn btn--danger justify-self-start"
                              aria-label={`Remove ${labelPrefix}`}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </fieldset>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-rule pt-4">
          <button type="button" onClick={save} disabled={!dirty || pending} className="btn">
            {saveState === "saving" ? "Saving subtype changes..." : "Save subtype changes"}
          </button>
          {dirty && !pending && <span className="type-small text-ink2">Unsaved changes</span>}
        </div>

        {feedback && (
          <p
            className={`type-small mt-2.5 mb-0 ${feedback.type === "error" ? "text-danger" : "text-success"}`}
            role={feedback.type === "error" ? "alert" : "status"}
          >
            {feedback.message}
          </p>
        )}
      </details>
    </SettingsRow>
  );
}
