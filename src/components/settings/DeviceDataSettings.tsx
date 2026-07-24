"use client";

import { useEffect, useRef, useState } from "react";
import { Database, Download, HardDrive, Upload } from "lucide-react";
import {
  BACKUP_LIMITS,
  type BackupConflictResolution,
  type BackupImportPreview,
} from "@/lib/vault/backup";
import type { DeviceDataStore } from "@/lib/vault/clear";
import type { VaultStorageStatus } from "@/lib/vault/storage-status";

export const CLEAR_DEVICE_CONFIRMATION = "CLEAR THIS DEVICE";

export interface PreparedDeviceBackup {
  preview: BackupImportPreview;
  commit(
    resolution?: BackupConflictResolution,
    options?: { restoreDeviceState?: boolean }
  ): Promise<unknown>;
}

interface DeviceDataSettingsProps {
  storageStatus: VaultStorageStatus;
  requestPersistence: () => Promise<VaultStorageStatus>;
  exportBackup: () => Promise<string>;
  prepareImport: (text: string) => Promise<PreparedDeviceBackup>;
  clearData: (onBlocked: (store: DeviceDataStore) => void) => Promise<void>;
  onRestored?: () => void | Promise<void>;
  onCleared?: () => void | Promise<void>;
}

function downloadBackup(text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = `stackhatch-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

function formatBytes(value: number | null) {
  if (value === null) return "Unavailable";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DeviceDataSettings({
  storageStatus: initialStorageStatus,
  requestPersistence,
  exportBackup,
  prepareImport,
  clearData,
  onRestored,
  onCleared,
}: DeviceDataSettingsProps) {
  const [storageStatus, setStorageStatus] = useState(initialStorageStatus);
  const [busy, setBusy] = useState<"backup" | "import" | "persist" | "clear" | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [prepared, setPrepared] = useState<PreparedDeviceBackup | null>(null);
  const [resolution, setResolution] = useState<BackupConflictResolution>("keep-both");
  const [restoreDeviceState, setRestoreDeviceState] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [blockedStore, setBlockedStore] = useState<DeviceDataStore | null>(null);
  const [clearCommitted, setClearCommitted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const clearTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setStorageStatus(initialStorageStatus), [initialStorageStatus]);
  useEffect(() => {
    if (clearOpen) confirmationRef.current?.focus();
  }, [clearOpen]);

  async function saveBackup() {
    setBusy("backup");
    setFeedback(null);
    try {
      downloadBackup(await exportBackup());
      setFeedback({
        type: "success",
        message: "A full StackHatch backup was downloaded. Provider keys are never included.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "The backup could not be created.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function selectImport(file: File | undefined) {
    if (!file) return;
    setBusy("import");
    setFeedback(null);
    setPrepared(null);
    try {
      if (file.size > BACKUP_LIMITS.maxBytes) {
        throw new Error("Backup file is too large.");
      }
      const next = await prepareImport(await file.text());
      setPrepared(next);
      setResolution(next.preview.defaultConflictResolution);
      setRestoreDeviceState(
        (next.preview.includesDevicePreferences || next.preview.includesRecentMap) &&
          next.preview.deviceStateConflicts.length === 0
      );
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "This backup could not be validated.",
      });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function restoreBackup() {
    if (!prepared) return;
    setBusy("import");
    setFeedback(null);
    try {
      await prepared.commit(resolution, { restoreDeviceState });
      setPrepared(null);
      setFeedback({ type: "success", message: "Backup restored to this browser." });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "The backup was not restored.",
      });
      setBusy(null);
      return;
    }
    setBusy(null);
    try {
      await onRestored?.();
    } catch {
      // The committed receipt remains authoritative when navigation fails.
    }
  }

  async function makePersistent() {
    setBusy("persist");
    setFeedback(null);
    try {
      const next = await requestPersistence();
      setStorageStatus(next);
      setFeedback({
        type: next.persisted ? "success" : "error",
        message: next.persisted
          ? "The browser granted persistent storage."
          : "The browser did not grant persistent storage. Keep regular backups.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "Persistent storage could not be requested.",
      });
    } finally {
      setBusy(null);
    }
  }

  function closeClearDialog() {
    if (busy === "clear" || clearCommitted) return;
    setClearOpen(false);
    setConfirmation("");
    setBlockedStore(null);
    queueMicrotask(() => clearTriggerRef.current?.focus());
  }

  async function confirmClear() {
    if (confirmation !== CLEAR_DEVICE_CONFIRMATION || busy) return;
    setBusy("clear");
    setFeedback(null);
    setBlockedStore(null);
    try {
      await clearData(setBlockedStore);
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Local data could not be fully cleared. Reload and try again.",
      });
      setBusy(null);
      return;
    }
    setClearCommitted(true);
    setBusy(null);
    try {
      await onCleared?.();
    } catch {
      // Keep the committed fallback visible when navigation fails.
    }
  }

  return (
    <>
      <section
        id="device-data"
        className="scroll-mt-24 rounded-sm border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-low)] sm:p-6"
      >
        <p className="font-utility mb-1 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
          Browser vault · 05
        </p>
        <h2 className="text-xl font-semibold text-[var(--card-foreground)]">Device data</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">
          Maps and settings live in this browser profile, not in a StackHatch account. The browser
          or device can still clear them, so keep a backup you control.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-sm border border-[var(--border)] bg-[var(--background)] p-4">
            <Database className="h-5 w-5 text-[var(--color-data)]" aria-hidden="true" />
            <p className="mt-3 text-xs font-semibold text-[var(--muted-foreground)]">Used</p>
            <p className="font-utility mt-1 text-sm">{formatBytes(storageStatus.usage)}</p>
          </div>
          <div className="rounded-sm border border-[var(--border)] bg-[var(--background)] p-4">
            <HardDrive className="h-5 w-5 text-[var(--color-client)]" aria-hidden="true" />
            <p className="mt-3 text-xs font-semibold text-[var(--muted-foreground)]">
              Browser quota
            </p>
            <p className="font-utility mt-1 text-sm">{formatBytes(storageStatus.quota)}</p>
          </div>
          <div className="rounded-sm border border-[var(--border)] bg-[var(--background)] p-4">
            <p className="text-xs font-semibold text-[var(--muted-foreground)]">Durability</p>
            <p className="mt-2 text-sm font-semibold">
              {storageStatus.persisted === true
                ? "Persistent"
                : storageStatus.persisted === false
                  ? "Best effort"
                  : "Browser controlled"}
            </p>
          </div>
        </div>

        {storageStatus.state === "unavailable" ? (
          <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
            Browser storage status is unavailable. Export a backup before continuing important work.
          </p>
        ) : storageStatus.persisted === false ? (
          <button
            type="button"
            onClick={() => void makePersistent()}
            disabled={busy !== null}
            className="mt-4 min-h-11 rounded-sm border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--muted)] disabled:opacity-50"
          >
            {busy === "persist" ? "Requesting..." : "Ask browser to keep data"}
          </button>
        ) : null}

        <div id="backups" className="mt-7 border-t border-[var(--border)] pt-6">
          <h3 className="text-base font-semibold">Backup and restore</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
            Full backups contain maps, messages, templates, and device preferences. Anthropic keys
            and unfinished provider requests are excluded.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void saveBackup()}
              disabled={busy !== null || clearCommitted}
              className="inline-flex min-h-11 items-center gap-2 rounded-sm bg-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand-foreground)] disabled:opacity-50"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {busy === "backup" ? "Creating backup..." : "Back up all data"}
            </button>
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--muted)]">
              <Upload className="h-4 w-4" aria-hidden="true" />
              {busy === "import" ? "Reading backup..." : "Choose backup to restore"}
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                disabled={busy !== null}
                className="sr-only"
                aria-label="Choose StackHatch backup"
                onChange={(event) => void selectImport(event.target.files?.[0])}
              />
            </label>
          </div>

          {prepared ? (
            <div
              className="mt-5 rounded-sm border border-[var(--border)] bg-[var(--background)] p-4"
              role="region"
              aria-label="Backup preview"
            >
              <h4 className="font-semibold">Ready to restore</h4>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                {prepared.preview.projectCount} map
                {prepared.preview.projectCount === 1 ? "" : "s"} and{" "}
                {prepared.preview.templateCount} template
                {prepared.preview.templateCount === 1 ? "" : "s"}
              </p>
              {prepared.preview.projectNames.length > 0 ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                  {prepared.preview.projectNames.map((name, index) => (
                    <li key={`${name}-${index}`}>{name}</li>
                  ))}
                </ul>
              ) : null}
              {prepared.preview.conflicts.length > 0 ? (
                <>
                  <p className="mt-4 text-sm font-semibold">
                    {prepared.preview.conflicts.length} local name or identifier conflict
                    {prepared.preview.conflicts.length === 1 ? "" : "s"} found.
                  </p>
                  <label htmlFor="backup-conflicts" className="mt-3 block text-sm font-semibold">
                    If an item already exists
                  </label>
                  <select
                    id="backup-conflicts"
                    value={resolution}
                    onChange={(event) =>
                      setResolution(event.target.value as BackupConflictResolution)
                    }
                    className="mt-1 min-h-11 w-full rounded-sm border border-[var(--border)] bg-[var(--card)] px-3"
                  >
                    <option value="keep-both">Keep both (recommended)</option>
                    <option value="skip">Keep the local item</option>
                    <option value="replace">Replace the local item</option>
                  </select>
                </>
              ) : null}
              {prepared.preview.includesDevicePreferences || prepared.preview.includesRecentMap ? (
                <label className="mt-4 flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={restoreDeviceState}
                    onChange={(event) => setRestoreDeviceState(event.target.checked)}
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    <strong>Restore device settings too.</strong>{" "}
                    <span className="text-[var(--muted-foreground)]">
                      This may replace the model, theme, node vocabulary, editor preferences, and
                      recent-map pointer stored in this browser.
                    </span>
                  </span>
                </label>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void restoreBackup()}
                  disabled={busy !== null}
                  className="min-h-11 rounded-sm bg-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand-foreground)] disabled:opacity-50"
                >
                  Restore backup
                </button>
                <button
                  type="button"
                  onClick={() => setPrepared(null)}
                  disabled={busy !== null}
                  className="min-h-11 rounded-sm px-4 py-2 text-sm font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-7 border-t border-[var(--danger-border)] pt-6">
          <h3 className="text-base font-semibold text-[var(--danger)]">Clear this device</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
            Permanently remove every StackHatch map, message, template, preference, and Anthropic
            key stored by this browser profile.
          </p>
          <button
            ref={clearTriggerRef}
            type="button"
            onClick={() => setClearOpen(true)}
            disabled={clearCommitted}
            className="mt-4 min-h-11 rounded-sm border border-[var(--danger-border)] px-4 py-2 text-sm font-bold text-[var(--danger)] hover:bg-[var(--danger-surface)]"
          >
            Clear all local data
          </button>
        </div>

        {feedback ? (
          <p
            className={`mt-4 text-sm ${feedback.type === "error" ? "text-[var(--danger)]" : "text-[var(--success)]"}`}
            role={feedback.type === "error" ? "alert" : "status"}
          >
            {feedback.message}
          </p>
        ) : null}
      </section>

      {clearOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-device-title"
            onKeyDown={(event) => {
              if (event.key === "Escape" && !clearCommitted) closeClearDialog();
              if (event.key !== "Tab") return;
              const focusable = Array.from(
                event.currentTarget.querySelectorAll<HTMLElement>(
                  'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
                )
              );
              if (focusable.length === 0) return;
              const first = focusable[0];
              const last = focusable.at(-1)!;
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
            }}
            className="w-full max-w-lg rounded-sm border border-[var(--danger-border)] bg-[var(--card)] p-5 shadow-2xl sm:p-6"
          >
            <h3 id="clear-device-title" className="text-xl font-bold">
              Clear all StackHatch data from this device?
            </h3>
            <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">
              This cannot be undone. Download a backup first if you may need these maps again.
            </p>
            <button
              type="button"
              onClick={() => void saveBackup()}
              disabled={busy !== null || clearCommitted}
              className="mt-4 min-h-11 rounded-sm border border-[var(--border)] px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Back up before clearing
            </button>
            <label htmlFor="clear-device-confirmation" className="mt-5 block text-sm font-semibold">
              Type <span className="font-utility">{CLEAR_DEVICE_CONFIRMATION}</span> to confirm
            </label>
            <input
              ref={confirmationRef}
              id="clear-device-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={busy === "clear" || clearCommitted}
              autoComplete="off"
              spellCheck={false}
              className="mt-2 min-h-11 w-full rounded-sm border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-utility text-sm"
            />
            {blockedStore && !clearCommitted ? (
              <p className="mt-3 text-sm text-[var(--danger)]" role="status">
                Another StackHatch tab is keeping {blockedStore} storage open. Close that tab to
                finish clearing.
              </p>
            ) : null}
            {clearCommitted ? (
              <div className="mt-5" role="status">
                <p className="text-sm font-semibold text-[var(--success)]">
                  StackHatch data was cleared from this browser profile.
                </p>
                {/* A hard navigation reinitializes every closed browser-vault singleton. */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a
                  href="/"
                  className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline"
                >
                  Return to StackHatch
                </a>
              </div>
            ) : (
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeClearDialog}
                  disabled={busy === "clear"}
                  className="min-h-11 rounded-sm px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void confirmClear()}
                  disabled={busy !== null || confirmation !== CLEAR_DEVICE_CONFIRMATION}
                  className="min-h-11 rounded-sm bg-[var(--danger)] px-4 py-2 text-sm font-bold text-[var(--danger-foreground)] disabled:opacity-50"
                >
                  {busy === "clear" ? "Clearing this device..." : "Permanently clear this device"}
                </button>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
