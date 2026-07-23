"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import AppPageActions from "@/components/shells/AppPageActions";
import AppPageShell from "@/components/shells/AppPageShell";

interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  createdAt: number;
  updatedAt: number;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AllMapsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectsError, setProjectsError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const latestLoadRequest = useRef(0);

  const loadProjects = useCallback(async () => {
    const requestId = latestLoadRequest.current + 1;
    latestLoadRequest.current = requestId;
    setLoading(true);
    setProjectsError("");
    try {
      const response = await fetch("/api/projects");
      if (requestId !== latestLoadRequest.current) return;
      if (!response.ok) {
        setProjects([]);
        setProjectsError("Maps could not be loaded. Try again.");
        return;
      }
      const nextProjects = await response.json();
      if (requestId === latestLoadRequest.current) setProjects(nextProjects);
    } catch {
      if (requestId !== latestLoadRequest.current) return;
      setProjects([]);
      setProjectsError("Maps could not be loaded. Check your connection and try again.");
    } finally {
      if (requestId === latestLoadRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/projects/${deleteTarget.id}`, { method: "DELETE" });
      if (response.ok) {
        setProjects((current) => current.filter((project) => project.id !== deleteTarget.id));
      }
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget]);

  return (
    <AppPageShell
      title="All Maps"
      description="Browse, open, and manage your architecture maps."
      eyebrow="Map observatory"
      actions={<AppPageActions />}
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-display font-bold text-[var(--foreground)]">StackHatch</span>
          <nav aria-label="Footer navigation" className="flex flex-wrap gap-1">
            <Link
              href="/support"
              className="inline-flex min-h-11 items-center rounded-md px-3 hover:text-[var(--foreground)]"
            >
              Support
            </Link>
            <Link
              href="/privacy"
              className="inline-flex min-h-11 items-center rounded-md px-3 hover:text-[var(--foreground)]"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="inline-flex min-h-11 items-center rounded-md px-3 hover:text-[var(--foreground)]"
            >
              Terms
            </Link>
          </nav>
        </div>
      }
    >
      <div className="min-w-0">
        <section className="overflow-hidden rounded-sm border border-[var(--border)] bg-[var(--card)]">
          {projectsError && (
            <div className="flex justify-end border-b border-[var(--border)] p-4">
              <button
                type="button"
                onClick={loadProjects}
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-[var(--muted)]"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Retry
              </button>
            </div>
          )}

          {loading ? (
            <div className="p-8 text-center text-[var(--muted-foreground)]" role="status">
              Loading maps...
            </div>
          ) : projectsError ? (
            <div className="p-8 text-center text-sm text-[var(--muted-foreground)]" role="alert">
              {projectsError}
            </div>
          ) : projects.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--muted-foreground)]">
              No maps yet. Choose New Map to create your first one.
            </div>
          ) : (
            <div role="table" aria-label="Your maps" className="min-w-0">
              <div
                role="row"
                className="font-utility hidden grid-cols-[minmax(11rem,1.1fr)_minmax(14rem,1.35fr)_9rem_5.5rem] border-b border-[var(--border)] bg-[var(--surface-subtle)] px-5 py-3 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)] md:grid"
              >
                <span role="columnheader">Name</span>
                <span role="columnheader">Description</span>
                <span role="columnheader">Updated</span>
                <span role="columnheader" className="text-right">
                  Actions
                </span>
              </div>
              {projects.map((project) => (
                <div
                  key={project.id}
                  role="row"
                  className="group grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-4 border-b border-[var(--border)] bg-[var(--surface-raised)] px-4 py-4 transition-colors last:border-b-0 hover:bg-[var(--muted)] md:grid-cols-[minmax(11rem,1.1fr)_minmax(14rem,1.35fr)_9rem_5.5rem] md:items-center md:px-5"
                >
                  <div role="cell" className="col-span-2 min-w-0 md:col-span-1">
                    <button
                      type="button"
                      onClick={() => router.push(`/project/${project.id}`)}
                      className="group/open flex min-h-11 max-w-full items-center gap-3 rounded-sm text-left font-semibold text-[var(--card-foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-raised)]"
                      data-testid={`project-card-${project.id}`}
                      aria-label={`Open ${project.name}`}
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-[var(--color-client)] bg-[var(--background)] font-utility text-xs font-bold text-[var(--color-client)] transition-colors group-hover/open:bg-[var(--muted)]"
                        aria-hidden="true"
                      >
                        MAP
                      </span>
                      <span className="min-w-0 truncate">{project.name}</span>
                    </button>
                  </div>
                  <div role="cell" className="col-span-2 min-w-0 md:col-span-1 md:pr-5">
                    <span className="font-utility mb-1 block text-[0.625rem] font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)] md:hidden">
                      Description
                    </span>
                    <p className="line-clamp-2 text-sm leading-5 text-[var(--muted-foreground)]">
                      {project.description || "No description"}
                    </p>
                  </div>
                  <div role="cell" className="min-w-0">
                    <span className="font-utility mb-1 block text-[0.625rem] font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)] md:hidden">
                      Updated
                    </span>
                    <p className="font-utility text-xs text-[var(--muted-foreground)]">
                      {formatDate(project.updatedAt)}
                    </p>
                  </div>
                  <div role="cell" className="flex justify-end self-end md:self-center">
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(project)}
                      className="inline-flex min-h-11 items-center rounded-sm px-3 text-xs font-semibold text-[var(--muted-foreground)] hover:bg-[var(--danger-surface)] hover:text-[var(--danger)] focus-visible:text-[var(--danger)]"
                      aria-label={`Delete ${project.name}`}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)]"
          onClick={() => !deleting && setDeleteTarget(null)}
          data-testid="delete-modal"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-map-title"
            className="mx-4 w-full max-w-sm rounded-sm border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2
              id="delete-map-title"
              className="text-lg font-semibold text-[var(--card-foreground)]"
            >
              Delete map
            </h2>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              Delete <strong>{deleteTarget.name}</strong>? This action cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="min-h-11 rounded-md px-3 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="min-h-11 rounded-md bg-[var(--danger)] px-3 py-2 text-sm text-[var(--danger-foreground)] hover:bg-[var(--danger-hover)] disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppPageShell>
  );
}
