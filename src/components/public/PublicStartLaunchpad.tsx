"use client";

import { FormEvent, useId, useState } from "react";
import { FileText, FolderPlus, GitBranch, LayoutTemplate } from "lucide-react";
import { useRouter } from "next/navigation";
import { parseGitHubRepoReference } from "@/lib/github-analyzer";
import { trackEvent } from "@/lib/analytics";
import {
  buildProjectStartLoginUrl,
  markProjectStart,
  type ProjectStartMethod,
} from "@/lib/project-start";
import styles from "../../app/landing.module.css";

function recordStart(method: ProjectStartMethod) {
  markProjectStart(method);
  trackEvent("project_start_selected", { location: "launchpad", start_method: method });
}

export default function PublicStartLaunchpad() {
  const router = useRouter();
  const repositoryId = useId();
  const errorId = `${repositoryId}-error`;
  const [repository, setRepository] = useState("");
  const [error, setError] = useState("");

  function openStart(method: Exclude<ProjectStartMethod, "repository">) {
    recordStart(method);
    router.push(buildProjectStartLoginUrl(method));
  }

  function handleRepository(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseGitHubRepoReference(repository);
    if (!parsed) {
      setError("Enter a public GitHub repository as owner/repo or a full GitHub URL.");
      trackEvent("repository_intent_submitted", {
        location: "launchpad",
        error_category: "invalid_url",
      });
      return;
    }

    setError("");
    recordStart("repository");
    trackEvent("repository_intent_submitted", {
      location: "launchpad",
      start_method: "repository",
    });
    router.push(buildProjectStartLoginUrl("repository", parsed.slug));
  }

  return (
    <div className={styles.startLaunchpad} role="group" aria-label="Ways to start a StackHatch map">
      <article className={`${styles.startCell} ${styles.startCellBlank}`}>
        <div className={styles.startCellHeading}>
          <FolderPlus aria-hidden="true" />
        </div>
        <h3>Start fresh</h3>
        <p>Open a blank canvas and shape the architecture yourself. No API key needed.</p>
        <button type="button" className={styles.startAction} onClick={() => openStart("blank")}>
          Open blank canvas
        </button>
      </article>

      <article className={`${styles.startCell} ${styles.startCellRequirements}`}>
        <div className={styles.startCellHeading}>
          <FileText aria-hidden="true" />
        </div>
        <h3>Upload requirements</h3>
        <p>Bring a Markdown or text brief and turn it into a map you can refine.</p>
        <button
          type="button"
          className={styles.startAction}
          onClick={() => openStart("requirements")}
        >
          Upload .md or .txt
        </button>
      </article>

      <article className={`${styles.startCell} ${styles.startCellRepository}`}>
        <div className={styles.startCellHeading}>
          <GitBranch aria-hidden="true" />
        </div>
        <h3>Map a repo</h3>
        <p>Scan a public GitHub repository and see its components and connections.</p>
        <form onSubmit={handleRepository} className={styles.startRepoForm} noValidate>
          <label htmlFor={repositoryId} className={styles.srOnly}>
            Public GitHub repository
          </label>
          <input
            id={repositoryId}
            value={repository}
            onChange={(event) => {
              setRepository(event.target.value);
              if (error) setError("");
            }}
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="github.com/owner/repo"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
          <button type="submit">Map repository</button>
        </form>
        {error && (
          <p id={errorId} className={styles.startError} role="alert">
            {error}
          </p>
        )}
      </article>

      <article className={`${styles.startCell} ${styles.startCellTemplate}`}>
        <div className={styles.startCellHeading}>
          <LayoutTemplate aria-hidden="true" />
        </div>
        <h3>Use a template</h3>
        <p>Reuse a saved architecture map and start with the decisions that already fit.</p>
        <button type="button" className={styles.startAction} onClick={() => openStart("template")}>
          Choose a template
        </button>
      </article>

      <div className={styles.startOutput} aria-hidden="true">
        <span className={styles.startOutputPorts}>
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className={styles.startOutputLine} />
        <span className={styles.startOutputNode}>One architecture map</span>
      </div>
    </div>
  );
}
