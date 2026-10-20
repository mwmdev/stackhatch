"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { parseGitHubRepoReference } from "@/lib/github-analyzer";
import { buildProjectStartPath, markProjectStart } from "@/lib/project-start";
import styles from "./landing.module.css";

const ERROR_ID = "hero-repo-error";

/**
 * The hero's two starts. A repository goes to the New map page pre-filled in the address fragment;
 * nothing is fetched until the visitor maps it there. "Start a blank map" marks a one-time blank
 * start, which the New map page turns straight into an empty map.
 */
export default function HeroStart() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("repo");
    const reference = parseGitHubRepoReference(typeof value === "string" ? value : "");
    if (!reference) {
      setError("Enter owner/repo or a github.com repository link.");
      return;
    }
    setError(null);
    router.push(buildProjectStartPath("repository", { repository: reference.slug }));
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
