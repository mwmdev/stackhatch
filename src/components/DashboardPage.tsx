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
import { parseGitHubRepoReference } from "@/lib/github-analyzer";
import {
  consumeBlankAutoCreateIntent,
  getPendingProjectStart,
  markProjectStart,
  type ProjectStartMethod,
} from "@/lib/project-start";

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

function anthropicSetupHref(repository?: string) {
  const returnTo = repository ? `/app?repo=${encodeURIComponent(repository)}#start` : "/app#start";
  return `/settings?setup=anthropic&returnTo=${encodeURIComponent(returnTo)}`;
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
  const [blankAutoCreateFailed, setBlankAutoCreateFailed] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [hasAnthropicKey, setHasAnthropicKey] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const routedToSetup = useRef(false);
  const blankAutoCreateAttempted = useRef(false);

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
    const normalized = repo ? parseGitHubRepoReference(repo) : null;
    if (normalized) {
      setRequestedRepo(normalized.slug);
      setRepoUrl(normalized.slug);
    }

    if (consumeAuthenticationStarted()) {
      const startMethod = getPendingProjectStart();
      trackEvent("github_auth_completed", {
        location: "dashboard",
        ...(startMethod ? { start_method: startMethod } : {}),
      });
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
    router.replace(anthropicSetupHref(requestedRepo));
  }, [hasAnthropicKey, requestedRepo, router]);

  const requireAnthropicKey = useCallback(
    (repo?: string) => {
      if (hasAnthropicKey === false) {
        router.push(anthropicSetupHref(repo));
        return false;
      }
      return true;
    },
    [hasAnthropicKey, router]
  );

  const createProject = useCallback(
    async (
      opts?: { repoUrl?: string; description?: string },
      context?: { blankAutoCreate?: boolean }
    ) => {
      if ((opts?.repoUrl || opts?.description) && !requireAnthropicKey()) return false;

      setCreating(true);
      setError("");
      setBlankAutoCreateFailed(false);
      try {
        let name = "Untitled Project";
        if (opts?.repoUrl) {
          const repository = parseGitHubRepoReference(opts.repoUrl);
          name = repository?.repo || "Imported Project";
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
            const repository = opts?.repoUrl ? parseGitHubRepoReference(opts.repoUrl) : null;
            router.push(anthropicSetupHref(repository?.slug));
            return false;
          }
          setError(data.error || "Failed to create project");
          setBlankAutoCreateFailed(Boolean(context?.blankAutoCreate));
          return false;
        }
        const project = await res.json();
        router.push(`/project/${project.id}`);
        return true;
      } catch {
        setError("Failed to create project");
        setBlankAutoCreateFailed(Boolean(context?.blankAutoCreate));
        return false;
      } finally {
        setCreating(false);
      }
    },
    [requireAnthropicKey, router]
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("start") !== "blank" || blankAutoCreateAttempted.current) return;

    blankAutoCreateAttempted.current = true;
    const shouldCreate = consumeBlankAutoCreateIntent();
    router.replace("/app#start");
    if (shouldCreate) void createProject(undefined, { blankAutoCreate: true });
  }, [createProject, router]);

  function recordStartSelection(startMethod: ProjectStartMethod) {
    markProjectStart(startMethod);
    trackEvent("project_start_selected", {
      location: "dashboard",
      start_method: startMethod,
    });
  }

  function handleRepoSubmit(e: React.FormEvent) {
    e.preventDefault();
    const repository = parseGitHubRepoReference(repoUrl);
    if (!repository) {
      setError("Enter a public GitHub repository as owner/repo or a full GitHub URL.");
      trackEvent("repository_intent_submitted", {
        location: "dashboard",
        error_category: "invalid_url",
      });
      return;
    }
    recordStartSelection("repository");
    trackEvent("repository_intent_submitted", { location: "dashboard" });
    if (!requireAnthropicKey(repository.slug)) return;
    createProject({ repoUrl: repository.normalizedUrl });
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
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

  function handleRequirementsStart() {
    recordStartSelection("requirements");
    if (requireAnthropicKey()) fileInputRef.current?.click();
  }

  function handleBlankStart() {
    recordStartSelection("blank");
    consumeBlankAutoCreateIntent();
    void createProject();
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
              href={anthropicSetupHref(requestedRepo || undefined)}
              className="inline-flex min-h-11 flex-none items-center justify-center rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)]"
            >
              Add API key
            </Link>
          </section>
        )}

        <section id="start" aria-labelledby="start-title">
          <div className="mb-6">
            <h1
              id="start-title"
              className="font-display max-w-3xl text-3xl font-extrabold tracking-tight md:text-4xl"
            >
              Start with what you have.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
              Open a blank canvas, upload requirements, map a public repository, or reuse a saved
              template.
            </p>
          </div>

          <div className="start-launchpad grid gap-px overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--border)] md:grid-cols-2">
            <article className="start-cell start-cell-fresh flex min-w-0 flex-col bg-[var(--card)] p-6">
              <FolderPlus className="h-5 w-5 text-[var(--color-client)]" aria-hidden="true" />
              <h2 className="mt-3 font-semibold">Start fresh</h2>
              <p className="mt-1 flex-1 text-sm leading-6 text-[var(--muted-foreground)]">
                Open a blank architecture map and shape it manually. No API key required.
              </p>
              <button
                type="button"
                onClick={handleBlankStart}
                disabled={creating}
                className="mt-5 min-h-11 rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--muted)] disabled:opacity-50"
              >
                {creating ? "Creating map..." : "Start fresh"}
              </button>
            </article>

            <article className="start-cell start-cell-requirements flex min-w-0 flex-col bg-[var(--card)] p-6">
              <FileText className="h-5 w-5 text-[var(--color-services)]" aria-hidden="true" />
              <h2 className="mt-3 font-semibold">Upload requirements</h2>
              <p className="mt-1 flex-1 text-sm leading-6 text-[var(--muted-foreground)]">
                Turn a Markdown or text requirements document into an architecture map.
              </p>
              <button
                type="button"
                onClick={handleRequirementsStart}
                disabled={creating}
                className="mt-5 min-h-11 rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--muted)] disabled:opacity-50"
              >
                Choose requirements
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.txt,text/markdown,text/plain"
                onChange={handleFileUpload}
                className="hidden"
                aria-label="Requirements file"
              />
              <p className="mt-2 text-xs text-[var(--muted-foreground)]">Accepts .md and .txt</p>
            </article>

            <article className="start-cell start-cell-repository flex min-w-0 flex-col bg-[var(--card)] p-6">
              <GitBranch className="h-5 w-5 text-[var(--color-client)]" aria-hidden="true" />
              <h2 className="mt-3 font-semibold">Map a repo</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
                Scan a public GitHub repository and make its moving pieces visible.
              </p>
              <form onSubmit={handleRepoSubmit} className="mt-5 flex flex-1 flex-col justify-end">
                <label className="sr-only" htmlFor="repository-reference">
                  GitHub repository
                </label>
                <input
                  id="repository-reference"
                  type="text"
                  inputMode="url"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="owner/repo"
                  disabled={creating}
                  className="min-h-11 min-w-0 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={creating || !repoUrl.trim()}
                  className="mt-3 min-h-11 rounded-md border border-[var(--border)] bg-[var(--background)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
                >
                  {creating ? "Creating map..." : "Map repository"}
                </button>
              </form>
            </article>

            <article className="start-cell start-cell-template flex min-w-0 flex-col bg-[var(--card)] p-6">
              <LayoutTemplate className="h-5 w-5 text-[var(--color-api)]" aria-hidden="true" />
              <h2 className="mt-3 font-semibold">Use a template</h2>
              <p className="mt-1 flex-1 text-sm leading-6 text-[var(--muted-foreground)]">
                Reuse one of your saved architecture maps as a new starting point.
              </p>
              <Link
                href="/project/new?mode=template"
                onClick={() => recordStartSelection("template")}
                className="mt-5 inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--muted)]"
              >
                Choose a template
              </Link>
            </article>
          </div>
        </section>

        {error && (
          <div
            className="flex items-start gap-3 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-surface)] p-4 text-sm text-[var(--danger)]"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
            <div>
              <span>{error}</span>
              {blankAutoCreateFailed && (
                <button
                  type="button"
                  onClick={() => void createProject(undefined, { blankAutoCreate: true })}
                  disabled={creating}
                  className="ml-3 font-semibold underline underline-offset-2 disabled:opacity-50"
                >
                  Retry creating the blank map
                </button>
              )}
            </div>
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
