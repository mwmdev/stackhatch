"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { parseGitHubRepoReference } from "@/lib/github-analyzer";
import {
  LOCAL_FOLDER_PICKER_ID,
  setPickedLocalFolder,
  setPickedRepository,
} from "@/lib/local-source/folder-session";
import { isLocalSourceSupported } from "@/lib/local-source/support";
import { buildProjectStartPath, markProjectStart } from "@/lib/project-start";
import { useHydrated } from "@/lib/use-hydrated";
import styles from "./landing.module.css";

const ERROR_ID = "hero-repo-error";

/**
 * The hero's starts. A repository goes to the New map page pre-filled in the address fragment;
 * a local folder is picked here and reviewed there; nothing is sent until the visitor approves.
 * "Start a blank map" marks a one-time blank start, which the New map page creates straight away.
 */
export default function HeroStart() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [error, setError] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const localSupported = hydrated && isLocalSourceSupported();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("repo");
    const reference = parseGitHubRepoReference(typeof value === "string" ? value : "");
    if (!reference) {
      setError("Enter owner/repo or a github.com repository link.");
      return;
    }
    setError(null);
    setPickedRepository(reference.shorthand);
    router.push(buildProjectStartPath("repository", { repository: reference.shorthand }));
  };

  const chooseFolder = () => {
    // The picker is the first call so the click still counts as user activation.
    const picking = window.showDirectoryPicker?.({ id: LOCAL_FOLDER_PICKER_ID, mode: "read" });
    if (!picking) return;
    setLocalError(null);
    void picking.then(
      (handle) => {
        setPickedLocalFolder(handle);
        router.push("/project/new");
      },
      (failure) => {
        if (failure instanceof DOMException && failure.name === "AbortError") return;
        setLocalError(
          "StackHatch could not open that folder. Check the browser's permission and try again."
        );
      }
    );
  };

  return (
    <div className={styles.actions}>
      <form noValidate onSubmit={submit} className={styles.repo}>
        <label htmlFor="hero-repo" className="sr-only">
          GitHub repository
        </label>
        <div className={styles.repoRow}>
          <input
            id="hero-repo"
            name="repo"
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="owner/repo or GitHub link"
            className={`field-input ${styles.repoInput}`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? ERROR_ID : undefined}
            onChange={() => setError(null)}
          />
          <button type="submit" className="btn btn--primary btn--lg">
            Map repository
          </button>
        </div>
        {error ? (
          <p id={ERROR_ID} className="field-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
      <span className={styles.alt}>
        <span className={styles.or} aria-hidden="true">
          or
        </span>
        <span className={styles.localStart}>
          <button
            type="button"
            className="btn btn--lg"
            disabled={hydrated && !localSupported}
            aria-describedby={hydrated && !localSupported ? "hero-local-note" : undefined}
            onClick={chooseFolder}
          >
            Choose local folder
          </button>
          {hydrated && !localSupported ? (
            <span id="hero-local-note" className={styles.localNote}>
              Needs a desktop browser that can open folders.
            </span>
          ) : null}
          {localError ? (
            <span className="field-error" role="alert">
              {localError}
            </span>
          ) : null}
        </span>
      </span>
      <span className={styles.alt}>
        <span className={styles.or} aria-hidden="true">
          or
        </span>
        <Link
          href={buildProjectStartPath("blank")}
          className="btn btn--lg"
          onClick={() => markProjectStart("blank")}
        >
          Start a blank map
        </Link>
      </span>
    </div>
  );
}
