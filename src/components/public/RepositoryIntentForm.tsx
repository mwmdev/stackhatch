"use client";

import { FormEvent, useId, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { parseGitHubRepoReference } from "@/lib/github-analyzer";
import { trackEvent } from "@/lib/analytics";

export function normalizePublicGitHubRepository(value: string): string | null {
  return parseGitHubRepoReference(value)?.slug ?? null;
}

interface RepositoryIntentFormProps {
  location: "hero" | "final" | "demo";
  compact?: boolean;
}

export default function RepositoryIntentForm({
  location,
  compact = false,
}: RepositoryIntentFormProps) {
  const router = useRouter();
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const [repository, setRepository] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizePublicGitHubRepository(repository);
    if (!normalized) {
      setError("Enter a public GitHub repository as github.com/owner/repo or owner/repo.");
      trackEvent("repository_intent_submitted", {
        location,
        error_category: "invalid_url",
      });
      return;
    }

    setError(null);
    trackEvent("repository_intent_submitted", { location });
    const callbackUrl = `/app?repo=${encodeURIComponent(normalized)}`;
    router.push(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="w-full" data-repository-form={location} noValidate>
      <label htmlFor={inputId} className="sr-only">
        Public GitHub repository
      </label>
      <div className={compact ? "repo-form repo-form-compact" : "repo-form"}>
        <input
          id={inputId}
          type="text"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={repository}
          onChange={(event) => {
            setRepository(event.target.value);
            if (error) setError(null);
          }}
          placeholder="github.com/owner/repo"
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          className="repo-input"
        />
        <button type="submit" className="repo-submit">
          <span>{compact ? "Map repository" : "Map this repository"}</span>
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
    </form>
  );
}
