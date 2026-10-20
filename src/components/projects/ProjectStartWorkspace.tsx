"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, FileText, GitBranch, KeyRound, Scan } from "lucide-react";
import AppPageShell from "@/components/shells/AppPageShell";
import { GitHubTokenCreateLink, GitHubTokenRemember } from "@/components/projects/GitHubTokenField";
import ProviderKeyField, { KeyStateChip } from "@/components/projects/ProviderKeyField";
import { buildLocalProjectPath } from "@/lib/app-route";
import { parseGitHubRepoReference } from "@/lib/github-analyzer";
import {
  GITHUB_CREDENTIAL_ID,
  GITHUB_TOKEN_PREFIX,
  githubTokenShapeError,
} from "@/lib/github-token";
import {
  consumeBlankAutoCreateIntent,
  markProjectStart,
  projectStartMethodFromPath,
  repositoryFromProjectStartPath,
  returnPathFromProjectStartPath,
  type ProjectStartMethod,
} from "@/lib/project-start";
import {
  getBrowserProviderKeyManager,
  type GitHubTokenStatus,
  type ProviderKeyManager,
  type ProviderKeyStatus,
} from "@/lib/provider-key";
import {
  isAcceptedRequirementsFile,
  MAX_REQUIREMENTS_CHARACTERS,
  MAX_REQUIREMENTS_FILE_BYTES,
} from "@/lib/requirements-file";
import { getBrowserWorkspaceVault, type WorkspaceVault } from "@/lib/vault/workspace";
import { AI_PROVIDERS, DEFAULT_AI_SELECTION, type AiProviderId } from "@/lib/ai/providers";

interface ProjectStartWorkspaceProps {
  initialMode: ProjectStartMethod | null;
  vault?: WorkspaceVault;
  keyManager?: ProviderKeyManager;
}

interface ProjectPayload {
  name: string;
  description?: string;
  repoUrl?: string;
}

/** What a start is good for, under its description. */
function UseCases({ items }: { items: readonly string[] }) {
  const labelId = useId();
  return (
    <div className="mt-[18px]">
      <p id={labelId} className="type-label m-0 text-ink">
        Good for
      </p>
      <ul
        aria-labelledby={labelId}
        className="m-0 mt-1.5 flex list-[square] flex-col gap-1 pl-[1.15em] text-[14.5px] text-ink marker:text-ink2"
      >
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/** Which start raised the error, so the message renders next to its cause. */
type ErrorSource = "blank" | "requirements" | "repository" | "key" | "token";

export function projectNameFromRequirements(requirements: string) {
  const firstLine = requirements.split("\n").find((line) => line.trim());
  return (
    firstLine
      ?.replace(/^#{1,6}\s+/, "")
      .trim()
      .slice(0, 80) || "Untitled map"
  );
}

export default function ProjectStartWorkspace({
  initialMode,
  vault,
  keyManager,
}: ProjectStartWorkspaceProps) {
  const router = useRouter();
  const [workspaceVault] = useState(() => vault ?? getBrowserWorkspaceVault());
  const [providerKeyManager] = useState(() => keyManager ?? getBrowserProviderKeyManager());
  // Null until the selected provider's key status is read, so the key strip never flashes the wrong state.
  const [keyStatus, setKeyStatus] = useState<ProviderKeyStatus | null>(null);
  const keySetupHeadingRef = useRef<HTMLHeadingElement>(null);
  const [mode, setMode] = useState<ProjectStartMethod | null>(initialMode);
  const [repoUrl, setRepoUrl] = useState("");
  // Absent until read; a set token replaces the disclosure with its status.
  const [githubToken, setGitHubToken] = useState<GitHubTokenStatus | null>(null);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [tokenValue, setTokenValue] = useState("");
  const [rememberToken, setRememberToken] = useState(false);
  const tokenRegionId = useId();
  const [returnPath, setReturnPath] = useState<string | null>(null);
  const [error, setErrorState] = useState<{ source: ErrorSource; message: string } | null>(null);
  const [navigationRecoveryPath, setNavigationRecoveryPath] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [blankAttempted, setBlankAttempted] = useState(false);
  const modeHeadingRef = useRef<HTMLHeadingElement>(null);
  const blankAutoCreateAttempted = useRef(false);
  const recordedSelection = useRef<ProjectStartMethod | null>(null);
  const submissionInFlight = useRef(false);
  const requirementsReadGeneration = useRef(0);
  const activeRequirementsReader = useRef<FileReader | null>(null);

  function setError(source: ErrorSource, message: string) {
    setErrorState({ source, message });
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let provider: AiProviderId = DEFAULT_AI_SELECTION.provider;
      try {
        provider = (await workspaceVault.getAiSelection()).provider;
      } catch {
        // An unreadable preference falls back to the default provider.
      }
      let status: ProviderKeyStatus;
      try {
        status = await providerKeyManager.getStatus(provider);
      } catch {
        status = { provider, state: "absent", generation: "" };
      }
      // The key field may already have reported a newer status.
      if (!cancelled) setKeyStatus((current) => current ?? status);
      let token: GitHubTokenStatus;
      try {
        token = await providerKeyManager.getStatus(GITHUB_CREDENTIAL_ID);
      } catch {
        token = { provider: GITHUB_CREDENTIAL_ID, state: "absent", generation: "" };
      }
      if (!cancelled) setGitHubToken(token);
    })();
    return () => {
      cancelled = true;
    };
  }, [providerKeyManager, workspaceVault]);

  // A start that found no key at submit time moves focus to the key form below the starts.
  useEffect(() => {
    if (error?.source === "key" && keyStatus?.state === "absent") {
      keySetupHeadingRef.current?.focus();
    }
  }, [error, keyStatus]);

  async function requireProviderKey() {
    // The key field can switch providers, so the selection is read per check.
    let provider: AiProviderId;
    try {
      provider = (await workspaceVault.getAiSelection()).provider;
    } catch {
      setError("key", "The AI provider setting could not be read on this device. Try again.");
      return false;
    }
    let status: ProviderKeyStatus;
    try {
      status = await providerKeyManager.getStatus(provider);
    } catch {
      status = { provider, state: "absent", generation: "" };
    }
    setKeyStatus(status);
    if (status.state === "absent") {
      setError("key", "Add an AI provider key to generate this map.");
      return false;
    }
    return true;
  }

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
    setErrorState(null);
    setNavigationRecoveryPath(null);
    setBlankAttempted(false);
    blankAutoCreateAttempted.current = false;
    recordedSelection.current = null;
  }, [initialMode]);

  useEffect(() => () => cancelRequirementsRead(), [cancelRequirementsRead]);

  useEffect(() => {
    if (!mode) return;
    modeHeadingRef.current?.focus();
  }, [mode]);

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
      setErrorState(null);
      let createdPath: string | null = null;
      try {
        const project = await workspaceVault.createProject({
          name: payload.name,
          description: payload.description ?? null,
          repoUrl: payload.repoUrl ?? null,
          canvasState: null,
        });
        createdPath = buildLocalProjectPath(project.id);
        setNavigationRecoveryPath(createdPath);
        router.push(createdPath);
        return true;
      } catch {
        // Storage and navigation failures surface under "Create blank map",
        // the one start that needs nothing but browser storage.
        setErrorState({
          source: "blank",
          message: createdPath
            ? "The map was saved on this device, but navigation did not complete."
            : "The map could not be saved to browser storage. Check storage permissions, then retry.",
        });
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
      return createProject({ name: "Untitled map" });
    },
    [createProject, recordStartSelection]
  );

  useEffect(() => {
    if (mode !== "blank" || blankAutoCreateAttempted.current) return;
    blankAutoCreateAttempted.current = true;
    if (consumeBlankAutoCreateIntent()) void createBlankProject(false);
  }, [createBlankProject, mode]);

  async function handleRequirementsFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isAcceptedRequirementsFile(file)) {
      setError("requirements", "Choose a Markdown (.md) or text (.txt) requirements file.");
      return;
    }
    if (file.size > MAX_REQUIREMENTS_FILE_BYTES) {
      setError(
        "requirements",
        "The requirements file is too large. Choose a file no larger than 1 MB."
      );
      return;
    }
    if (!(await requireProviderKey())) return;

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
        setError(
          "requirements",
          "The requirements file is empty. Choose a file with project details."
        );
        return;
      }
      if (requirements.length > MAX_REQUIREMENTS_CHARACTERS) {
        setError(
          "requirements",
          "The requirements file is too large. Choose a file no larger than 1 MB."
        );
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
      setError("requirements", "The requirements file could not be read. Try another file.");
    };
    reader.readAsText(file);
  }

  async function handleRepositorySubmit(event: React.FormEvent) {
    event.preventDefault();
    const repository = parseGitHubRepoReference(repoUrl);
    if (!repository) {
      setError("repository", "Enter a GitHub repository as owner/repo or a full GitHub URL.");
      return;
    }
    const token = tokenOpen ? tokenValue.trim() : "";
    const shapeError = token ? githubTokenShapeError(token) : null;
    if (shapeError) {
      setError("token", shapeError);
      return;
    }
    if (!(await requireProviderKey())) return;
    // The token is in place before the map exists, so its first scan uses it.
    if (token) {
      try {
        const next = rememberToken
          ? await providerKeyManager.rememberKey(GITHUB_CREDENTIAL_ID, token)
          : await providerKeyManager.useSessionKey(GITHUB_CREDENTIAL_ID, token);
        setGitHubToken(next);
        setTokenValue("");
      } catch {
        setError("token", "That token could not be stored on this device. Try again.");
        return;
      }
    }
    recordStartSelection("repository");
    void createProject({ name: repository.repo, repoUrl: repository.normalizedUrl });
  }

  const blankAttemptFailed = blankAttempted && Boolean(error);
  let blankButtonLabel = "Create blank map";
  if (submitting) blankButtonLabel = "Creating map...";
  else if (blankAttemptFailed) blankButtonLabel = "Retry blank map";

  const errorFor = (source: ErrorSource) => (error?.source === source ? error.message : "");
  const repositoryError = errorFor("repository");
  const tokenError = errorFor("token");
  const blankError = errorFor("blank") ? (
    <p className="field-error m-0" role="alert">
      {errorFor("blank")}
      {navigationRecoveryPath ? (
        <>
          {" "}
          <Link href={navigationRecoveryPath} className="font-bold underline underline-offset-2">
            Open the saved map
          </Link>
        </>
      ) : null}
    </p>
  ) : null;
  const keyError = errorFor("key") ? (
    <p className="field-error mt-0 mb-3" role="alert">
      {errorFor("key")}
    </p>
  ) : null;
  // The ochre bracket sets the key apart from the content above it.
  const keyBracket = (
    <span
      className="pointer-events-none absolute -top-0.5 right-0 left-0 h-2.5 border-2 border-b-0 border-primary"
      aria-hidden="true"
    />
  );

  const optionClass =
    "relative flex min-w-0 flex-col py-8 lg:min-h-[300px] lg:pt-[34px] lg:pb-[30px] max-lg:[&+&]:border-t-[1.5px] lg:[&+&]:border-l-[1.5px] border-column-rule lg:pr-[34px] lg:[&+&]:pl-[34px] lg:[&+&]:before:absolute lg:[&+&]:before:top-1/2 lg:[&+&]:before:left-0 lg:[&+&]:before:-translate-x-1/2 lg:[&+&]:before:-translate-y-1/2 lg:[&+&]:before:bg-[var(--bg)] lg:[&+&]:before:px-1 lg:[&+&]:before:py-1.5 lg:[&+&]:before:type-small lg:[&+&]:before:text-ink2 lg:[&+&]:before:content-['or']";

  return (
    <AppPageShell
      current="new"
      flush
      title={
        <span ref={modeHeadingRef} id="project-start-title" tabIndex={-1} className="outline-none">
          Start a new map
        </span>
      }
      titleActions={
        <a
          href={returnPath ?? "/app/maps"}
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
          className="btn btn--quiet aria-disabled:pointer-events-none"
        >
          Cancel
        </a>
      }
    >
      <section aria-labelledby="project-start-title" className="page-gutter pb-12">
        {keyStatus ? (
          <>
            <div className="grid lg:grid-cols-3">
              <div className={optionClass}>
                <Scan
                  className="mb-[22px] size-[34px] text-ink2"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <h3 className="type-option-title m-0">Blank canvas</h3>
                <p className="mt-2.5 max-w-[320px] text-[14.5px] text-ink2">
                  Shape the architecture yourself, or with the assistant.
                </p>
                <UseCases
                  items={[
                    "Brainstorming ideas",
                    "Starting a project from scratch",
                    "Iterating on a design with the assistant",
                  ]}
                />
                <div className="mt-auto flex flex-col gap-2.5 pt-[26px]">
                  <button
                    type="button"
                    onClick={() => void createBlankProject(true)}
                    disabled={submitting}
                    className="btn btn--primary btn--lg btn--block"
                  >
                    {blankButtonLabel}
                  </button>
                  {blankError}
                </div>
              </div>

              <div className={optionClass}>
                <FileText
                  className="mb-[22px] size-[34px] text-ink2"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <h3 className="type-option-title m-0">Requirements file</h3>
                <p className="mt-2.5 max-w-[320px] text-[14.5px] text-ink2">
                  A Markdown or text brief. Its first heading names the map.
                </p>
                <UseCases items={["Turning a brief, PRD or spec you already have into a map"]} />
                <div className="mt-auto flex flex-col gap-2.5 pt-[26px]">
                  <label className="btn btn--lg btn--block cursor-pointer has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-45 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring">
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
                  {errorFor("requirements") ? (
                    <p className="field-error m-0" role="alert">
                      {errorFor("requirements")}
                    </p>
                  ) : null}
                </div>
              </div>

              <form onSubmit={handleRepositorySubmit} className={optionClass}>
                <GitBranch
                  className="mb-[22px] size-[34px] text-ink2"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <label htmlFor="new-project-repository" className="type-option-title block">
                  GitHub repository
                </label>
                <p className="mt-2.5 max-w-[320px] text-[14.5px] text-ink2">
                  Reads bounded evidence from GitHub, then drafts a map.
                </p>
                <UseCases
                  items={[
                    "Seeing how an open-source app is structured",
                    "Mapping a private codebase with a read-only token",
                  ]}
                />
                <div className="mt-auto flex flex-col gap-2.5 pt-[26px]">
                  <div className="field">
                    <span className="field-label" aria-hidden="true">
                      Repository
                    </span>
                    <input
                      id="new-project-repository"
                      type="text"
                      inputMode="url"
                      autoComplete="off"
                      spellCheck={false}
                      value={repoUrl}
                      onChange={(event) => setRepoUrl(event.target.value)}
                      placeholder="owner/repo"
                      disabled={submitting}
                      aria-invalid={repositoryError ? true : undefined}
                      aria-describedby={
                        repositoryError ? "new-project-repository-error" : undefined
                      }
                      className="field-input field-input--mono"
                    />
                    {repositoryError ? (
                      <p id="new-project-repository-error" className="field-error" role="alert">
                        {repositoryError}
                      </p>
                    ) : null}
                  </div>
                  {githubToken && githubToken.state !== "absent" ? (
                    <p className="type-small m-0 flex flex-wrap items-center gap-2.5 text-ink2">
                      <span className="font-bold text-ink">GitHub token</span>
                      <KeyStateChip state={githubToken.state} />
                      <Link href="/settings#github-token" className="link">
                        Change in Settings
                      </Link>
                    </p>
                  ) : (
                    <>
                      <button
                        type="button"
                        aria-expanded={tokenOpen}
                        aria-controls={tokenRegionId}
                        onClick={() => setTokenOpen((open) => !open)}
                        disabled={submitting}
                        className="type-small inline-flex min-h-6 items-center gap-1.5 self-start font-bold text-ink2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-45"
                      >
                        <ChevronRight
                          aria-hidden="true"
                          className={`size-4 transition-transform duration-120 ${tokenOpen ? "rotate-90" : ""}`}
                        />
                        Private repository? Add a GitHub token
                      </button>
                      {tokenOpen ? (
                        <div id={tokenRegionId} className="flex flex-col gap-2.5">
                          <div className="field">
                            <label htmlFor="new-project-github-token" className="field-label">
                              GitHub token
                            </label>
                            <input
                              id="new-project-github-token"
                              type="password"
                              autoComplete="off"
                              spellCheck={false}
                              value={tokenValue}
                              onChange={(event) => {
                                setTokenValue(event.target.value);
                                setErrorState((current) =>
                                  current?.source === "token" ? null : current
                                );
                              }}
                              placeholder={`${GITHUB_TOKEN_PREFIX}…`}
                              disabled={submitting}
                              aria-invalid={tokenError ? true : undefined}
                              aria-describedby={
                                tokenError ? "new-project-github-token-error" : undefined
                              }
                              className="field-input field-input--mono"
                            />
                            {tokenError ? (
                              <p
                                id="new-project-github-token-error"
                                className="field-error"
                                role="alert"
                              >
                                {tokenError}
                              </p>
                            ) : null}
                          </div>
                          <p className="m-0">
                            <GitHubTokenCreateLink
                              owner={parseGitHubRepoReference(repoUrl)?.owner}
                            />
                          </p>
                          <GitHubTokenRemember
                            checked={rememberToken}
                            onChange={setRememberToken}
                            disabled={submitting}
                          />
                        </div>
                      ) : null}
                    </>
                  )}
                  <button
                    type="submit"
                    disabled={submitting || !repoUrl.trim()}
                    className="btn btn--lg btn--block"
                  >
                    {submitting ? "Creating map..." : "Map repository"}
                  </button>
                </div>
              </form>
            </div>

            <div className="border-t-2 border-ink">
              <div className="relative bg-paper px-5 pt-[22px] pb-[26px] lg:px-[34px]">
                {keyBracket}
                {keyError}
                {keyStatus.state === "absent" ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <KeyRound className="size-[18px] flex-none text-ink2" aria-hidden="true" />
                      <h2
                        ref={keySetupHeadingRef}
                        id="project-start-key-setup"
                        tabIndex={-1}
                        className="type-subhead m-0 outline-none"
                      >
                        Connect an AI provider
                      </h2>
                    </div>
                    <div className="mt-4">
                      <ProviderKeyField
                        keyManager={providerKeyManager}
                        aiSettings={workspaceVault}
                        heading={false}
                        labelledBy="project-start-key-setup"
                        onReady={(status) => {
                          setKeyStatus(status);
                          setErrorState((current) => (current?.source === "key" ? null : current));
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <div role="group" aria-labelledby="project-start-key-title">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <KeyRound className="size-[18px] flex-none text-ink2" aria-hidden="true" />
                      <p id="project-start-key-title" className="type-subhead m-0">
                        {AI_PROVIDERS[keyStatus.provider].name} key
                      </p>
                      <KeyStateChip state={keyStatus.state} />
                    </div>
                    <p className="type-small mt-2.5 mb-0 text-ink2">
                      The assistant and requirements and repository maps use it. Change or forget it
                      in{" "}
                      <Link href="/settings#api-key" className="link">
                        Settings
                      </Link>
                      .
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}
        {submitting && (
          <p className="sr-only" role="status">
            Creating your map
          </p>
        )}
      </section>
    </AppPageShell>
  );
}
