"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

interface Comment {
  id: string;
  content: string;
  nodeId: string | null;
  createdAt: number;
  updatedAt: number;
  userId: string;
  authorName: string | null;
  authorAvatarUrl: string | null;
}

interface CommentsPanelProps {
  projectId: string;
  isTeamProject: boolean;
  /** Map of nodeId → node name for labeling node-anchored comments */
  nodeNames?: Record<string, string>;
  /** When set, filter comments to this node */
  activeNodeId?: string | null;
  /** Called when the node filter should be cleared */
  onClearNodeFilter?: () => void;
  /** Called when comment counts per node change */
  onCommentCountsChange?: (counts: Record<string, number>) => void;
  /** Incremented to force panel open */
  openTrigger?: number;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

export default function CommentsPanel({
  projectId,
  isTeamProject,
  nodeNames,
  activeNodeId,
  onClearNodeFilter,
  onCommentCountsChange,
  openTrigger,
}: CommentsPanelProps) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Open panel when trigger changes
  useEffect(() => {
    if (openTrigger) setOpen(true);
  }, [openTrigger]);

  // Compute and report comment counts per node
  useEffect(() => {
    if (!onCommentCountsChange) return;
    const counts: Record<string, number> = {};
    for (const c of comments) {
      if (c.nodeId) {
        counts[c.nodeId] = (counts[c.nodeId] ?? 0) + 1;
      }
    }
    onCommentCountsChange(counts);
  }, [comments, onCommentCountsChange]);

  // Focus input when panel opens with a node filter
  useEffect(() => {
    if (open && activeNodeId && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, activeNodeId]);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open && isTeamProject) {
      fetchComments();
    }
  }, [open, isTeamProject, fetchComments]);

  // Scroll to bottom when new comments arrive
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [comments, activeNodeId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newComment.trim(),
          nodeId: activeNodeId ?? undefined,
        }),
      });
      if (res.ok) {
        const comment = await res.json();
        setComments((prev) => [...prev, comment]);
        setNewComment("");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    const res = await fetch(`/api/projects/${projectId}/comments/${commentId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    }
  };

  const handleClose = () => {
    setOpen(false);
    onClearNodeFilter?.();
  };

  if (!isTeamProject) return null;

  // Filter comments when viewing a specific node
  const displayComments = activeNodeId
    ? comments.filter((c) => c.nodeId === activeNodeId)
    : comments;

  const activeNodeName = activeNodeId ? (nodeNames?.[activeNodeId] ?? "Deleted node") : null;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => {
          if (open) {
            handleClose();
          } else {
            setOpen(true);
          }
        }}
        className="absolute bottom-4 right-4 z-40 flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm shadow-md hover:bg-[var(--muted)]"
        title="Toggle comments"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Comments
        {comments.length > 0 && (
          <span className="rounded-full bg-[var(--brand)] px-1.5 py-0.5 text-xs text-[var(--brand-foreground)]">
            {comments.length}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute bottom-14 right-4 z-40 flex h-96 w-80 flex-col rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <div className="flex items-center gap-2">
              {activeNodeId && (
                <button
                  onClick={() => onClearNodeFilter?.()}
                  className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  title="Back to all comments"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
              )}
              <h3 className="text-sm font-semibold">
                {activeNodeName ? `Comments on ${activeNodeName}` : "Comments"}
              </h3>
            </div>
            <button
              onClick={handleClose}
              className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Comments list */}
          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-2">
            {loading && comments.length === 0 && (
              <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">Loading...</p>
            )}
            {!loading && displayComments.length === 0 && (
              <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
                {activeNodeId
                  ? "No comments on this node yet."
                  : "No comments yet. Start the discussion!"}
              </p>
            )}
            {displayComments.map((comment) => {
              const nodeName = comment.nodeId ? (nodeNames?.[comment.nodeId] ?? null) : null;
              const isOrphaned = comment.nodeId !== null && nodeName === null;

              return (
                <div key={comment.id} className="group mb-3">
                  <div className="flex items-start gap-2">
                    {comment.authorAvatarUrl ? (
                      <Image
                        src={comment.authorAvatarUrl}
                        alt={comment.authorName ?? "User"}
                        width={24}
                        height={24}
                        className="rounded-full"
                      />
                    ) : (
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-[10px] font-medium text-[var(--brand-foreground)]">
                        {(comment.authorName ?? "U")[0].toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-medium">
                          {comment.authorName ?? "Unknown"}
                        </span>
                        <span className="text-[10px] text-[var(--muted-foreground)]">
                          {formatTime(comment.createdAt)}
                        </span>
                        <button
                          onClick={() => handleDelete(comment.id)}
                          className="ml-auto hidden text-[10px] text-[var(--muted-foreground)] hover:text-[var(--danger)] group-hover:inline"
                          title="Delete comment"
                        >
                          Delete
                        </button>
                      </div>
                      {/* Node label (shown in general view, not when filtered to a node) */}
                      {!activeNodeId && comment.nodeId && (
                        <span className="text-[10px] text-[var(--color-client)]">
                          {isOrphaned ? "on deleted node" : `on ${nodeName}`}
                        </span>
                      )}
                      <p className="mt-0.5 text-sm leading-snug">{comment.content}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="border-t border-[var(--border)] px-4 py-3">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder={activeNodeId ? `Comment on ${activeNodeName}...` : "Add a comment..."}
                className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                disabled={submitting}
              />
              <button
                type="submit"
                disabled={!newComment.trim() || submitting}
                className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)] disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
