"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderPlus, RefreshCw } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import StackHatchWordmark from "@/components/shells/StackHatchWordmark";
import { buildLocalProjectPath } from "@/lib/app-route";
import type { VaultProjectRecord } from "@/lib/vault/schema";
import { getBrowserWorkspaceVault, type WorkspaceVault } from "@/lib/vault/workspace";

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AllMapsPage({ vault }: { vault?: WorkspaceVault }) {
  const router = useRouter();
  const [workspaceVault] = useState(() => vault ?? getBrowserWorkspaceVault());
  const [projects, setProjects] = useState<VaultProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectsError, setProjectsError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<VaultProjectRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const latestLoadRequest = useRef(0);

  const loadProjects = useCallback(async () => {
    const requestId = ++latestLoadRequest.current;
    setLoading(true);
    setProjectsError("");
    try {
      const nextProjects = await workspaceVault.listProjects();
      if (requestId === latestLoadRequest.current) setProjects(nextProjects);
    } catch {
      if (requestId === latestLoadRequest.current) {
        setProjects([]);
        setProjectsError(
          "Your maps on this device could not be read. Check browser storage permissions, then retry."
        );
      }
    } finally {
      if (requestId === latestLoadRequest.current) setLoading(false);
    }
  }, [workspaceVault]);

  useEffect(() => {
    void loadProjects();
    return workspaceVault.subscribeInvalidation((invalidation) => {
      if (invalidation.stores.includes("projects")) void loadProjects();
    });
  }, [loadProjects, workspaceVault]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await workspaceVault.deleteProject(deleteTarget);
      setProjects((current) => current.filter((project) => project.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      setDeleteError(
        "This map could not be deleted from browser storage. Reload the list and try again."
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--foreground)]">
      <header className="border-b border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto flex min-h-16 w-full max-w-[var(--shell-width-wide)] items-center justify-between gap-3 px-[var(--page-gutter)]">
          <StackHatchWordmark href="/app/maps" label="All Maps" />
          <div className="page-shell__actions">
            <Link
              href="/project/new"
              className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand-foreground)]"
            >
              <FolderPlus className="h-4 w-4" aria-hidden="true" />
              New Map
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[var(--shell-width-wide)] px-[var(--page-gutter)] py-8">
        <header className="mb-6 border-l-2 border-[var(--color-client)] pl-4">
          <p className="font-utility text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-[var(--color-client)]">
            Browser vault
          </p>
          <h1 className="font-display mt-1 text-3xl font-extrabold">All Maps</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
            Your maps on this device stay in this browser profile. Clearing browser data can remove
            them.
          </p>
        </header>

        <section className="overflow-hidden rounded-[var(--radius-surface)] border border-[var(--border)] bg-[var(--card)]">
          {projectsError ? (
            <div className="flex justify-end border-b border-[var(--border)] p-4">
              <button
                type="button"
                onClick={() => void loadProjects()}
                className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border)] px-3 py-2 text-sm font-semibold"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Retry browser storage
              </button>
            </div>
          ) : null}

          {loading ? (
            <div className="p-8 text-center text-[var(--muted-foreground)]" role="status">
              Loading your maps on this device...
            </div>
          ) : projectsError ? (
            <div className="p-8 text-center text-sm text-[var(--danger)]" role="alert">
              {projectsError}
            </div>
          ) : projects.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-[var(--muted-foreground)]">
                No maps are stored on this device yet.
              </p>
              <Link
                href="/project/new"
                className="mt-4 inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--border)] px-4 py-2 text-sm font-bold"
              >
                Create your first map
              </Link>
            </div>
          ) : (
            <div role="table" aria-label="Your maps on this device">
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
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-4 border-b border-[var(--border)] bg-[var(--surface-raised)] px-4 py-4 last:border-b-0 hover:bg-[var(--muted)] md:grid-cols-[minmax(11rem,1.1fr)_minmax(14rem,1.35fr)_9rem_5.5rem] md:items-center md:px-5"
                >
                  <div role="cell" className="col-span-2 min-w-0 md:col-span-1">
                    <button
                      type="button"
                      onClick={() => router.push(buildLocalProjectPath(project.id))}
                      className="flex min-h-11 max-w-full items-center gap-3 rounded-sm text-left font-semibold"
                      data-testid={`project-card-${project.id}`}
                      aria-label={`Open ${project.name}`}
                    >
                      <span
                        className="font-utility flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-[var(--color-client)] bg-[var(--background)] text-xs font-bold text-[var(--color-client)]"
                        aria-hidden="true"
                      >
                        MAP
                      </span>
                      <span className="truncate">{project.name}</span>
                    </button>
                  </div>
                  <div role="cell" className="col-span-2 min-w-0 md:col-span-1 md:pr-5">
                    <p className="line-clamp-2 text-sm text-[var(--muted-foreground)]">
                      {project.description || "No description"}
                    </p>
                  </div>
                  <div role="cell" className="font-utility text-xs text-[var(--muted-foreground)]">
                    {formatDate(project.updatedAt)}
                  </div>
                  <div role="cell" className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError("");
                        setDeleteTarget(project);
                      }}
                      className="min-h-11 rounded-sm px-3 text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--danger)]"
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
      </main>

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)]"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-map-title"
            className="mx-4 w-full max-w-sm rounded-[var(--radius-surface)] border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="delete-map-title" className="text-lg font-semibold">
              Delete map
            </h2>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              Delete <strong>{deleteTarget.name}</strong> from this device? This cannot be undone.
            </p>
            {deleteError ? (
              <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
                {deleteError}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="min-h-11 rounded-md px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="min-h-11 rounded-md bg-[var(--danger)] px-3 py-2 text-sm text-[var(--danger-foreground)]"
              >
                {deleting ? "Deleting..." : deleteError ? "Retry delete" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
