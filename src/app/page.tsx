"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";

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

export default function Dashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => setProjects(data))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  async function createProject(opts?: { repoUrl?: string; description?: string }) {
    setCreating(true);
    setError("");
    try {
      let name = "Untitled Project";
      if (opts?.repoUrl) {
        const match = opts.repoUrl.match(/github\.com\/[^/]+\/([^/]+)/);
        name = match ? match[1].replace(/\.git$/, "") : "Imported Project";
      } else if (opts?.description) {
        const firstLine = opts.description.split("\n").find((l) => l.trim());
        if (firstLine) {
          name = firstLine.replace(/^#\s*/, "").trim().slice(0, 80) || name;
        }
      }
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          repoUrl: opts?.repoUrl || undefined,
          description: opts?.description || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create project");
        return;
      }
      const project = await res.json();
      router.push(`/project/${project.id}`);
    } catch {
      setError("Failed to create project");
    } finally {
      setCreating(false);
    }
  }

  function handleRepoSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = repoUrl.trim();
    if (!url) return;
    createProject({ repoUrl: url });
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      createProject({ description: text });
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      }
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {/* Header */}
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-lg font-bold tracking-tight">StackHatch</span>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Link
              href="/settings"
              className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              title="Settings"
              aria-label="Settings"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-[var(--border)]">
          <div className="hero-grid absolute inset-0" aria-hidden="true" />
          <div className="hero-glow absolute inset-0" aria-hidden="true" />

          <div className="relative mx-auto max-w-5xl px-6 pb-16 pt-20">
            {/* Headline */}
            <div className="mx-auto max-w-2xl text-center">
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                Design your architecture
                <span className="text-[var(--color-client)]"> with AI</span>
              </h1>
              <p className="mt-4 text-lg leading-relaxed text-[var(--muted-foreground)]">
                From idea to visual architecture in seconds. Paste a repo,
                upload requirements, or start a conversation.
              </p>
              <p className="mt-2 text-sm text-[var(--muted-foreground)] opacity-60">
                Powered by Claude · Bring your own API key
              </p>
            </div>

            {/* Three entry cards */}
            <div className="mx-auto mt-14 grid max-w-4xl grid-cols-1 gap-5 md:grid-cols-3">
              {/* Analyze Repo */}
              <div className="entry-card animate-fade-in-up flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
                <div
                  className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg text-[var(--color-client)]"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--color-client) 12%, transparent)' }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                  </svg>
                </div>
                <h3 className="font-semibold text-[var(--card-foreground)]">
                  Analyze a Repository
                </h3>
                <p className="mt-1 flex-1 text-sm text-[var(--muted-foreground)]">
                  Reverse-engineer architecture from a public GitHub repo
                </p>
                <form onSubmit={handleRepoSubmit} className="mt-4 space-y-2">
                  <input
                    type="url"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/owner/repo"
                    disabled={creating}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-client)] disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={creating || !repoUrl.trim()}
                    className="w-full rounded-lg bg-[var(--color-client)] py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {creating ? "Creating..." : "Analyze"}
                  </button>
                </form>
              </div>

              {/* Upload PRD */}
              <div
                className="entry-card animate-fade-in-up flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-6"
                style={{ animationDelay: "80ms" }}
              >
                <div
                  className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg text-[var(--color-services)]"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--color-services) 12%, transparent)' }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </div>
                <h3 className="font-semibold text-[var(--card-foreground)]">
                  Upload a PRD
                </h3>
                <p className="mt-1 flex-1 text-sm text-[var(--muted-foreground)]">
                  Generate architecture from your requirements document
                </p>
                <div className="mt-4">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={creating}
                    className="w-full rounded-lg border border-dashed border-[var(--border)] py-2 text-sm font-medium text-[var(--foreground)] hover:border-[var(--color-services)] hover:bg-[var(--muted)] disabled:opacity-50"
                  >
                    Choose file...
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".md,.txt,.pdf,.doc,.docx"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <p className="mt-1.5 text-center text-xs text-[var(--muted-foreground)]">
                    .md, .txt, .pdf, .docx
                  </p>
                </div>
              </div>

              {/* Start from Scratch */}
              <div
                className="entry-card animate-fade-in-up flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-6"
                style={{ animationDelay: "160ms" }}
              >
                <div
                  className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg text-[var(--color-api)]"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--color-api) 12%, transparent)' }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="12" y1="8" x2="12" y2="16" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                </div>
                <h3 className="font-semibold text-[var(--card-foreground)]">
                  Start Fresh
                </h3>
                <p className="mt-1 flex-1 text-sm text-[var(--muted-foreground)]">
                  Begin with a blank canvas and let AI guide your design
                </p>
                <div className="mt-4">
                  <button
                    onClick={() => createProject()}
                    disabled={creating}
                    className="w-full rounded-lg border border-[var(--border)] py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
                  >
                    Start from scratch
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <p className="mt-4 text-center text-sm text-red-500">{error}</p>
            )}
          </div>
        </section>

        {/* Recent projects */}
        {loading ? (
          <section className="mx-auto max-w-5xl px-6 py-10">
            <div className="py-8 text-center text-[var(--muted-foreground)]">
              Loading projects...
            </div>
          </section>
        ) : projects.length > 0 && (
          <section className="mx-auto max-w-5xl px-6 py-10">
            <h2 className="mb-5 text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
              Recent projects
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="group relative rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition-all duration-200 hover:shadow-md"
                >
                  <button
                    onClick={() => router.push(`/project/${project.id}`)}
                    className="block w-full text-left"
                    data-testid={`project-card-${project.id}`}
                  >
                    <h3 className="font-medium text-[var(--card-foreground)]">
                      {project.name}
                    </h3>
                    {project.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-[var(--muted-foreground)]">
                        {project.description}
                      </p>
                    )}
                    <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                      Updated {formatDate(project.updatedAt)}
                    </p>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(project);
                    }}
                    className="absolute right-3 top-3 hidden h-7 w-7 items-center justify-center rounded text-[var(--muted-foreground)] hover:bg-red-100 hover:text-red-600 group-hover:flex dark:hover:bg-red-900/30"
                    title="Delete project"
                    aria-label={`Delete ${project.name}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => !deleting && setDeleteTarget(null)}
          data-testid="delete-modal"
        >
          <div
            className="mx-4 w-full max-w-sm rounded-xl bg-[var(--card)] p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[var(--card-foreground)]">
              Delete Project
            </h3>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              Are you sure you want to delete{" "}
              <strong>{deleteTarget.name}</strong>? This action cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="rounded-md px-3 py-1.5 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                data-testid="confirm-delete"
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
