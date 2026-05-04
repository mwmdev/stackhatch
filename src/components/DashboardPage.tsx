"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileText,
  FolderPlus,
  GitBranch,
  LayoutDashboard,
  RefreshCw,
  Settings,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import UserAvatar from "@/components/UserAvatar";
import UpgradePrompt from "@/components/UpgradePrompt";
import { PLAN_CONFIG, type PublicPlanKey } from "@/lib/plan-config";

interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  teamId: string | null;
  teamName: string | null;
  createdAt: number;
  updatedAt: number;
}

interface CurrentUser {
  role?: string;
}

interface SettingsSummary {
  hasAnthropicKey?: boolean;
  hasServerAnthropicKey?: boolean;
  hasUserAnthropicKey?: boolean;
}

interface BillingSummary {
  plan?: string;
  billingInterval?: string | null;
  status?: string | null;
  currentPeriodEnd?: number | null;
}

const ACCEPTED_REQUIREMENT_FILES = [".md", ".txt"];

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function normalizePlan(plan: string | null | undefined): PublicPlanKey {
  if (plan === "starter") return "starter";
  if (plan === "pro" || plan === "team") return "pro";
  return "free";
}

function getProjectLimitLabel(plan: PublicPlanKey) {
  const limit = PLAN_CONFIG[plan].features.projects;
  return limit === "unlimited" ? "Unlimited" : String(limit);
}

function isAcceptedRequirementsFile(file: File) {
  const name = file.name.toLowerCase();
  return ACCEPTED_REQUIREMENT_FILES.some((extension) => name.endsWith(extension));
}

export default function Dashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectsError, setProjectsError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [upgradePrompt, setUpgradePrompt] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsSummary | null>(null);
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    let cancelled = false;

    Promise.allSettled([
      fetch("/api/me").then((res) => (res.ok ? res.json() : null)),
      fetch("/api/settings").then((res) => (res.ok ? res.json() : null)),
      fetch("/api/billing/subscription").then((res) => (res.ok ? res.json() : null)),
    ]).then(([userResult, settingsResult, billingResult]) => {
      if (cancelled) return;

      if (userResult.status === "fulfilled") {
        setCurrentUserRole((userResult.value as CurrentUser | null)?.role ?? null);
      }
      if (settingsResult.status === "fulfilled") {
        setSettings(settingsResult.value as SettingsSummary | null);
      }
      if (billingResult.status === "fulfilled") {
        setBilling(billingResult.value as BillingSummary | null);
      }
    });

    return () => {
      cancelled = true;
    };
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
        const firstLine = opts.description.split("\n").find((line) => line.trim());
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
        if (data.upgradeRequired) {
          setUpgradePrompt(data.error || "create more projects");
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
    const url = repoUrl.trim();
    if (!url) return;
    createProject({ repoUrl: url });
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

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setProjects((prev) => prev.filter((project) => project.id !== deleteTarget.id));
      }
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget]);

  const isAdmin = currentUserRole === "admin";
  const activePlan = normalizePlan(billing?.plan);
  const activePlanConfig = PLAN_CONFIG[activePlan];
  const projectLimit = activePlanConfig.features.projects;
  const hasAiAccess = Boolean(settings?.hasAnthropicKey || settings?.hasServerAnthropicKey);
  const activationItems = [
    {
      label: "AI access ready",
      complete: hasAiAccess,
      detail: hasAiAccess ? "Claude is configured for architecture work." : "Add BYOK or upgrade.",
      href: "/settings",
    },
    {
      label: "First project created",
      complete: projects.length > 0,
      detail:
        projects.length > 0
          ? `${projects.length} project${projects.length === 1 ? "" : "s"}`
          : "Start with a repo, PRD, or blank canvas.",
      href: "#start",
    },
    {
      label: "Shareable handoff path",
      complete: activePlan !== "free",
      detail:
        activePlan === "free"
          ? "Upgrade for PNG/SVG exports."
          : "Exports and collaboration are unlocked.",
      href: "/pricing",
    },
  ];

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <nav className="nav-blur sticky top-0 z-40 border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link href="/app" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <LayoutDashboard className="h-5 w-5 text-[var(--color-client)]" />
            StackHatch
          </Link>
          <div className="flex items-center gap-1">
            <Link
              href="/pricing"
              className="hidden rounded-md px-3 py-2 text-sm font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] sm:inline-flex"
            >
              Pricing
            </Link>
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

      <main className="mx-auto grid max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-8">
          <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--color-client)]">
                  Architecture workspace
                </p>
                <h1 className="mt-2 max-w-3xl text-3xl font-bold tracking-tight md:text-4xl">
                  Turn a repo or product brief into a decision-ready architecture map.
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
                  The fastest path to value is a real input: a public GitHub repo, a short PRD, or a
                  blank project for the architecture assistant.
                </p>
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
                <div className="text-sm font-semibold">{activePlanConfig.name}</div>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {projects.length}/{getProjectLimitLabel(activePlan)} projects used
                </p>
                {projectLimit !== "unlimited" && projects.length >= projectLimit && (
                  <Link
                    href="/pricing"
                    className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--color-client)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--color-client-hover)]"
                  >
                    Upgrade plan
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </div>
          </section>

          <section id="start" className="grid gap-4 md:grid-cols-3">
            <form
              onSubmit={handleRepoSubmit}
              className="flex min-w-0 flex-col rounded-lg border border-[var(--border)] bg-[var(--card)] p-5"
            >
              <GitBranch className="h-5 w-5 text-[var(--color-client)]" />
              <h2 className="mt-3 font-semibold">Analyze a repository</h2>
              <p className="mt-1 flex-1 text-sm leading-6 text-[var(--muted-foreground)]">
                Use a public GitHub URL to create the first architecture map.
              </p>
              <input
                type="url"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                disabled={creating}
                className="mt-4 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-client)] disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={creating || !repoUrl.trim()}
                className="mt-3 min-h-11 rounded-md bg-[var(--color-client)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-client-hover)] disabled:opacity-50"
              >
                {creating ? "Creating..." : "Analyze"}
              </button>
            </form>

            <div className="flex min-w-0 flex-col rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
              <FileText className="h-5 w-5 text-[var(--color-services)]" />
              <h2 className="mt-3 font-semibold">Upload requirements</h2>
              <p className="mt-1 flex-1 text-sm leading-6 text-[var(--muted-foreground)]">
                Start from a Markdown or text PRD and refine the generated architecture.
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
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

            <div className="flex min-w-0 flex-col rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
              <FolderPlus className="h-5 w-5 text-[var(--color-api)]" />
              <h2 className="mt-3 font-semibold">Start fresh</h2>
              <p className="mt-1 flex-1 text-sm leading-6 text-[var(--muted-foreground)]">
                Open a blank canvas when the architecture is still forming.
              </p>
              <button
                onClick={() => createProject()}
                disabled={creating}
                className="mt-4 min-h-11 rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--muted)] disabled:opacity-50"
              >
                Start from scratch
              </button>
            </div>
          </section>

          {error && (
            <div
              className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
              <span>{error}</span>
            </div>
          )}

          <section className="rounded-lg border border-[var(--border)] bg-[var(--card)]">
            <div className="flex flex-col gap-3 border-b border-[var(--border)] p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold">Recent projects</h2>
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
                    className="group relative min-w-0 rounded-lg border border-[var(--border)] bg-[var(--background)] p-4 transition-shadow hover:shadow-md"
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
                        {project.teamName && (
                          <span className="inline-flex max-w-28 flex-none truncate rounded-full bg-[var(--color-services)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--color-services)]">
                            {project.teamName}
                          </span>
                        )}
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
                      className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30"
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
        </div>

        <aside className="space-y-5">
          <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
            <h2 className="font-semibold">Activation</h2>
            <div className="mt-4 space-y-3">
              {activationItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex min-w-0 gap-3 rounded-md p-2 hover:bg-[var(--muted)]"
                >
                  {item.complete ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-green-600" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-none text-amber-600" />
                  )}
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{item.label}</span>
                    <span className="block text-xs leading-5 text-[var(--muted-foreground)]">
                      {item.detail}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-[var(--color-api)]" />
              <div>
                <h2 className="font-semibold">Launch basics</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                  Billing, BYOK, team access, comments, and admin support tools are available. Keep
                  the first session focused on one real architecture artifact.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 text-sm">
              <Link href="/settings" className="hover:text-[var(--color-client)]">
                Account and AI settings
              </Link>
              <Link href="/pricing" className="hover:text-[var(--color-client)]">
                Plans and limits
              </Link>
              <Link href="/support" className="hover:text-[var(--color-client)]">
                Support and launch guide
              </Link>
            </div>
          </section>
        </aside>
      </main>

      <footer className="border-t border-[var(--border)] py-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 text-sm text-[var(--muted-foreground)] sm:flex-row sm:items-center sm:justify-between">
          <span>StackHatch</span>
          <div className="flex flex-wrap gap-5">
            <Link href="/support" className="hover:text-[var(--foreground)]">
              Support
            </Link>
            <Link href="/privacy" className="hover:text-[var(--foreground)]">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-[var(--foreground)]">
              Terms
            </Link>
          </div>
        </div>
      </footer>

      {upgradePrompt && (
        <UpgradePrompt
          feature={upgradePrompt}
          variant="modal"
          onDismiss={() => setUpgradePrompt(null)}
        />
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
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
                className="min-h-11 rounded-md bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
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
