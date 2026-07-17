"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderPlus, RefreshCw, Settings, Users } from "lucide-react";
import AppPageShell from "@/components/shells/AppPageShell";
import IconControl from "@/components/ui/IconControl";
import ThemeToggle from "@/components/ThemeToggle";
import UserAvatar from "@/components/UserAvatar";

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

export default function AllMapsPage({ isAdmin }: { isAdmin: boolean }) {
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
      homeHref="/app"
      homeLabel="Resume map"
      title="All Maps"
      description="Browse, open, and manage your architecture maps."
      actions={
        <>
          <Link
            href="/project/new"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)]"
          >
            <FolderPlus className="h-4 w-4" aria-hidden="true" />
            New map
          </Link>
          <div className="flex items-center gap-1" role="group" aria-label="Account controls">
            <ThemeToggle />
            {isAdmin && (
              <IconControl href="/admin" label="Admin" tooltipPlacement="bottom">
                <Users />
              </IconControl>
            )}
            <IconControl href="/settings" label="Settings" tooltipPlacement="bottom">
              <Settings />
            </IconControl>
            <UserAvatar />
          </div>
        </>
      }
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
        <section
          className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--card)]"
          aria-label="Your maps"
        >
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
              No maps yet. Choose New map to create your first one.
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="group relative min-w-0 bg-[var(--surface-raised)] px-5 py-4 transition-colors hover:bg-[var(--muted)] sm:px-6"
                >
                  <button
                    type="button"
                    onClick={() => router.push(`/project/${project.id}`)}
                    className="block min-h-20 w-full min-w-0 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--surface-raised)]"
                    data-testid={`project-card-${project.id}`}
                  >
                    <h2 className="min-w-0 truncate pr-16 font-semibold text-[var(--card-foreground)]">
                      {project.name}
                    </h2>
                    {project.description && (
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--muted-foreground)]">
                        {project.description}
                      </p>
                    )}
                    <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                      Updated {formatDate(project.updatedAt)}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(project)}
                    className="absolute right-3 top-3 inline-flex min-h-11 items-center rounded-md px-3 text-xs font-semibold text-[var(--muted-foreground)] hover:bg-[var(--danger-surface)] hover:text-[var(--danger)] focus-visible:text-[var(--danger)]"
                    aria-label={`Delete ${project.name}`}
                  >
                    Delete
                  </button>
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
            className="mx-4 w-full max-w-sm rounded-xl bg-[var(--card)] p-6 shadow-xl"
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
