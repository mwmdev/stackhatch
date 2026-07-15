"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, FileText, GitBranch, KeyRound, LayoutTemplate } from "lucide-react";
import TemplatePicker from "@/components/templates/TemplatePicker";
import { consumeAuthenticationStarted, trackEvent } from "@/lib/analytics";
import { parseGitHubRepoReference } from "@/lib/github-analyzer";
import {
  getPendingProjectStart,
  markProjectStart,
  type ProjectStartMethod,
} from "@/lib/project-start";

interface Template {
  id: string;
  name: string;
  description: string | null;
  canvasState: string;
  createdAt: number;
}

type NewProjectMode = Exclude<ProjectStartMethod, "blank">;
type SettingsStatus = "idle" | "loading" | "ready" | "missing-key" | "error";

const ACCEPTED_REQUIREMENT_FILES = [".md", ".txt"];
const SUPPORTED_MODES = new Set<NewProjectMode>(["requirements", "repository", "template"]);

function isAcceptedRequirementsFile(file: File) {
  const name = file.name.toLowerCase();
  return ACCEPTED_REQUIREMENT_FILES.some((extension) => name.endsWith(extension));
}

function projectNameFromRequirements(requirements: string) {
  const firstLine = requirements.split("\n").find((line) => line.trim());
  return firstLine?.replace(/^#\s*/, "").trim().slice(0, 80) || "Untitled Project";
}

function modePath(mode: NewProjectMode, repoUrl: string) {
  if (mode !== "repository") return `/project/new?mode=${mode}`;
  const repository = parseGitHubRepoReference(repoUrl);
  return repository
    ? `/project/new?mode=repository&repo=${encodeURIComponent(repository.slug)}`
    : "/project/new?mode=repository";
}

export default function NewProjectPage() {
  const router = useRouter();
  const [mode, setMode] = useState<NewProjectMode | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState<SettingsStatus>("idle");
  const [settingsRetry, setSettingsRetry] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedMode = params.get("mode") as NewProjectMode | null;
    if (!requestedMode || !SUPPORTED_MODES.has(requestedMode)) {
      router.replace("/app#start");
      return;
    }

    setMode(requestedMode);
    markProjectStart(requestedMode);
    if (requestedMode === "repository") setRepoUrl(params.get("repo") || "");

    if (consumeAuthenticationStarted()) {
      const startMethod = getPendingProjectStart();
      trackEvent("github_auth_completed", {
        location: "dashboard",
        ...(startMethod ? { start_method: startMethod } : {}),
      });
    }
  }, [router]);

  useEffect(() => {
    if (!mode) return;
    if (mode === "template") {
      setSettingsStatus("ready");
      return;
    }

    let cancelled = false;
    setSettingsStatus("loading");
    setError("");
    fetch("/api/settings")
      .then(async (res) => {
        if (!res.ok) throw new Error("settings");
        return res.json();
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

  const returnPath = useMemo(
    () => (mode ? modePath(mode, repoUrl) : "/project/new"),
    [mode, repoUrl]
  );
  const setupHref = `/settings?setup=anthropic&returnTo=${encodeURIComponent(returnPath)}`;

  const createProject = useCallback(
    async (payload: {
      name: string;
      description?: string;
      repoUrl?: string;
      canvasState?: string;
    }) => {
      setSubmitting(true);
      setError("");
      try {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (data.code === "AI_NOT_CONFIGURED") {
            router.push(setupHref);
            return false;
          }
          setError(data.error || "The project could not be created. Try again.");
          return false;
        }
        router.push(`/project/${data.id}`);
        return true;
      } catch {
        setError("The project could not be created. Check your connection and try again.");
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [router, setupHref]
  );

  function handleRequirementsFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isAcceptedRequirementsFile(file)) {
      setError("Choose a Markdown (.md) or text (.txt) requirements file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const requirements = String(reader.result || "").trim();
      if (!requirements) {
        setError("The requirements file is empty. Choose a file with project details.");
        return;
      }
      void createProject({
        name: projectNameFromRequirements(requirements),
        description: requirements,
      });
    };
    reader.onerror = () => setError("The requirements file could not be read. Try another file.");
    reader.readAsText(file);
  }

  function handleRepositorySubmit(event: React.FormEvent) {
    event.preventDefault();
    const repository = parseGitHubRepoReference(repoUrl);
    if (!repository) {
      setError("Enter a public GitHub repository as owner/repo or a full GitHub URL.");
      return;
    }
    void createProject({ name: repository.repo, repoUrl: repository.normalizedUrl });
  }

  const createFromTemplate = useCallback(
    async (template: Template) => {
      setSelectedTemplate(template);
      await createProject({
        name: `${template.name} – Copy`,
        canvasState: template.canvasState,
      });
    },
    [createProject]
  );

  if (!mode) {
    return (
      <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <p className="sr-only" role="status">
          Returning to start options
        </p>
      </main>
    );
  }

  const modeDetails = {
    requirements: {
      icon: FileText,
      title: "Upload requirements",
      description: "Turn a Markdown or text requirements document into a new architecture map.",
    },
    repository: {
      icon: GitBranch,
      title: "Map a repo",
      description: "Scan a public GitHub repository and make its architecture visible.",
    },
    template: {
      icon: LayoutTemplate,
      title: "Use a template",
      description: "Choose one of your saved maps. StackHatch will create a personal copy.",
    },
  }[mode];
  const ModeIcon = modeDetails.icon;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
        <Link
          href="/app#start"
          className="inline-flex min-h-11 items-center text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          &larr; Back to start options
        </Link>

        <div className="mt-7 flex items-start gap-3">
          <ModeIcon
            className="mt-1 h-6 w-6 flex-none text-[var(--color-client)]"
            aria-hidden="true"
          />
          <div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight">
              {modeDetails.title}
            </h1>
            <p className="mt-2 leading-7 text-[var(--muted-foreground)]">
              {modeDetails.description}
            </p>
          </div>
        </div>

        {settingsStatus === "loading" && (
          <p className="mt-8 text-sm text-[var(--muted-foreground)]" role="status">
            Checking AI setup...
          </p>
        )}

        {settingsStatus === "error" && (
          <div
            className="mt-8 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-surface)] p-5"
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
          <section className="mt-8 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-surface)] p-5">
            <KeyRound className="h-5 w-5 text-[var(--color-data)]" aria-hidden="true" />
            <h2 className="mt-3 font-semibold">Connect Anthropic first</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
              This starting method uses your Anthropic API key. After setup, you will return here
              with your progress preserved.
            </p>
            <Link
              href={setupHref}
              className="mt-4 inline-flex min-h-11 items-center rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)]"
            >
              Add Anthropic key
            </Link>
          </section>
        )}

        {settingsStatus === "ready" && mode === "requirements" && (
          <section className="mt-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
            <h2 className="font-semibold">Choose your requirements file</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
              StackHatch uses the first heading as the map name. You can rename it later.
            </p>
            <label className="mt-5 inline-flex min-h-11 cursor-pointer items-center rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
              {submitting ? "Creating map..." : "Choose .md or .txt file"}
              <input
                type="file"
                accept=".md,.txt,text/markdown,text/plain"
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
            className="mt-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6"
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
              className="mt-2 min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-50"
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

        {error && mode !== "template" && (
          <div
            className="mt-5 flex items-start gap-2 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-surface)] p-4 text-sm text-[var(--danger)]"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {mode === "template" && (
        <TemplatePicker
          onSelectTemplate={(template) => void createFromTemplate(template)}
          onCancel={() => router.push("/app#start")}
          busyTemplateId={submitting ? selectedTemplate?.id : null}
          selectionError={error}
          onRetrySelection={
            selectedTemplate ? () => void createFromTemplate(selectedTemplate) : undefined
          }
          emptyStateHref="/app#start"
        />
      )}
    </main>
  );
}
