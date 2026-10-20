"use client";

import { useEffect, useRef, useState } from "react";
import { CANVAS_TEXT_LIMITS } from "@/lib/canvas-limits";

export interface ProjectNameFieldProps {
  name: string;
  onRename: (name: string) => void;
  disabled?: boolean;
}

/**
 * The map title, editable in place. A map created blank is called "Untitled
 * Project" forever otherwise — there was no rename anywhere in the app.
 */
export default function ProjectNameField({ name, onRename, disabled }: ProjectNameFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setDraft(name);
  }, [name]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    const trimmed = draft.trim();
    // An empty title would leave nothing to click back into.
    if (trimmed && trimmed !== name) onRename(trimmed);
    else setDraft(name);
    setEditing(false);
    buttonRef.current?.focus();
  }

  function cancel() {
    setDraft(name);
    setEditing(false);
    buttonRef.current?.focus();
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        maxLength={CANVAS_TEXT_LIMITS.projectName}
        aria-label="Map name"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
        }}
        className="project-editor__name-input type-map-name"
      />
    );
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      disabled={disabled}
      onClick={() => setEditing(true)}
      title={disabled ? name : `${name} — rename`}
      className="project-editor__name type-map-name"
    >
      <span className="sr-only">Map name, select to rename: </span>
      {name}
    </button>
  );
}
