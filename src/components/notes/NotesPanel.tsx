"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, NotebookPen, X } from "lucide-react";

interface Note {
  id: string;
  content: string;
  nodeId: string | null;
  createdAt: number;
  updatedAt: number;
}

interface NotesPanelProps {
  projectId: string;
  /** Map of nodeId to node name for labeling node-anchored notes. */
  nodeNames?: Record<string, string>;
  /** When set, show only notes attached to this node. */
  activeNodeId?: string | null;
  onClearNodeFilter?: () => void;
  onNoteCountsChange?: (counts: Record<string, number>) => void;
  /** Incremented to open the panel from a node action. */
  openTrigger?: number;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function NotesPanel({
  projectId,
  nodeNames,
  activeNodeId,
  onClearNodeFilter,
  onNoteCountsChange,
  openTrigger,
}: NotesPanelProps) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (openTrigger) setOpen(true);
  }, [openTrigger]);

  useEffect(() => {
    if (!onNoteCountsChange) return;
    const counts: Record<string, number> = {};
    for (const note of notes) {
      if (note.nodeId) counts[note.nodeId] = (counts[note.nodeId] ?? 0) + 1;
    }
    onNoteCountsChange(counts);
  }, [notes, onNoteCountsChange]);

  useEffect(() => {
    if (open && activeNodeId) {
      const timer = window.setTimeout(() => inputRef.current?.focus(), 100);
      return () => window.clearTimeout(timer);
    }
  }, [open, activeNodeId]);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/notes`);
      if (!res.ok) {
        setError("Failed to load notes.");
        return;
      }
      const data = await res.json();
      setNotes(Array.isArray(data) ? data : []);
    } catch {
      setError("Failed to load notes.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void fetchNotes();
  }, [fetchNotes]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [notes, activeNodeId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newNote.trim() || submitting) return;

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newNote.trim(),
          nodeId: activeNodeId ?? undefined,
        }),
      });
      if (!res.ok) {
        setError("Failed to save note. Try again.");
        return;
      }
      const note = await res.json();
      setNotes((current) => [...current, note]);
      setNewNote("");
    } catch {
      setError("Failed to save note. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/notes/${noteId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("Failed to delete note. Try again.");
        return;
      }
      setNotes((current) => current.filter((note) => note.id !== noteId));
    } catch {
      setError("Failed to delete note. Try again.");
    }
  };

  const handleClose = () => {
    setOpen(false);
    onClearNodeFilter?.();
  };

  const displayNotes = activeNodeId ? notes.filter((note) => note.nodeId === activeNodeId) : notes;
  const activeNodeName = activeNodeId ? (nodeNames?.[activeNodeId] ?? "Deleted component") : null;

  return (
    <>
      <button
        type="button"
        onClick={() => (open ? handleClose() : setOpen(true))}
        className="absolute bottom-4 right-4 z-40 flex min-h-11 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm shadow-md hover:bg-[var(--muted)]"
        title="Toggle notes"
        aria-label="Notes"
      >
        <NotebookPen className="h-4 w-4" aria-hidden="true" />
        Notes
        {notes.length > 0 && (
          <span className="rounded-full bg-[var(--brand)] px-1.5 py-0.5 text-xs text-[var(--brand-foreground)]">
            {notes.length}
          </span>
        )}
      </button>

      {open && (
        <aside className="absolute bottom-16 right-4 z-40 flex h-96 max-h-[calc(100%-5rem)] w-80 max-w-[calc(100vw-2rem)] flex-col rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-xl">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              {activeNodeId && (
                <button
                  type="button"
                  onClick={() => onClearNodeFilter?.()}
                  className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  title="Back to all notes"
                  aria-label="Back to all notes"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <h3 className="truncate text-sm font-semibold">
                {activeNodeName ? `Notes on ${activeNodeName}` : "Notes"}
              </h3>
              {!activeNodeId && (
                <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
                  Private
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              aria-label="Close notes"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-2">
            {loading && notes.length === 0 && (
              <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">Loading...</p>
            )}
            {!loading && error && (
              <div className="py-8 text-center text-sm">
                <p className="text-[var(--danger)]" role="alert">
                  {error}
                </p>
                {error === "Failed to load notes." && (
                  <button
                    type="button"
                    onClick={() => void fetchNotes()}
                    className="mt-3 min-h-11 rounded-md border border-[var(--border)] px-3 py-2 font-medium hover:bg-[var(--muted)]"
                  >
                    Try again
                  </button>
                )}
              </div>
            )}
            {!loading && !error && displayNotes.length === 0 && (
              <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
                {activeNodeId ? "No notes on this component yet." : "No notes yet."}
              </p>
            )}
            {displayNotes.map((note) => {
              const nodeName = note.nodeId ? (nodeNames?.[note.nodeId] ?? null) : null;
              const isOrphaned = note.nodeId !== null && nodeName === null;

              return (
                <div
                  key={note.id}
                  className="group border-b border-[var(--border)] py-3 last:border-0"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10px] text-[var(--muted-foreground)]">
                      {formatTime(note.createdAt)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDelete(note.id)}
                      className="ml-auto text-[10px] text-[var(--muted-foreground)] hover:text-[var(--danger)] sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                      title="Delete note"
                    >
                      Delete
                    </button>
                  </div>
                  {!activeNodeId && note.nodeId && (
                    <span className="text-[10px] text-[var(--color-client)]">
                      {isOrphaned ? "on deleted component" : `on ${nodeName}`}
                    </span>
                  )}
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-5">{note.content}</p>
                </div>
              );
            })}
          </div>

          <form onSubmit={handleSubmit} className="border-t border-[var(--border)] px-4 py-3">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={newNote}
                onChange={(event) => setNewNote(event.target.value)}
                placeholder={activeNodeName ? `Note on ${activeNodeName}...` : "Add a note..."}
                className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                disabled={submitting}
              />
              <button
                type="submit"
                disabled={!newNote.trim() || submitting}
                className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)] disabled:opacity-50"
              >
                Save note
              </button>
            </div>
          </form>
        </aside>
      )}
    </>
  );
}
