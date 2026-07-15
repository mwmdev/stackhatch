"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  FileText,
  FolderPlus,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  LayoutTemplate,
  RefreshCw,
  Settings,
  Trash2,
  Users,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import UserAvatar from "@/components/UserAvatar";
import { consumeAuthenticationStarted, trackEvent } from "@/lib/analytics";

interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  createdAt: number;
  updatedAt: number;
}

const ACCEPTED_REQUIREMENT_FILES = [".md", ".txt"];

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isAcceptedRequirementsFile(file: File) {
  const name = file.name.toLowerCase();
  return ACCEPTED_REQUIREMENT_FILES.some((extension) => name.endsWith(extension));
}

function normalizeGitHubRepository(value: string) {
  const input = value.trim().replace(/\/$/, "");
  if (!input) return null;

  let path = input;
  if (/^https?:\/\//i.test(input)) {
    try {
      const parsed = new URL(input);
      if (parsed.hostname.toLowerCase() !== "github.com" || parsed.search || parsed.hash)
        return null;
      path = parsed.pathname.replace(/^\//, "");
    } catch {
      return null;
    }
  } else {
    path = path.replace(/^github\.com\//i, "");
  }

  path = path.replace(/\.git$/i, "");
  const parts = path.split("/");
  if (
    parts.length !== 2 ||
    !/^[A-Za-z0-9_-]+$/.test(parts[0]) ||
    !/^[A-Za-z0-9_.-]+$/.test(parts[1])
  ) {
    return null;
  }

  const slug = `${parts[0]}/${parts[1]}`;
  return { slug, url: `https://github.com/${slug}` };
}

export default function Dashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectsError, setProjectsError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [requestedRepo, setRequestedRepo] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [hasAnthropicKey, setHasAnthropicKey] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const routedToSetup = useRef(false);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setProjectsError("");
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) {
        setProjects([]);
        setProjectsError("Projects could not be loaded. Try again before creating a new one.");
        return;
      }
      setProjects(await res.json());
    } catch {
      setProjects([]);
      setProjectsError("Projects could not be loaded. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    const repo = new URLSearchParams(window.location.search).get("repo");
    const normalized = repo ? normalizeGitHubRepository(repo) : null;
    if (normalized) {
      setRequestedRepo(normalized.slug);
      setRepoUrl(normalized.slug);
    }

    if (consumeAuthenticationStarted()) {
      trackEvent("github_auth_completed", { location: "dashboard" });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      fetch("/api/me").then((res) => (res.ok ? res.json() : null)),
      fetch("/api/settings").then((res) => (res.ok ? res.json() : null)),
    ]).then(([userResult, settingsResult]) => {
      if (cancelled) return;
      if (userResult.status === "fulfilled") {
        setCurrentUserRole(userResult.value?.role ?? null);
      }
      if (settingsResult.status === "fulfilled" && settingsResult.value) {
        setHasAnthropicKey(Boolean(settingsResult.value.hasAnthropicKey));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!requestedRepo || hasAnthropicKey !== false || routedToSetup.current) return;
    routedToSetup.current = true;
    router.replace(`/settings?setup=anthropic&repo=${encodeURIComponent(requestedRepo)}`);
  }, [hasAnthropicKey, requestedRepo, router]);

  const requireAnthropicKey = useCallback(
    (repo?: string) => {
      if (hasAnthropicKey === false) {
        const suffix = repo ? `&repo=${encodeURIComponent(repo)}` : "";
        router.push(`/settings?setup=anthropic${suffix}`);
        return false;
      }
      return true;
    },
    [hasAnthropicKey, router]
  );

  async function createProject(opts?: { repoUrl?: string; description?: string }) {
    if ((opts?.repoUrl || opts?.description) && !requireAnthropicKey()) return;

    setCreating(true);
    setError("");
    try {
      let name = "Untitled Project";
      if (opts?.repoUrl) {
        const repository = normalizeGitHubRepository(opts.repoUrl);
        name = repository?.slug.split("/")[1] || "Imported Project";
      } else if (opts?.description) {
        const firstLine = opts.description.split("\n").find((line) => line.trim());
        if (firstLine) name = firstLine.replace(/^#\s*/, "").trim().slice(0, 80) || name;
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
        const data = await res.json().catch(() => ({}));
        if (data.code === "AI_NOT_CONFIGURED") {
          const repository = opts?.repoUrl ? normalizeGitHubRepository(opts.repoUrl) : null;
          const suffix = repository ? `&repo=${encodeURIComponent(repository.slug)}` : "";
          router.push(`/settings?setup=anthropic${suffix}`);
          return;
        }
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
    const repository = normalizeGitHubRepository(repoUrl);
    if (!repository) {
      setError("Enter a public GitHub repository as owner/repo or a full GitHub URL.");
      trackEvent("repository_intent_submitted", {
        location: "dashboard",
        error_category: "invalid_url",
      });
      return;
    }
    trackEvent("repository_intent_submitted", { location: "dashboard" });
    if (!requireAnthropicKey(repository.slug)) return;
    createProject({ repoUrl: repository.url });
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!requireAnthropicKey()) return;
    if (!isAcceptedRequirementsFile(file)) {
      setError("Upload a Markdown or text requirements file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "").trim();
      if (!text) {
        setError("The requirements file is empty.");
        return;
      }
      createProject({ description: text });
    };
    reader.onerror = () => setError("The requirements file could not be read.");
    reader.readAsText(file);
  }

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${deleteTarget.id}`, { method: "DELETE" });
      if (res.ok) {
        setProjects((prev) => prev.filter((project) => project.id !== deleteTarget.id));
      }
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget]);

  const isAdmin = currentUserRole === "admin";

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <nav className="nav-blur sticky top-0 z-40 border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link
            href="/app"
            className="font-display flex items-center gap-2 text-xl font-extrabold tracking-tight"
          >
            <LayoutDashboard className="h-5 w-5 text-[var(--color-client)]" />
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

      <main className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        {hasAnthropicKey === false && (
          <section
            className="flex flex-col gap-4 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-surface)] p-5 sm:flex-row sm:items-center sm:justify-between"
            data-testid="byok-setup-prompt"
          >
            <div className="flex items-start gap-3">
              <KeyRound className="mt-0.5 h-5 w-5 flex-none text-[var(--color-data)]" />
              <div>
                <h2 className="font-semibold">Connect Anthropic to use AI</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
                  Add your own Anthropic API key to analyze repositories, generate architectures,
                  and use chat. Your key is encrypted at rest and never returned to the browser.
                </p>
              </div>
            </div>
            <Link
              href={`/settings?setup=anthropic${requestedRepo ? `&repo=${encodeURIComponent(requestedRepo)}` : ""}`}
              className="inline-flex min-h-11 flex-none items-center justify-center rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)]"
            >
              Add API key
            </Link>
          </section>
        )}

        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm shadow-[var(--shadow-color)]">
          <h1 className="font-display mt-2 max-w-3xl text-3xl font-extrabold tracking-tight md:text-4xl">
            What do you want to map?
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
            Turn a public repository into a visual architecture you can explore, question, and keep
            in focus as the code changes.
          </p>
        </section>

        <section id="start" className="space-y-8">
          <form
            onSubmit={handleRepoSubmit}
            className="entry-card rounded-lg border border-[var(--border)] bg-[var(--card)] p-6"
          >
            <div className="flex items-start gap-3">
              <GitBranch className="mt-0.5 h-5 w-5 flex-none text-[var(--color-client)]" />
              <div>
                <h2 className="font-semibold">Map a GitHub repository</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
                  Enter a public repository. You will review it before StackHatch starts the scan.
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <label className="sr-only" htmlFor="repository-reference">
                GitHub repository
              </label>
              <input
                id="repository-reference"
                type="text"
                inputMode="url"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="owner/repo or https://github.com/owner/repo"
                disabled={creating}
                className="min-h-11 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={creating || !repoUrl.trim()}
                className="min-h-11 rounded-md bg-[var(--brand)] px-5 py-2 text-sm font-bold text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)] disabled:opacity-50"
              >
                {creating ? "Creating map..." : "Map repository"}
              </button>
            </div>
          </form>

          <div>
            <h2 className="font-display text-xl font-bold">Other ways to start</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="entry-card flex min-w-0 flex-col rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
                <FileText className="h-5 w-5 text-[var(--color-services)]" />
                <h3 className="mt-3 font-semibold">Upload requirements</h3>
                <p className="mt-1 flex-1 text-sm leading-6 text-[var(--muted-foreground)]">
                  Start from a Markdown or text PRD and refine the generated architecture.
                </p>
                <button
                  onClick={() =>
                    requireAnthropicKey() ? fileInputRef.current?.click() : undefined
                  }
                  disabled={creating}
                  className="mt-4 min-h-11 rounded-md border border-dashed border-[var(--border)] px-4 py-2 text-sm font-semibold hover:border-[var(--color-services)] hover:bg-[var(--muted)] disabled:opacity-50"
                >
                  Choose file...
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,.txt,text/markdown,text/plain"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <p className="mt-2 text-xs text-[var(--muted-foreground)]">.md or .txt</p>
              </div>
              <div className="entry-card flex min-w-0 flex-col rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
                <LayoutTemplate className="h-5 w-5 text-[var(--color-api)]" />
                <h3 className="mt-3 font-semibold">Use a template</h3>
                <p className="mt-1 flex-1 text-sm leading-6 text-[var(--muted-foreground)]">
                  Reuse one of your saved architecture maps as the starting point for a new project.
                </p>
                <Link
                  href="/project/new?templates=1"
                  className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--muted)]"
                >
                  Use a template
                </Link>
              </div>
              <div className="entry-card flex min-w-0 flex-col rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
                <FolderPlus className="h-5 w-5 text-[var(--color-client)]" />
                <h3 className="mt-3 font-semibold">Start fresh</h3>
                <p className="mt-1 flex-1 text-sm leading-6 text-[var(--muted-foreground)]">
                  Open a blank canvas and work manually. No API key is required.
                </p>
                <button
                  onClick={() => createProject()}
                  disabled={creating}
                  className="mt-4 min-h-11 rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--muted)] disabled:opacity-50"
                >
                  Start from scratch
                </button>
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div
            className="flex items-start gap-3 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-surface)] p-4 text-sm text-[var(--danger)]"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
            <span>{error}</span>
          </div>
        )}

        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)]">
          <div className="flex flex-col gap-3 border-b border-[var(--border)] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">Your maps</h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Continue from the latest architecture decision.
              </p>
            </div>
            {projectsError && (
              <button
                onClick={loadProjects}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-[var(--muted)]"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
            )}
          </div>
          {loading ? (
            <div className="p-8 text-center text-[var(--muted-foreground)]">
              Loading projects...
            </div>
          ) : projectsError ? (
            <div className="p-8 text-center text-sm text-[var(--muted-foreground)]">
              {projectsError}
            </div>
          ) : projects.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--muted-foreground)]">
              No projects yet. Use one of the start options above to create the first map.
            </div>
          ) : (
            <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="group relative min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-4 transition-shadow hover:shadow-md hover:shadow-[var(--shadow-color)]"
                >
                  <button
                    onClick={() => router.push(`/project/${project.id}`)}
                    className="block w-full min-w-0 text-left"
                    data-testid={`project-card-${project.id}`}
                  >
                    <div className="flex min-w-0 items-center gap-2 pr-10">
                      <h3 className="min-w-0 truncate font-medium text-[var(--card-foreground)]">
                        {project.name}
                      </h3>
                    </div>
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
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(project);
                    }}
                    className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--danger-surface)] hover:text-[var(--danger)]"
                    title="Delete project"
                    aria-label={`Delete ${project.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
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
            aria-labelledby="delete-project-title"
            className="mx-4 w-full max-w-sm rounded-xl bg-[var(--card)] p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="delete-project-title"
              className="text-lg font-semibold text-[var(--card-foreground)]"
            >
              Delete Project
            </h3>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This action
              cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="min-h-11 rounded-md px-3 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="min-h-11 rounded-md bg-[var(--danger)] px-3 py-2 text-sm text-[var(--danger-foreground)] hover:bg-[var(--danger-hover)] disabled:opacity-50"
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
