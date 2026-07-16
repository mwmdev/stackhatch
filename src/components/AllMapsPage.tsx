"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderPlus, Map, RefreshCw, Settings, Trash2, Users } from "lucide-react";
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
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <nav className="nav-blur sticky top-0 z-40 border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link
            href="/app"
            className="font-display flex items-center gap-2 text-xl font-extrabold tracking-tight"
            title="Resume map"
          >
            <Map className="h-5 w-5 text-[var(--color-client)]" aria-hidden="true" />
            StackHatch
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            {isAdmin && (
              <Link
                href="/admin"
                className="flex h-11 w-11 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                title="Admin"
                aria-label="Admin"
              >
                <Users className="h-[18px] w-[18px]" />
              </Link>
            )}
            <Link
              href="/settings"
              className="flex h-11 w-11 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              title="Settings"
              aria-label="Settings"
            >
              <Settings className="h-[18px] w-[18px]" />
            </Link>
            <UserAvatar />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">
              All Maps
            </h1>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
              Browse, open, and manage your architecture maps.
            </p>
          </div>
          <Link
            href="/project/new"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)]"
          >
            <FolderPlus className="h-4 w-4" aria-hidden="true" />
            New map
          </Link>
        </header>

        <section
          className="rounded-lg border border-[var(--border)] bg-[var(--card)]"
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
            <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="group relative min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-4 transition-shadow hover:shadow-md hover:shadow-[var(--shadow-color)]"
                >
                  <button
                    type="button"
                    onClick={() => router.push(`/project/${project.id}`)}
                    className="block w-full min-w-0 text-left"
                    data-testid={`project-card-${project.id}`}
                  >
                    <h2 className="min-w-0 truncate pr-10 font-medium text-[var(--card-foreground)]">
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
                    className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--danger-surface)] hover:text-[var(--danger)]"
                    title="Delete map"
                    aria-label={`Delete ${project.name}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-[var(--border)] py-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 text-sm text-[var(--muted-foreground)] sm:flex-row sm:items-center sm:justify-between">
          <span className="font-display font-bold">StackHatch</span>
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
      </footer>

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
    </div>
  );
}
