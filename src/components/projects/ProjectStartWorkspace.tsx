"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  FileText,
  GitBranch,
  LayoutTemplate,
  Plus,
  X,
} from "lucide-react";
import TemplatePicker from "@/components/templates/TemplatePicker";
import ThemeToggle from "@/components/ThemeToggle";
import StackHatchWordmark from "@/components/shells/StackHatchWordmark";
import { buildLocalProjectPath } from "@/lib/app-route";
import { parseGitHubRepoReference } from "@/lib/github-analyzer";
import {
  buildProjectStartChooserPath,
  buildProjectStartPath,
  consumeBlankAutoCreateIntent,
  markProjectStart,
  PROJECT_START_METHODS,
  projectStartMethodFromPath,
  repositoryFromProjectStartPath,
  returnPathFromProjectStartPath,
  type ProjectStartMethod,
} from "@/lib/project-start";
import type { VaultCanvasState } from "@/lib/vault/schema";
import { getBrowserWorkspaceVault, type WorkspaceVault } from "@/lib/vault/workspace";

interface Template {
  id: string;
  name: string;
  description: string | null;
  canvasState: string;
  createdAt: number;
}

interface ProjectStartWorkspaceProps {
  initialMode: ProjectStartMethod | null;
  vault?: WorkspaceVault;
}

interface ProjectPayload {
  name: string;
  description?: string;
  repoUrl?: string;
  canvasState?: string;
}

const ACCEPTED_REQUIREMENT_FILES = [".md", ".txt"];

const SOURCE_DETAILS: Record<
  ProjectStartMethod,
  {
    title: string;
    description: string;
    modeTitle: string;
    modeDescription: string;
    detail: string;
    icon: typeof Plus;
    color: string;
  }
> = {
  blank: {
    title: "Blank map",
    description: "Shape the architecture manually on an empty canvas.",
    modeTitle: "Create a blank map",
    modeDescription: "Start with an empty canvas. Your current map stays exactly as it is.",
    detail: "No AI key",
    icon: Plus,
    color: "var(--color-client)",
  },
  requirements: {
    title: "Requirements file",
    description: "Stage a Markdown or text brief in a new local map.",
    modeTitle: "Upload requirements",
    modeDescription: "Use a Markdown or text brief to create a separate architecture map.",
    detail: ".md or .txt",
    icon: FileText,
    color: "var(--color-services)",
  },
  repository: {
    title: "Public repository",
    description: "Stage a public GitHub repository for analysis you start later.",
    modeTitle: "Map a public repository",
    modeDescription: "Create a separate map from a public GitHub repository.",
    detail: "owner/repo",
    icon: GitBranch,
    color: "var(--color-api)",
  },
  template: {
    title: "Template",
    description: "Copy one of your saved maps into a separate project.",
    modeTitle: "Start from a template",
    modeDescription: "Choose a saved map to copy into a separate personal project.",
    detail: "Personal copy",
    icon: LayoutTemplate,
    color: "var(--color-data)",
  },
};

const SOURCE_OPTIONS = PROJECT_START_METHODS.map((method) => ({
  method,
  ...SOURCE_DETAILS[method],
}));

function isAcceptedRequirementsFile(file: File) {
  const name = file.name.toLowerCase();
  return ACCEPTED_REQUIREMENT_FILES.some((extension) => name.endsWith(extension));
}

export function projectNameFromRequirements(requirements: string) {
  const firstLine = requirements.split("\n").find((line) => line.trim());
  return (
    firstLine
      ?.replace(/^#{1,6}\s+/, "")
      .trim()
      .slice(0, 80) || "Untitled Project"
  );
}

export default function ProjectStartWorkspace({ initialMode, vault }: ProjectStartWorkspaceProps) {
  const router = useRouter();
  const [workspaceVault] = useState(() => vault ?? getBrowserWorkspaceVault());
  const [mode, setMode] = useState<ProjectStartMethod | null>(initialMode);
  const [repoUrl, setRepoUrl] = useState("");
  const [returnPath, setReturnPath] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [navigationRecoveryPath, setNavigationRecoveryPath] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [blankAttempted, setBlankAttempted] = useState(false);
  const modeHeadingRef = useRef<HTMLHeadingElement>(null);
  const blankAutoCreateAttempted = useRef(false);
  const recordedSelection = useRef<ProjectStartMethod | null>(null);
  const submissionInFlight = useRef(false);
  const requirementsReadGeneration = useRef(0);
  const activeRequirementsReader = useRef<FileReader | null>(null);

  const cancelRequirementsRead = useCallback(() => {
    requirementsReadGeneration.current += 1;
    if (activeRequirementsReader.current?.readyState === FileReader.LOADING) {
      activeRequirementsReader.current.abort();
    }
    activeRequirementsReader.current = null;
  }, []);

  useEffect(() => {
    const browserPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    setMode(projectStartMethodFromPath(browserPath) ?? initialMode);
    setRepoUrl(repositoryFromProjectStartPath(browserPath) ?? "");
    setReturnPath(returnPathFromProjectStartPath(browserPath));
    setError("");
    setNavigationRecoveryPath(null);
    setSelectedTemplate(null);
    setBlankAttempted(false);
    blankAutoCreateAttempted.current = false;
    recordedSelection.current = null;
  }, [initialMode]);

  useEffect(() => () => cancelRequirementsRead(), [cancelRequirementsRead]);

  useEffect(() => {
    if (!mode) return;
    modeHeadingRef.current?.focus();
  }, [mode]);

  const chooserPath = buildProjectStartChooserPath(returnPath);

  const recordStartSelection = useCallback((method: ProjectStartMethod) => {
    if (recordedSelection.current === method) return;
    recordedSelection.current = method;
    markProjectStart(method);
  }, []);

  const createProject = useCallback(
    async (payload: ProjectPayload) => {
      if (submissionInFlight.current) return false;
      submissionInFlight.current = true;
      setSubmitting(true);
      setError("");
      let createdPath: string | null = null;
      try {
        let canvasState: VaultCanvasState | null = null;
        if (payload.canvasState) {
          const parsed = JSON.parse(payload.canvasState) as VaultCanvasState;
          if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
            throw new Error("invalid-template");
          }
          canvasState = parsed;
        }
        const project = await workspaceVault.createProject({
          name: payload.name,
          description: payload.description ?? null,
          repoUrl: payload.repoUrl ?? null,
          canvasState,
        });
        createdPath = buildLocalProjectPath(project.id);
        setNavigationRecoveryPath(createdPath);
        router.push(createdPath);
        return true;
      } catch {
        setError(
          createdPath
            ? "The map was saved on this device, but navigation did not complete."
            : "The map could not be saved to browser storage. Check storage permissions, then retry."
        );
        return false;
      } finally {
        if (!createdPath) {
          submissionInFlight.current = false;
          setSubmitting(false);
        }
      }
    },
    [router, workspaceVault]
  );

  const createBlankProject = useCallback(
    async (recordSelection: boolean) => {
      if (recordSelection) {
        recordStartSelection("blank");
        consumeBlankAutoCreateIntent();
      }
      setBlankAttempted(true);
      return createProject({ name: "Untitled Project" });
    },
    [createProject, recordStartSelection]
  );

  useEffect(() => {
    if (mode !== "blank" || blankAutoCreateAttempted.current) return;
    blankAutoCreateAttempted.current = true;
    if (consumeBlankAutoCreateIntent()) void createBlankProject(false);
  }, [createBlankProject, mode]);

  function chooseSource(method: ProjectStartMethod) {
    cancelRequirementsRead();
    recordStartSelection(method);
    setError("");
    setSelectedTemplate(null);
    setMode(method);
    const path = buildProjectStartPath(method, { returnTo: returnPath });
    router.push(path);

    if (method === "blank") {
      consumeBlankAutoCreateIntent();
      void createBlankProject(false);
    }
  }

  function chooseAnotherSource() {
    cancelRequirementsRead();
    setMode(null);
    setError("");
    setSelectedTemplate(null);
    router.push(chooserPath);
  }

  function handleRequirementsFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isAcceptedRequirementsFile(file)) {
      setError("Choose a Markdown (.md) or text (.txt) requirements file.");
      return;
    }

    cancelRequirementsRead();
    const generation = requirementsReadGeneration.current;
    const reader = new FileReader();
    activeRequirementsReader.current = reader;
    reader.onload = () => {
      if (
        generation !== requirementsReadGeneration.current ||
        activeRequirementsReader.current !== reader
      ) {
        return;
      }
      activeRequirementsReader.current = null;
      const requirements = String(reader.result || "").trim();
      if (!requirements) {
        setError("The requirements file is empty. Choose a file with project details.");
        return;
      }
      recordStartSelection("requirements");
      void createProject({
        name: projectNameFromRequirements(requirements),
        description: requirements,
      });
    };
    reader.onerror = () => {
      if (
        generation !== requirementsReadGeneration.current ||
        activeRequirementsReader.current !== reader
      ) {
        return;
      }
      activeRequirementsReader.current = null;
      setError("The requirements file could not be read. Try another file.");
    };
    reader.readAsText(file);
  }

  function handleRepositorySubmit(event: React.FormEvent) {
    event.preventDefault();
    const repository = parseGitHubRepoReference(repoUrl);
    if (!repository) {
      setError("Enter a public GitHub repository as owner/repo or a full GitHub URL.");
      return;
    }
    recordStartSelection("repository");
    void createProject({ name: repository.repo, repoUrl: repository.normalizedUrl });
  }

  const createFromTemplate = useCallback(
    async (template: Template) => {
      recordStartSelection("template");
      setSelectedTemplate(template);
      await createProject({
        name: `${template.name} – Copy`,
        canvasState: template.canvasState,
      });
    },
    [createProject, recordStartSelection]
  );

  const modeDetails = mode ? SOURCE_DETAILS[mode] : null;
  const ModeIcon = modeDetails?.icon;
  let blankButtonLabel = "Create blank map";
  if (submitting) blankButtonLabel = "Creating map...";
  else if (blankAttempted && error) blankButtonLabel = "Retry blank map";

  return (
    <div className="flex min-h-screen flex-col bg-[var(--canvas)] text-[var(--foreground)]">
      <header className="z-20 border-b border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto flex min-h-16 w-full max-w-[var(--shell-width-wide)] items-center justify-between gap-3 px-[var(--page-gutter)]">
          <StackHatchWordmark
            href="/app/maps"
            label="All Maps"
            className="rounded-[var(--radius-control)] px-2 hover:bg-[var(--muted)]"
          />
          <nav aria-label="Map workspace" className="map-workspace-actions flex items-center gap-1">
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main
        className="relative flex flex-1 items-stretch justify-center overflow-x-clip px-3 py-4 sm:px-6 sm:py-8"
        style={{
          backgroundImage:
            "linear-gradient(to right, color-mix(in srgb, var(--border) 34%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--border) 34%, transparent) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at center, color-mix(in srgb, var(--canvas) 10%, transparent) 0%, var(--canvas) 72%)",
          }}
          aria-hidden="true"
        />
        <section
          aria-labelledby="project-start-title"
          className="relative z-10 w-full max-w-[76rem] overflow-hidden rounded-[var(--radius-surface)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-low)]"
        >
          <div className="grid min-h-full lg:grid-cols-[13rem_minmax(0,1fr)]">
            <aside
              aria-label="New map context"
              className="border-b border-[var(--border)] bg-[var(--surface-subtle)] p-4 sm:p-5 lg:border-b-0 lg:border-r lg:p-6"
            >
              <p className="font-utility text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                New map
              </p>
              <div className="mt-4 flex items-center gap-3 lg:mt-8 lg:items-start">
                <span className="font-utility flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[var(--brand)] text-[0.6875rem] font-bold text-[var(--brand-foreground)]">
                  01
                </span>
                <div>
                  <p className="text-sm font-bold">
                    {modeDetails ? "Source detail" : "Choose source"}
                  </p>
                  <p className="mt-1 hidden text-xs leading-5 text-[var(--muted-foreground)] sm:block">
                    One independent architecture map, ready to refine in the editor.
                  </p>
                </div>
              </div>
            </aside>

            <div className="min-w-0">
              <div className="border-b border-[var(--border)] px-4 py-5 sm:px-7 sm:py-7">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {modeDetails && ModeIcon ? (
                      <div className="flex items-start gap-3">
                        <div
                          className="flex h-10 w-10 flex-none items-center justify-center rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--background)]"
                          style={{ color: modeDetails.color }}
                        >
                          <ModeIcon className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <h1
                            ref={modeHeadingRef}
                            id="project-start-title"
                            tabIndex={-1}
                            className="font-display text-2xl font-extrabold tracking-tight outline-none sm:text-3xl"
                          >
                            {modeDetails.modeTitle}
                          </h1>
                          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
                            {modeDetails.modeDescription}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="font-utility text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">
                          Architecture source
                        </p>
                        <h1
                          id="project-start-title"
                          className="font-display mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl"
                        >
                          Start a new map
                        </h1>
                        <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
                          Choose the source that best describes what you have. Your existing maps
                          stay unchanged.
                        </p>
                      </>
                    )}
                  </div>

                  <div className="flex flex-none flex-wrap items-center justify-end gap-2">
                    {mode && (
                      <button
                        type="button"
                        aria-label="Choose another source"
                        onClick={chooseAnotherSource}
                        disabled={submitting}
                        className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
                      >
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        <span className="hidden sm:inline">Choose another source</span>
                      </button>
                    )}
                    {returnPath && (
                      <a
                        href={returnPath}
                        aria-label="Cancel map creation"
                        aria-disabled={submitting || undefined}
                        tabIndex={submitting ? -1 : undefined}
                        onClick={(event) => {
                          if (submitting) {
                            event.preventDefault();
                            return;
                          }
                          cancelRequirementsRead();
                        }}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border)] hover:bg-[var(--muted)] aria-disabled:pointer-events-none aria-disabled:opacity-50"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {!mode && (
                <div
                  className="grid gap-3 p-3 sm:grid-cols-2 sm:p-5 lg:grid-cols-4 lg:p-7"
                  aria-label="Map sources"
                >
                  {SOURCE_OPTIONS.map((source) => {
                    const SourceIcon = source.icon;
                    return (
                      <button
                        key={source.method}
                        type="button"
                        onClick={() => chooseSource(source.method)}
                        className="group flex min-h-64 min-w-0 flex-col rounded-[var(--radius-surface)] border border-t-2 border-[var(--border)] bg-[var(--background)] p-4 text-left transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-[var(--surface-raised)] hover:shadow-[var(--shadow-low)] focus-visible:relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)] sm:min-h-72 sm:p-5"
                        style={{ borderTopColor: source.color }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span
                            className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--card)]"
                            style={{ color: source.color }}
                          >
                            <SourceIcon className="h-5 w-5" aria-hidden="true" />
                          </span>
                          <span className="font-utility rounded-[var(--radius-control)] border border-[var(--border)] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                            {source.detail}
                          </span>
                        </div>
                        <span className="font-display mt-6 text-lg font-bold leading-tight">
                          {source.title}
                        </span>
                        <span className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">
                          {source.description}
                        </span>
                        <span
                          className="mt-auto flex items-center justify-between border-t border-[var(--border)] pt-4 text-xs font-bold uppercase tracking-[0.1em]"
                          style={{ color: source.color }}
                          aria-hidden="true"
                        >
                          Select source
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {mode && mode !== "template" && (
                <div className="px-4 py-5 sm:px-7 sm:py-7">
                  {mode === "blank" && (
                    <section className="max-w-2xl rounded-[var(--radius-surface)] border border-[var(--border)] bg-[var(--background)] p-5 sm:p-6">
                      <h2 className="font-semibold">Empty architecture canvas</h2>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                        Create one separate map with no nodes or connections. No Anthropic key is
                        required.
                      </p>
                      <button
                        type="button"
                        onClick={() => void createBlankProject(true)}
                        disabled={submitting}
                        className="mt-5 min-h-11 rounded-[var(--radius-control)] bg-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 disabled:opacity-50"
                      >
                        {blankButtonLabel}
                      </button>
                    </section>
                  )}

                  {mode === "requirements" && (
                    <section className="max-w-2xl rounded-[var(--radius-surface)] border border-[var(--border)] bg-[var(--background)] p-5 sm:p-6">
                      <h2 className="font-semibold">Choose your requirements file</h2>
                      <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
                        The first non-empty Markdown heading becomes the map name. You can rename it
                        later.
                      </p>
                      <label className="mt-5 inline-flex min-h-11 cursor-pointer items-center rounded-[var(--radius-control)] bg-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)] focus-within:ring-2 focus-within:ring-[var(--ring)] focus-within:ring-offset-2 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
                        {submitting ? "Creating map..." : "Choose .md or .txt file"}
                        <input
                          type="file"
                          accept=".md,.txt,text/markdown,text/plain"
                          aria-label="Choose .md or .txt file"
                          onChange={handleRequirementsFile}
                          disabled={submitting}
                          className="sr-only"
                        />
                      </label>
                    </section>
                  )}

                  {mode === "repository" && (
                    <form
                      onSubmit={handleRepositorySubmit}
                      className="max-w-2xl rounded-[var(--radius-surface)] border border-[var(--border)] bg-[var(--background)] p-5 sm:p-6"
                    >
                      <label htmlFor="new-project-repository" className="text-sm font-semibold">
                        Public GitHub repository
                      </label>
                      <input
                        id="new-project-repository"
                        type="text"
                        inputMode="url"
                        value={repoUrl}
                        onChange={(event) => setRepoUrl(event.target.value)}
                        placeholder="owner/repo or https://github.com/owner/repo"
                        disabled={submitting}
                        autoFocus
                        className="mt-2 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-50"
                      />
                      <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">
                        This creates a local staged map. No repository or AI request runs until you
                        explicitly start it in the editor.
                      </p>
                      <button
                        type="submit"
                        disabled={submitting || !repoUrl.trim()}
                        className="mt-5 min-h-11 w-full rounded-[var(--radius-control)] bg-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 disabled:opacity-50"
                      >
                        {submitting ? "Creating map..." : "Map repository"}
                      </button>
                    </form>
                  )}

                  {error && (
                    <div
                      className="mt-5 flex max-w-2xl items-start gap-2 rounded-[var(--radius-surface)] border border-[var(--danger-border)] bg-[var(--danger-surface)] p-4 text-sm text-[var(--danger)]"
                      role="alert"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
                      <span>
                        {error}
                        {navigationRecoveryPath ? (
                          <>
                            {" "}
                            <Link
                              href={navigationRecoveryPath}
                              className="font-semibold underline underline-offset-2"
                            >
                              Open the saved map
                            </Link>
                          </>
                        ) : null}
                      </span>
                    </div>
                  )}

                  {submitting && (
                    <p className="sr-only" role="status">
                      Creating your map
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {mode === "template" && (
        <TemplatePicker
          onSelectTemplate={(template) => void createFromTemplate(template)}
          onCancel={() => {
            if (returnPath) router.push(returnPath);
            else chooseAnotherSource();
          }}
          busyTemplateId={submitting ? selectedTemplate?.id : null}
          selectionError={error}
          onRetrySelection={
            selectedTemplate ? () => void createFromTemplate(selectedTemplate) : undefined
          }
          emptyStateHref={chooserPath}
          vault={workspaceVault}
        />
      )}
    </div>
  );
}
