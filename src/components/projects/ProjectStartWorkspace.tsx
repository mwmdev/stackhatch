"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Boxes,
  FileText,
  FolderOpen,
  GitBranch,
  KeyRound,
  LayoutTemplate,
  Plus,
  Settings,
  X,
} from "lucide-react";
import TemplatePicker from "@/components/templates/TemplatePicker";
import ThemeToggle from "@/components/ThemeToggle";
import IconControl from "@/components/ui/IconControl";
import { consumeAuthenticationStarted, trackEvent } from "@/lib/analytics";
import { parseGitHubRepoReference } from "@/lib/github-analyzer";
import {
  buildProjectStartChooserPath,
  buildProjectStartPath,
  consumeBlankAutoCreateIntent,
  getPendingProjectStart,
  markProjectStart,
  PROJECT_START_METHODS,
  type ProjectStartMethod,
} from "@/lib/project-start";

interface Template {
  id: string;
  name: string;
  description: string | null;
  canvasState: string;
  createdAt: number;
}

interface ProjectStartWorkspaceProps {
  initialMode: ProjectStartMethod | null;
  initialRepository: string;
  returnTo: string | null;
}

interface ProjectPayload {
  name: string;
  description?: string;
  repoUrl?: string;
  canvasState?: string;
}

type SettingsStatus = "idle" | "loading" | "ready" | "missing-key" | "error";

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
    description: "Turn a Markdown or text brief into a first map.",
    modeTitle: "Upload requirements",
    modeDescription: "Use a Markdown or text brief to create a separate architecture map.",
    detail: ".md or .txt",
    icon: FileText,
    color: "var(--color-services)",
  },
  repository: {
    title: "Public repository",
    description: "Scan a public GitHub repository and map its moving pieces.",
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

export default function ProjectStartWorkspace({
  initialMode,
  initialRepository,
  returnTo,
}: ProjectStartWorkspaceProps) {
  const router = useRouter();
  const [mode, setMode] = useState<ProjectStartMethod | null>(initialMode);
  const [repoUrl, setRepoUrl] = useState(initialRepository);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState<SettingsStatus>("idle");
  const [settingsRetry, setSettingsRetry] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [blankAttempted, setBlankAttempted] = useState(false);
  const modeHeadingRef = useRef<HTMLHeadingElement>(null);
  const blankAutoCreateAttempted = useRef(false);
  const recordedSelection = useRef<ProjectStartMethod | null>(null);
  const submissionInFlight = useRef(false);
  const requirementsReadGeneration = useRef(0);
  const activeRequirementsReader = useRef<FileReader | null>(null);

  function cancelRequirementsRead() {
    requirementsReadGeneration.current += 1;
    if (activeRequirementsReader.current?.readyState === FileReader.LOADING) {
      activeRequirementsReader.current.abort();
    }
    activeRequirementsReader.current = null;
  }

  useEffect(() => {
    setMode(initialMode);
    setRepoUrl(initialRepository);
    setError("");
    setSelectedTemplate(null);
    setBlankAttempted(false);
    blankAutoCreateAttempted.current = false;
    recordedSelection.current = null;
  }, [initialMode, initialRepository, returnTo]);

  useEffect(
    () => () => {
      requirementsReadGeneration.current += 1;
      if (activeRequirementsReader.current?.readyState === FileReader.LOADING) {
        activeRequirementsReader.current.abort();
      }
      activeRequirementsReader.current = null;
    },
    []
  );

  useEffect(() => {
    if (!mode) return;
    modeHeadingRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    if (!consumeAuthenticationStarted()) return;
    const startMethod = getPendingProjectStart();
    trackEvent("github_auth_completed", {
      location: "editor",
      ...(startMethod ? { start_method: startMethod } : {}),
    });
  }, []);

  useEffect(() => {
    if (!mode) {
      setSettingsStatus("idle");
      return;
    }
    if (mode === "blank" || mode === "template") {
      setSettingsStatus("ready");
      return;
    }

    let cancelled = false;
    setSettingsStatus("loading");
    setError("");
    fetch("/api/settings")
      .then(async (response) => {
        if (!response.ok) throw new Error("settings");
        return response.json();
      })
      .then((settings) => {
        if (!cancelled) {
          setSettingsStatus(settings.hasAnthropicKey ? "ready" : "missing-key");
        }
      })
      .catch(() => {
        if (!cancelled) setSettingsStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [mode, settingsRetry]);

  const normalizedRepository = useMemo(
    () => (mode === "repository" ? parseGitHubRepoReference(repoUrl) : null),
    [mode, repoUrl]
  );
  const chooserPath = buildProjectStartChooserPath(returnTo);
  const currentStartPath = mode
    ? buildProjectStartPath(mode, {
        repository: normalizedRepository?.slug,
        returnTo,
      })
    : chooserPath;
  const setupHref = `/settings?setup=anthropic&returnTo=${encodeURIComponent(currentStartPath)}`;

  const recordStartSelection = useCallback((method: ProjectStartMethod) => {
    if (recordedSelection.current === method) return;
    recordedSelection.current = method;
    markProjectStart(method);
    trackEvent("project_start_selected", {
      location: "editor",
      start_method: method,
    });
  }, []);

  const createProject = useCallback(
    async (payload: ProjectPayload) => {
      if (submissionInFlight.current) return false;
      submissionInFlight.current = true;
      setSubmitting(true);
      setError("");
      try {
        const response = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (data.code === "AI_NOT_CONFIGURED") {
            router.push(setupHref);
            return false;
          }
          setError(data.error || "The map could not be created. Try again.");
          return false;
        }
        router.push(`/project/${data.id}`);
        return true;
      } catch {
        setError("The map could not be created. Check your connection and try again.");
        return false;
      } finally {
        submissionInFlight.current = false;
        setSubmitting(false);
      }
    },
    [router, setupHref]
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
    const path = buildProjectStartPath(method, { returnTo });
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
      trackEvent("repository_intent_submitted", {
        location: "editor",
        error_category: "invalid_url",
      });
      return;
    }
    recordStartSelection("repository");
    trackEvent("repository_intent_submitted", { location: "editor" });
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
      <header className="z-20 border-b border-[var(--border)] bg-[var(--background)]">
        <div className="flex min-h-14 items-center justify-between gap-3 px-3 sm:px-4">
          <Link
            href="/app"
            className="font-display inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-extrabold tracking-tight hover:bg-[var(--muted)]"
          >
            <Boxes className="h-[18px] w-[18px] text-[var(--color-client)]" aria-hidden="true" />
            <span>StackHatch</span>
          </Link>
          <nav aria-label="Map workspace" className="flex items-center gap-1">
            <IconControl
              href="/app/maps"
              label="All Maps"
              tooltip="All Maps"
              tooltipPlacement="bottom"
            >
              <FolderOpen className="h-[18px] w-[18px]" />
            </IconControl>
            <Link
              href="/settings"
              className="flex h-11 w-11 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              aria-label="Settings"
            >
              <Settings className="h-[18px] w-[18px]" aria-hidden="true" />
            </Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main
        className="relative flex flex-1 items-center justify-center overflow-hidden px-3 py-5 sm:px-6 sm:py-8"
        style={{
          backgroundImage:
            "linear-gradient(to right, color-mix(in srgb, var(--border) 42%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--border) 42%, transparent) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
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
          className="relative z-10 w-full max-w-4xl overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[0_22px_65px_-48px_var(--shadow-color)]"
        >
          <div className="px-4 pb-3 pt-4 sm:px-6 sm:pb-4 sm:pt-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {modeDetails && ModeIcon ? (
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-10 w-10 flex-none items-center justify-center rounded-md border border-[var(--border)] bg-[var(--background)]"
                      style={{ color: modeDetails.color }}
                    >
                      <ModeIcon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
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
                    <h1
                      id="project-start-title"
                      className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl"
                    >
                      Start a new map
                    </h1>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
                      Choose a starting point. Your existing maps stay unchanged.
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
                    className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-[var(--muted)] disabled:opacity-50"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">Choose another source</span>
                  </button>
                )}
                {returnTo && (
                  <IconControl
                    href={returnTo}
                    label="Cancel map creation"
                    tooltip="Cancel map creation"
                    tooltipPlacement="left"
                    onClick={cancelRequirementsRead}
                    disabled={submitting}
                  >
                    <X className="h-[18px] w-[18px]" />
                  </IconControl>
                )}
              </div>
            </div>
          </div>

          {!mode && (
            <div
              className="grid gap-2 px-2 pb-2 sm:grid-cols-2 sm:px-3 sm:pb-3"
              aria-label="Map sources"
            >
              {SOURCE_OPTIONS.map((source) => {
                const SourceIcon = source.icon;
                return (
                  <button
                    key={source.method}
                    type="button"
                    onClick={() => chooseSource(source.method)}
                    className="group flex min-h-40 min-w-0 flex-col rounded-lg bg-[var(--background)] p-4 text-left transition-colors hover:bg-[var(--surface-raised)] focus:relative sm:p-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--background)]"
                        style={{ color: source.color }}
                      >
                        <SourceIcon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <span className="font-utility rounded border border-[var(--border)] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                        {source.detail}
                      </span>
                    </div>
                    <span className="font-display mt-4 text-lg font-bold">{source.title}</span>
                    <span className="mt-2 max-w-sm text-sm leading-6 text-[var(--muted-foreground)]">
                      {source.description}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {mode && mode !== "template" && (
            <div className="px-5 py-6 sm:px-7 sm:py-8">
              {settingsStatus === "loading" && (
                <p className="text-sm text-[var(--muted-foreground)]" role="status">
                  Checking AI setup...
                </p>
              )}

              {settingsStatus === "error" && (
                <div
                  className="rounded-lg border border-[var(--danger-border)] bg-[var(--danger-surface)] p-5"
                  role="alert"
                >
                  <p className="text-sm text-[var(--danger)]">
                    StackHatch could not check your Anthropic setup.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSettingsRetry((attempt) => attempt + 1)}
                    className="mt-3 min-h-11 rounded-md border border-[var(--danger-border)] px-4 py-2 text-sm font-semibold"
                  >
                    Retry setup check
                  </button>
                </div>
              )}

              {settingsStatus === "missing-key" && (
                <section className="rounded-lg border border-[var(--warning-border)] bg-[var(--warning-surface)] p-5">
                  <KeyRound className="h-5 w-5 text-[var(--color-data)]" aria-hidden="true" />
                  <h2 className="mt-3 font-semibold">Connect Anthropic first</h2>
                  <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--muted-foreground)]">
                    This source uses your Anthropic API key. After setup, you will return to this
                    source with the valid context preserved.
                  </p>
                  <Link
                    href={setupHref}
                    className="mt-4 inline-flex min-h-11 items-center rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)]"
                  >
                    Add Anthropic key
                  </Link>
                </section>
              )}

              {settingsStatus === "ready" && mode === "blank" && (
                <section className="max-w-xl rounded-lg border border-[var(--border)] bg-[var(--background)] p-5 sm:p-6">
                  <h2 className="font-semibold">Empty architecture canvas</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                    Create one separate map with no nodes or connections. No Anthropic key is
                    required.
                  </p>
                  <button
                    type="button"
                    onClick={() => void createBlankProject(true)}
                    disabled={submitting}
                    className="mt-5 min-h-11 rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)] disabled:opacity-50"
                  >
                    {blankButtonLabel}
                  </button>
                </section>
              )}

              {settingsStatus === "ready" && mode === "requirements" && (
                <section className="max-w-xl rounded-lg border border-[var(--border)] bg-[var(--background)] p-5 sm:p-6">
                  <h2 className="font-semibold">Choose your requirements file</h2>
                  <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
                    The first non-empty Markdown heading becomes the map name. You can rename it
                    later.
                  </p>
                  <label className="mt-5 inline-flex min-h-11 cursor-pointer items-center rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
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

              {settingsStatus === "ready" && mode === "repository" && (
                <form
                  onSubmit={handleRepositorySubmit}
                  className="max-w-xl rounded-lg border border-[var(--border)] bg-[var(--background)] p-5 sm:p-6"
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
                    className="mt-2 min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-50"
                  />
                  <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">
                    Public repositories only. Analysis runs with your Anthropic API key.
                  </p>
                  <button
                    type="submit"
                    disabled={submitting || !repoUrl.trim()}
                    className="mt-5 min-h-11 w-full rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)] disabled:opacity-50"
                  >
                    {submitting ? "Creating map..." : "Map repository"}
                  </button>
                </form>
              )}

              {error && (
                <div
                  className="mt-5 flex max-w-xl items-start gap-2 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-surface)] p-4 text-sm text-[var(--danger)]"
                  role="alert"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              {submitting && (
                <p className="sr-only" role="status">
                  Creating your map
                </p>
              )}
            </div>
          )}
        </section>
      </main>

      {mode === "template" && (
        <TemplatePicker
          onSelectTemplate={(template) => void createFromTemplate(template)}
          onCancel={() => {
            if (returnTo) router.push(returnTo);
            else chooseAnotherSource();
          }}
          busyTemplateId={submitting ? selectedTemplate?.id : null}
          selectionError={error}
          onRetrySelection={
            selectedTemplate ? () => void createFromTemplate(selectedTemplate) : undefined
          }
          emptyStateHref={chooserPath}
        />
      )}
    </div>
  );
}
