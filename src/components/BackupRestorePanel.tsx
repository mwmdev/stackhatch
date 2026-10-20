"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Download, Upload } from "lucide-react";
import Toast from "@/components/ui/Toast";
import {
  exportVaultBackup,
  type BackupConflictResolution,
  type BackupImportPreview,
} from "@/lib/vault/backup";
import { BACKUP_LIMITS } from "@/lib/vault/backup-limits";
import { getBrowserVaultRepository } from "@/lib/vault/repository";
export interface PreparedDeviceBackup {
  preview: BackupImportPreview;
  commit(
    resolution?: BackupConflictResolution,
    options?: { restoreDeviceState?: boolean }
  ): Promise<unknown>;
}

interface BackupRestorePanelProps {
  exportBackup: () => Promise<string>;
  prepareImport: (text: string) => Promise<PreparedDeviceBackup>;
  onRestored?: () => void | Promise<void>;
  /** Lets the page open the backup picker from elsewhere, such as the empty library. */
  restoreInputRef?: RefObject<HTMLInputElement | null>;
}

const TOAST_MS = 5000;

export function exportBrowserBackup() {
  return exportVaultBackup(getBrowserVaultRepository());
}

export function downloadBackup(text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = `stackhatch-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

export default function BackupRestorePanel({
  exportBackup,
  prepareImport,
  onRestored,
  restoreInputRef,
}: BackupRestorePanelProps) {
  const [busy, setBusy] = useState<"backup" | "import" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PreparedDeviceBackup | null>(null);
  const [resolution, setResolution] = useState<BackupConflictResolution>("keep-both");
  const [restoreDeviceState, setRestoreDeviceState] = useState(false);
  const ownFileRef = useRef<HTMLInputElement>(null);
  const previewHeadingRef = useRef<HTMLHeadingElement>(null);
  const previewHadFocusTargetRef = useRef(false);
  const fileRef = restoreInputRef ?? ownFileRef;

  // Success notices leave after 5 s, but not while someone is on the dismiss control.
  useEffect(() => {
    if (!notice) return;
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (document.activeElement?.closest(".toast")) schedule();
        else setNotice(null);
      }, TOAST_MS);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [notice]);

  // The picker hides while the preview shows, which would drop focus to <body>.
  // Move it into the preview, and back to the picker once the preview closes.
  useEffect(() => {
    if (prepared) {
      previewHadFocusTargetRef.current = true;
      previewHeadingRef.current?.focus();
    } else if (previewHadFocusTargetRef.current) {
      previewHadFocusTargetRef.current = false;
      fileRef.current?.focus();
    }
  }, [prepared, fileRef]);

  function clearFeedback() {
    setNotice(null);
    setError(null);
  }

  async function saveBackup() {
    setBusy("backup");
    clearFeedback();
    try {
      downloadBackup(await exportBackup());
      setNotice("A full StackHatch backup was downloaded. Provider keys are never included.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The backup could not be created.");
    } finally {
      setBusy(null);
    }
  }

  async function selectImport(file: File | undefined) {
    if (!file) return;
    setBusy("import");
    clearFeedback();
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
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "This backup could not be validated.");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function restoreBackup() {
    if (!prepared) return;
    setBusy("import");
    clearFeedback();
    try {
      await prepared.commit(resolution, { restoreDeviceState });
      setPrepared(null);
      setNotice("Backup restored to this browser.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The backup was not restored.");
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

  return (
    <section id="backups" aria-labelledby="backup-restore-title" className="scroll-mt-6">
      <h2 id="backup-restore-title" className="type-section-lg m-0 mb-3">
        Backup and restore
      </h2>
      <p className="m-0 mb-[18px] text-sm">
        A backup holds every map, its messages and device preferences. Provider keys are never
        included.
      </p>

      {/* The preview takes the buttons' place, so the choice stays where it was made. */}
      <div className="flex flex-col gap-2.5" hidden={Boolean(prepared)}>
        <button
          type="button"
          onClick={() => void saveBackup()}
          disabled={busy !== null}
          className="btn btn--block"
        >
          <Download aria-hidden="true" />
          {busy === "backup" ? "Creating backup..." : "Back up all maps"}
        </button>
        <label className="btn btn--block cursor-pointer has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-45 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring">
          <Upload aria-hidden="true" />
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
        <div className="border-t-[1.5px] border-ink pt-4" role="region" aria-label="Backup preview">
          <h3 ref={previewHeadingRef} tabIndex={-1} className="type-subhead m-0">
            Ready to restore
          </h3>
          <p className="type-figure mt-3 mb-0">
            {prepared.preview.projectCount} map
            {prepared.preview.projectCount === 1 ? "" : "s"}
          </p>
          {prepared.preview.discardedTemplateCount > 0 ? (
            <p className="type-small mt-3 mb-0 text-ink2">
              This older backup contains {prepared.preview.discardedTemplateCount} retired template
              {prepared.preview.discardedTemplateCount === 1 ? "" : "s"}. They will not be restored.
            </p>
          ) : null}
          {prepared.preview.projectNames.length > 0 ? (
            <ul
              tabIndex={0}
              aria-label="Maps in this backup"
              className="mt-3 mb-0 max-h-48 list-none overflow-y-auto border-y border-rule p-0 text-sm"
            >
              {prepared.preview.projectNames.map((name, index) => (
                <li key={`${name}-${index}`} className="truncate border-rule py-1.5 [&+&]:border-t">
                  {name}
                </li>
              ))}
            </ul>
          ) : null}
          {prepared.preview.conflicts.length > 0 ? (
            <div className="field mt-4">
              <p className="m-0 text-sm font-bold">
                {prepared.preview.conflicts.length} local name or identifier conflict
                {prepared.preview.conflicts.length === 1 ? "" : "s"} found.
              </p>
              <label htmlFor="backup-conflicts" className="field-label">
                If an item already exists
              </label>
              <select
                id="backup-conflicts"
                value={resolution}
                onChange={(event) => setResolution(event.target.value as BackupConflictResolution)}
                className="field-select"
              >
                <option value="keep-both">Keep both (recommended)</option>
                <option value="skip">Keep the local item</option>
                <option value="replace">Replace the local item</option>
              </select>
            </div>
          ) : null}
          {prepared.preview.includesDevicePreferences || prepared.preview.includesRecentMap ? (
            <label className="field-check mt-4">
              <input
                type="checkbox"
                checked={restoreDeviceState}
                onChange={(event) => setRestoreDeviceState(event.target.checked)}
              />
              <span>
                <strong>Restore device settings too.</strong>{" "}
                <span className="type-small text-ink2">
                  This may replace the model, theme, node vocabulary, editor preferences and
                  recent-map pointer stored in this browser.
                </span>
              </span>
            </label>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => void restoreBackup()}
              disabled={busy !== null}
              className="btn btn--primary"
            >
              Restore backup
            </button>
            <button
              type="button"
              onClick={() => setPrepared(null)}
              disabled={busy !== null}
              className="btn btn--quiet"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="field-error mt-3" role="alert">
          {error}
        </p>
      ) : null}

      <Toast
        toast={notice ? { tone: "success", message: notice } : null}
        onDismiss={() => setNotice(null)}
      />
    </section>
  );
}
