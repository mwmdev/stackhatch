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
}: CommentsPanelProps) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

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
  }, [comments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newComment.trim() }),
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
    const res = await fetch(
      `/api/projects/${projectId}/comments/${commentId}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    }
  };

  if (!isTeamProject) return null;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
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
          <span className="rounded-full bg-[var(--color-client)] px-1.5 py-0.5 text-xs text-white">
            {comments.length}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute bottom-14 right-4 z-40 flex h-96 w-80 flex-col rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <h3 className="text-sm font-semibold">Comments</h3>
            <button
              onClick={() => setOpen(false)}
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
              <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
                Loading...
              </p>
            )}
            {!loading && comments.length === 0 && (
              <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
                No comments yet. Start the discussion!
              </p>
            )}
            {comments.map((comment) => (
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
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-client)] text-[10px] font-medium text-white">
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
                        className="ml-auto hidden text-[10px] text-[var(--muted-foreground)] hover:text-red-500 group-hover:inline"
                        title="Delete comment"
                      >
                        Delete
                      </button>
                    </div>
                    <p className="mt-0.5 text-sm leading-snug">
                      {comment.content}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="border-t border-[var(--border)] px-4 py-3"
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-client)]"
                disabled={submitting}
              />
              <button
                type="submit"
                disabled={!newComment.trim() || submitting}
                className="rounded bg-[var(--color-client)] px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
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
