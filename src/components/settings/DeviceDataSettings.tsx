"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { downloadBackup, exportBrowserBackup } from "@/components/BackupRestorePanel";
import SettingsRow from "@/components/settings/SettingsRow";
import Modal from "@/components/ui/Modal";
import type { DeviceDataStore } from "@/lib/vault/clear";
import type { VaultStorageStatus } from "@/lib/vault/storage-status";

export const CLEAR_DEVICE_CONFIRMATION = "CLEAR THIS DEVICE";

interface DeviceDataSettingsProps {
  storageStatus: VaultStorageStatus;
  clearData: (onBlocked: (store: DeviceDataStore) => void) => Promise<void>;
  onCleared?: () => void | Promise<void>;
}

function formatBytes(value: number | null) {
  if (value === null) return "Unavailable";
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

export default function DeviceDataSettings({
  storageStatus,
  clearData,
  onCleared,
}: DeviceDataSettingsProps) {
  const [backingUp, setBackingUp] = useState(false);
  const [backupFeedback, setBackupFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [clearing, setClearing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "error"; message: string } | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [blockedStore, setBlockedStore] = useState<DeviceDataStore | null>(null);
  const [clearCommitted, setClearCommitted] = useState(false);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const clearTriggerRef = useRef<HTMLButtonElement>(null);

  async function saveBackup() {
    if (backingUp) return;
    setBackingUp(true);
    setBackupFeedback(null);
    try {
      downloadBackup(await exportBrowserBackup());
      setBackupFeedback({
        type: "success",
        message: "A full StackHatch backup was downloaded. Provider keys are never included.",
      });
    } catch (error) {
      setBackupFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "The backup could not be created.",
      });
    } finally {
      setBackingUp(false);
    }
  }

  function closeClearDialog() {
    setClearOpen(false);
    setConfirmation("");
    setBlockedStore(null);
  }

  async function confirmClear() {
    if (confirmation !== CLEAR_DEVICE_CONFIRMATION || clearing) return;
    setClearing(true);
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
      setClearing(false);
      return;
    }
    setClearCommitted(true);
    setClearing(false);
    try {
      await onCleared?.();
    } catch {
      // Keep the committed fallback visible when navigation fails.
    }
  }

  const figures = [
    ["Used", formatBytes(storageStatus.usage)],
    ["Browser quota", formatBytes(storageStatus.quota)],
    [
      "Durability",
      storageStatus.persisted === true
        ? "Persistent"
        : storageStatus.persisted === false
          ? "Best effort"
          : "Browser controlled",
    ],
  ];

  return (
    <SettingsRow id="device-data" title="Device data">
      {/* Subgrid rows keep the three values on one baseline when a label wraps on phones. */}
      <dl className="m-0 mb-3.5 grid grid-cols-3 grid-rows-[auto_auto] border-t-[1.5px] border-b border-t-ink border-b-rule">
        {figures.map(([label, value]) => (
          <div
            key={label}
            className="row-span-2 grid min-w-0 grid-rows-subgrid gap-y-1 py-3 pr-3 [&+&]:border-l [&+&]:border-rule [&+&]:pl-3 sm:pr-4 sm:[&+&]:pl-4"
          >
            <dt className="self-end text-[13px] font-bold text-ink2 sm:whitespace-nowrap">
              {label}
            </dt>
            <dd className="type-figure m-0 text-[clamp(1.25rem,1rem+1vw,1.875rem)] [overflow-wrap:anywhere]">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {storageStatus.state === "unavailable" ? (
        <p className="type-small m-0 text-danger" role="alert">
          Browser storage status is unavailable. Export a backup before continuing important work.
        </p>
      ) : (
        <p className="type-small m-0 text-ink2">
          {storageStatus.persisted === false
            ? "This browser may clear best-effort storage. Keep regular backups."
            : "Maps and settings live only in this browser profile. Keep regular backups."}
        </p>
      )}

      <button
        type="button"
        onClick={() => void saveBackup()}
        disabled={backingUp}
        className="btn mt-4"
      >
        <Download aria-hidden="true" />
        {backingUp ? "Creating backup..." : "Back up all maps"}
      </button>
      {backupFeedback ? (
        <p
          className={`type-small mt-2.5 mb-0 ${backupFeedback.type === "error" ? "text-danger" : "text-success"}`}
          role={backupFeedback.type === "error" ? "alert" : "status"}
        >
          {backupFeedback.message}
        </p>
      ) : null}

      <div className="mt-[26px] border-t-[1.5px] border-danger pt-[18px]">
        <h3 className="type-subhead m-0 mb-1.5 text-danger">Clear this device</h3>
        <p className="type-small m-0 text-ink2">
          Permanently removes every StackHatch map, message, preference and provider keys in this
          browser profile.
        </p>
        <button
          ref={clearTriggerRef}
          type="button"
          onClick={() => setClearOpen(true)}
          disabled={clearCommitted}
          className="btn btn--danger mt-3.5"
        >
          Clear all local data
        </button>
        {feedback ? (
          <p className="field-error mt-3" role="alert">
            {feedback.message}
          </p>
        ) : null}
      </div>

      <Modal
        open={clearOpen}
        onClose={closeClearDialog}
        canClose={!clearing && !clearCommitted}
        title="Clear all StackHatch data from this device?"
        invokerRef={clearTriggerRef}
        initialFocusRef={confirmationRef}
        footer={
          clearCommitted ? null : (
            <>
              <button
                type="button"
                onClick={closeClearDialog}
                disabled={clearing}
                className="btn btn--quiet"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmClear()}
                disabled={clearing || confirmation !== CLEAR_DEVICE_CONFIRMATION}
                className="btn btn--danger-solid"
              >
                {clearing ? "Clearing this device..." : "Permanently clear this device"}
              </button>
            </>
          )
        }
      >
        <p className="m-0">
          This cannot be undone. Download a backup first if you may need these maps again.
        </p>
        {!clearing && !clearCommitted ? (
          <Link href="/app/maps#backups" className="btn btn--sm mt-3">
            Open backup and restore
          </Link>
        ) : null}
        <div className="field mt-5">
          <label htmlFor="clear-device-confirmation" className="field-label">
            Type <span className="font-utility">{CLEAR_DEVICE_CONFIRMATION}</span> to confirm
          </label>
          <input
            ref={confirmationRef}
            id="clear-device-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={clearing || clearCommitted}
            autoComplete="off"
            spellCheck={false}
            className="field-input field-input--mono"
          />
        </div>
        {blockedStore && !clearCommitted ? (
          <p className="type-small mt-3 mb-0 text-danger" role="status">
            Another StackHatch tab is keeping {blockedStore} storage open. Close that tab to finish
            clearing.
          </p>
        ) : null}
        {clearCommitted ? (
          <div className="mt-5" role="status">
            <p className="m-0 font-bold text-success">
              StackHatch data was cleared from this browser profile.
            </p>
            {/* A hard navigation reinitializes every closed browser-vault singleton. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="link mt-2 inline-block font-bold">
              Return to StackHatch
            </a>
          </div>
        ) : null}
      </Modal>
    </SettingsRow>
  );
}
