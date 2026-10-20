"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { KeyRound } from "lucide-react";
import {
  AI_PROVIDER_IDS,
  AI_PROVIDERS,
  DEFAULT_AI_SELECTION,
  providerKeyShapeError,
  type AiProviderId,
} from "@/lib/ai/providers";
import {
  getBrowserProviderKeyManager,
  type ProviderKeyManager,
  type ProviderKeyStatus,
} from "@/lib/provider-key";
import { getBrowserWorkspaceVault, type WorkspaceVault } from "@/lib/vault/workspace";

export interface ProviderKeyFieldProps {
  keyManager?: ProviderKeyManager;
  aiSettings?: Pick<WorkspaceVault, "getAiSelection" | "selectAiProvider">;
  onReady?: (status: ProviderKeyStatus) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** Render the "{provider} key" heading row. Hosts that already title the
   * block (the AI-setup modal) pass `false` and name the group via `labelledBy`. */
  heading?: boolean;
  /** Element id naming the group when `heading` is false. */
  labelledBy?: string;
}

const KEY_STATE_LABELS: Record<ProviderKeyStatus["state"], string> = {
  absent: "No key",
  session: "This session only",
  remembered: "Remembered on device",
};

/** The small bordered state mark beside every "{provider} key" heading. */
export function KeyStateChip({
  state,
  absentLabel = KEY_STATE_LABELS.absent,
  "data-testid": testId,
}: {
  state: ProviderKeyStatus["state"];
  /** What the chip says when nothing is set, e.g. "No token". */
  absentLabel?: string;
  "data-testid"?: string;
}) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center rounded-control border-[1.5px] px-[7px] py-px text-[12.5px] leading-[1.35] font-bold ${
        state === "absent" ? "border-rule-strong text-ink2" : "border-success text-success"
      }`}
    >
      {state === "absent" ? absentLabel : KEY_STATE_LABELS[state]}
    </span>
  );
}

/**
 * The one piece of setup StackHatch has. It sits on the screen where a map is
 * started because every path used to discover the missing key at dispatch —
 * after a repository had already been scanned — and leaving to fetch one threw
 * that scan away.
 *
 * This is also where consent for the provider lives now: entering a key is the
 * approval for the requests the actions you take will make.
 *
 * It brings no container of its own: the host decides the block it sits in.
 */
export default function ProviderKeyField({
  keyManager,
  aiSettings,
  onReady,
  inputRef,
  heading = true,
  labelledBy,
}: ProviderKeyFieldProps) {
  const inputId = useId();
  const selectId = useId();
  const headingId = useId();
  const errorId = useId();
  const [manager] = useState(() => keyManager ?? getBrowserProviderKeyManager());
  const [settings] = useState(() => aiSettings ?? getBrowserWorkspaceVault());
  const [provider, setProvider] = useState<AiProviderId | null>(null);
  const [status, setStatus] = useState<ProviderKeyStatus | null>(null);
  const [persisted, setPersisted] = useState<AiProviderId | null>(null);
  const [errorTarget, setErrorTarget] = useState<"select" | "input">("input");
  const changeToken = useRef(0);
  const [value, setValue] = useState("");
  const [remember, setRemember] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let selected: AiProviderId = DEFAULT_AI_SELECTION.provider;
      try {
        selected = (await settings.getAiSelection()).provider;
      } catch {
        // An unreadable preference falls back to the default provider.
      }
      let next: ProviderKeyStatus;
      try {
        next = await manager.getStatus(selected);
      } catch {
        // Treat an unreadable credential store as "no key" and let the user try.
        next = { provider: selected, state: "absent", generation: "" };
      }
      if (cancelled) return;
      setProvider(selected);
      setPersisted(selected);
      setStatus(next);
      if (next.state !== "absent") onReadyRef.current?.(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [manager, settings]);

  async function changeProvider(next: AiProviderId) {
    if (saving || next === provider) return;
    const token = ++changeToken.current;
    setError("");
    setErrorTarget("input");
    setValue("");
    setProvider(next);
    let nextStatus: ProviderKeyStatus;
    try {
      nextStatus = await manager.getStatus(next);
    } catch {
      nextStatus = { provider: next, state: "absent", generation: "" };
    }
    if (token !== changeToken.current) return;
    setStatus(nextStatus);
  }

  async function persistProvider(next: AiProviderId): Promise<boolean> {
    if (next === persisted) return true;
    try {
      await settings.selectAiProvider(next);
    } catch {
      setErrorTarget("select");
      setError("The AI provider could not be saved. Try again.");
      return false;
    }
    setPersisted(next);
    return true;
  }

  async function commitProvider() {
    if (saving || !provider || !status || status.state === "absent") return;
    setSaving(true);
    setError("");
    try {
      if (!(await persistProvider(provider))) return;
      onReadyRef.current?.(status);
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    const key = value.trim();
    if (!key || saving || !provider) return;
    const shapeError = providerKeyShapeError(provider, key);
    if (shapeError) {
      setErrorTarget("input");
      setError(shapeError);
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (!(await persistProvider(provider))) return;
      try {
        const next = remember
          ? await manager.rememberKey(provider, key)
          : await manager.useSessionKey(provider, key);
        setStatus(next);
        setValue("");
        onReadyRef.current?.(next);
      } catch {
        setErrorTarget("input");
        setError("That key could not be stored on this device. Try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  // Nothing to ask for once a key is active, and nothing to render before we
  // know: a field that flashes in and out is worse than one that arrives late.
  if (!status || !provider) return null;
  const loading = status.provider !== provider;
  const keyed = !loading && status.state !== "absent";
  if (keyed && provider === persisted) return null;

  const definition = AI_PROVIDERS[provider];

  return (
    <div role="group" aria-labelledby={heading ? headingId : labelledBy} className="min-w-0">
      {heading ? (
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <KeyRound className="size-[18px] flex-none text-ink2" aria-hidden="true" />
          <p id={headingId} className="type-subhead m-0 text-ink">
            {definition.name} key
          </p>
          <KeyStateChip state={keyed ? status.state : "absent"} />
        </div>
      ) : null}
      <div className="mb-2 max-w-[47.5rem]">
        <label htmlFor={selectId} className="sr-only">
          AI provider
        </label>
        <select
          id={selectId}
          value={provider}
          disabled={saving}
          aria-invalid={error && errorTarget === "select" ? true : undefined}
          aria-describedby={error && errorTarget === "select" ? errorId : undefined}
          onChange={(event) => void changeProvider(event.target.value as AiProviderId)}
          className="field-select"
        >
          {AI_PROVIDER_IDS.map((id) => (
            <option key={id} value={id}>
              {AI_PROVIDERS[id].name}
            </option>
          ))}
        </select>
      </div>
      {keyed ? (
        <div className="max-w-[47.5rem]">
          <button
            type="button"
            onClick={() => void commitProvider()}
            disabled={saving}
            className="btn"
          >
            {saving ? "Saving..." : `Use ${definition.name}`}
          </button>
        </div>
      ) : (
        <div className="grid max-w-[47.5rem] grid-cols-[minmax(0,1fr)_auto] gap-2">
          <label htmlFor={inputId} className="sr-only">
            {definition.name} API key
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
            placeholder={`${definition.keyPrefix}…`}
            disabled={saving}
            aria-invalid={error && errorTarget === "input" ? true : undefined}
            aria-describedby={error && errorTarget === "input" ? errorId : undefined}
            className="field-input field-input--mono"
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || loading || !value.trim()}
            className="btn"
          >
            {saving ? "Saving..." : "Use key"}
          </button>
        </div>
      )}
      {error ? (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="type-small mt-2.5 mb-3 text-ink2">
        Your browser sends requests straight to {definition.name}, which bills you. The key never
        reaches StackHatch.
      </p>
      <label className="field-check">
        <input
          type="checkbox"
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
        />
        <span>
          <strong>Remember on this device.</strong>{" "}
          <span className="type-small text-ink2">
            Only on a device you trust: extensions, same-origin scripts and anyone using this device
            could read it.
          </span>
        </span>
      </label>
    </div>
  );
}
