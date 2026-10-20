"use client";

import { useEffect, useId, useState, type RefObject } from "react";
import {
  GITHUB_CREDENTIAL_ID,
  GITHUB_TOKEN_PREFIX,
  githubTokenCreationUrl,
  githubTokenShapeError,
} from "@/lib/github-token";
import {
  getBrowserProviderKeyManager,
  type GitHubTokenStatus,
  type ProviderKeyManager,
} from "@/lib/provider-key";
import { KeyStateChip } from "./ProviderKeyField";

export interface GitHubTokenFieldProps {
  keyManager?: ProviderKeyManager;
  /** Repository owner the create-token link pre-fills. */
  owner?: string | null;
  /** Show the state chip and its sentence above the field (Settings). */
  showState?: boolean;
  /** Offer "Forget token" while a token is set. */
  allowForget?: boolean;
  /** Called after the token is set or forgotten. */
  onChange?: (status: GitHubTokenStatus, change: "set" | "forgotten") => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}

const STATE_SENTENCES: Record<GitHubTokenStatus["state"], string> = {
  remembered: "Stored on this device until you forget it.",
  session: "Forgotten when this browser session ends.",
  absent: "Only needed for private repositories.",
};

export function GitHubTokenCreateLink({ owner }: { owner?: string | null }) {
  return (
    <a
      href={githubTokenCreationUrl(owner)}
      target="_blank"
      rel="noreferrer"
      className="link type-small font-bold"
    >
      {owner ? `Create a read-only token for ${owner}` : "Create a read-only GitHub token"}
    </a>
  );
}

/** The remember opt-in shared by every place a GitHub token is entered. */
export function GitHubTokenRemember({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="field-check">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <strong>Remember on this device.</strong>{" "}
        <span className="type-small text-ink2">
          Only on a device you trust: extensions, same-origin scripts and anyone using this device
          could read it. Never included in backups.
        </span>
      </span>
    </label>
  );
}

/**
 * Enters, replaces, or forgets the GitHub token that lets scans read private
 * repositories. The token is held like an AI key: for this session unless the
 * user chooses to remember it.
 */
export default function GitHubTokenField({
  keyManager,
  owner,
  showState = false,
  allowForget = true,
  onChange,
  inputRef,
}: GitHubTokenFieldProps) {
  const inputId = useId();
  const errorId = useId();
  const [manager] = useState(() => keyManager ?? getBrowserProviderKeyManager());
  const [status, setStatus] = useState<GitHubTokenStatus | null>(null);
  const [value, setValue] = useState("");
  const [remember, setRemember] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void manager.getStatus(GITHUB_CREDENTIAL_ID).then(
      (next) => {
        if (!cancelled) setStatus(next);
      },
      () => {
        // An unreadable credential store reads as "no token"; saving reports the failure.
        if (!cancelled)
          setStatus({ provider: GITHUB_CREDENTIAL_ID, state: "absent", generation: "" });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [manager]);

  async function save() {
    const token = value.trim();
    if (!token || saving) return;
    const shapeError = githubTokenShapeError(token);
    if (shapeError) {
      setError(shapeError);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const next = remember
        ? await manager.rememberKey(GITHUB_CREDENTIAL_ID, token)
        : await manager.useSessionKey(GITHUB_CREDENTIAL_ID, token);
      setStatus(next);
      setValue("");
      onChange?.(next, "set");
    } catch {
      setError("That token could not be stored on this device. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function forget() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const next = await manager.forgetKey(GITHUB_CREDENTIAL_ID);
      setStatus(next);
      setValue("");
      onChange?.(next, "forgotten");
    } catch {
      setError("The token could not be forgotten. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!status) return null;
  const tokenSet = status.state !== "absent";

  return (
    <div className="min-w-0">
      {showState ? (
        <div className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <KeyStateChip
            state={status.state}
            absentLabel="No token"
            data-testid={`github-token-status-${status.state}`}
          />
          <span className="type-small text-ink2">{STATE_SENTENCES[status.state]}</span>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <label htmlFor={inputId} className="sr-only">
          GitHub token
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void save();
            }
          }}
          placeholder={`${GITHUB_TOKEN_PREFIX}…`}
          disabled={saving}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="field-input field-input--mono min-w-0 flex-[1_1_12rem]"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !value.trim()}
          className="btn"
        >
          {saving ? "Saving..." : tokenSet ? "Replace token" : "Use token"}
        </button>
        {tokenSet && allowForget ? (
          <button
            type="button"
            onClick={() => void forget()}
            disabled={saving}
            className="btn btn--quiet"
          >
            Forget token
          </button>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="mt-2.5 mb-3">
        <GitHubTokenCreateLink owner={owner} />
      </p>
      <GitHubTokenRemember checked={remember} onChange={setRemember} disabled={saving} />
    </div>
  );
}
