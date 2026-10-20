"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderOpen, GitBranch, MoreHorizontal, Pencil, RefreshCw, Trash2 } from "lucide-react";
import BackupRestorePanel, {
  exportBrowserBackup,
  type PreparedDeviceBackup,
} from "@/components/BackupRestorePanel";
import AppPageShell from "@/components/shells/AppPageShell";
import IconControl from "@/components/ui/IconControl";
import MapThumbnail from "@/components/MapThumbnail";
import Modal from "@/components/ui/Modal";
import { buildLocalProjectPath } from "@/lib/app-route";
import { getBrowserVaultRepository } from "@/lib/vault/repository";
import type { VaultProjectRecord } from "@/lib/vault/schema";
import { getBrowserWorkspaceVault, type WorkspaceVault } from "@/lib/vault/workspace";

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function sortProjectsByRecency(projects: VaultProjectRecord[]) {
  return [...projects].sort(
    (left, right) =>
      right.updatedAt - left.updatedAt ||
      right.createdAt - left.createdAt ||
      right.id.localeCompare(left.id)
  );
}

interface BackupServices {
  exportBackup(): Promise<string>;
  prepareImport(text: string): Promise<PreparedDeviceBackup>;
  onRestored?(): void | Promise<void>;
}

const browserBackupServices: BackupServices = {
  exportBackup: exportBrowserBackup,
  async prepareImport(text) {
    const { prepareBackupImport } = await import("@/lib/vault/backup");
    return prepareBackupImport(getBrowserVaultRepository(), text);
  },
  onRestored() {
    window.location.reload();
  },
};

export default function AllMapsPage({
  vault,
  backupServices = browserBackupServices,
}: {
  vault?: WorkspaceVault;
  backupServices?: BackupServices;
}) {
  const router = useRouter();
  const [workspaceVault] = useState(() => vault ?? getBrowserWorkspaceVault());
  const [projects, setProjects] = useState<VaultProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectsError, setProjectsError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<VaultProjectRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingDescriptionId, setEditingDescriptionId] = useState<string | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [descriptionSaving, setDescriptionSaving] = useState(false);
  const [descriptionError, setDescriptionError] = useState("");
  const latestLoadRequest = useRef(0);
  const deleteInvokerRef = useRef<HTMLButtonElement | null>(null);
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const restoreInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!menuProjectId) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || menuTriggerRef.current?.contains(target)) return;
      setMenuProjectId(null);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMenuProjectId(null);
      menuTriggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuProjectId]);

  const loadProjects = useCallback(async () => {
    const requestId = ++latestLoadRequest.current;
    setLoading(true);
    setProjectsError("");
    try {
      const nextProjects = await workspaceVault.listProjects();
      if (requestId === latestLoadRequest.current) setProjects(nextProjects);
    } catch {
      if (requestId === latestLoadRequest.current) {
        setProjects([]);
        setProjectsError(
          "Your maps on this device could not be read. Check browser storage permissions, then retry."
        );
      }
    } finally {
      if (requestId === latestLoadRequest.current) setLoading(false);
    }
  }, [workspaceVault]);

  useEffect(() => {
    void loadProjects();
    return workspaceVault.subscribeInvalidation((invalidation) => {
      if (invalidation.stores.includes("projects")) void loadProjects();
    });
  }, [loadProjects, workspaceVault]);

  async function handleDelete() {
    if (!deleteTarget || descriptionSaving) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await workspaceVault.deleteProject(deleteTarget);
      setProjects((current) => current.filter((project) => project.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      setDeleteError(
        "This map could not be deleted from browser storage. Reload the list and try again."
      );
    } finally {
      setDeleting(false);
    }
  }

  function startDescriptionEdit(project: VaultProjectRecord) {
    if (descriptionSaving) return;
    setEditingDescriptionId(project.id);
    setDescriptionDraft(project.description ?? "");
    setDescriptionError("");
  }

  function cancelDescriptionEdit() {
    setEditingDescriptionId(null);
    setDescriptionDraft("");
    setDescriptionError("");
  }

  async function saveDescription(project: VaultProjectRecord) {
    if (descriptionSaving) return;

    const description = descriptionDraft.trim() ? descriptionDraft : null;
    if (description === project.description) {
      cancelDescriptionEdit();
      return;
    }

    setDescriptionSaving(true);
    setDescriptionError("");
    try {
      const updatedProject = await workspaceVault.updateProjectDescription(project, description);
      setProjects((current) =>
        sortProjectsByRecency(
          current.map((candidate) =>
            candidate.id === updatedProject.id ? updatedProject : candidate
          )
        )
      );
      setDeleteTarget((current) => (current?.id === updatedProject.id ? updatedProject : current));
      cancelDescriptionEdit();
    } catch {
      setDescriptionError(
        "This description could not be saved to browser storage. Keep editing and try again."
      );
    } finally {
      setDescriptionSaving(false);
    }
  }

  const openProject = (project: VaultProjectRecord) =>
    router.push(buildLocalProjectPath(project.id));

  return (
    <AppPageShell
      current="maps"
      title="All maps"
      meta={
        loading || projectsError || projects.length === 0
          ? undefined
          : `${projects.length} on this device`
      }
      flush
      aside={
        <BackupRestorePanel
          exportBackup={backupServices.exportBackup}
          prepareImport={backupServices.prepareImport}
          onRestored={backupServices.onRestored}
          restoreInputRef={restoreInputRef}
        />
      }
    >
      <div className="page-gutter pb-12">
        {loading ? (
          <p className="m-0 border-b border-rule py-7 text-ink2" role="status">
            Loading your maps on this device...
          </p>
        ) : projectsError ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4 border-b border-rule py-7">
            <p className="m-0 max-w-[520px] text-sm text-danger" role="alert">
              {projectsError}
            </p>
            <button type="button" onClick={() => void loadProjects()} className="btn">
              <RefreshCw aria-hidden="true" />
              Retry browser storage
            </button>
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4 border-b border-rule py-7">
            <h2 className="type-section m-0 mr-auto">No maps on this device yet</h2>
            <div className="flex flex-wrap gap-2.5">
              <Link href="/project/new" className="btn">
                New map
              </Link>
              <button
                type="button"
                onClick={() => restoreInputRef.current?.click()}
                className="btn lg:hidden"
              >
                Choose backup to restore
              </button>
            </div>
          </div>
        ) : (
          <ul aria-label="Your maps on this device" className="m-0 list-none p-0">
            {projects.map((project) => (
              <li
                key={project.id}
                className="group/row grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3.5 gap-y-3 border-b border-rule py-[18px] sm:grid-cols-[212px_minmax(0,1fr)_auto] sm:gap-x-7"
              >
                {/* A pointer shortcut; the name below is the keyboard and screen-reader way in. */}
                <div
                  aria-hidden="true"
                  onClick={() => openProject(project)}
                  className="col-start-1 row-start-1 h-[88px] cursor-pointer overflow-hidden rounded-control bg-canvas p-1 outline-ink2 group-hover/row:outline-[1.5px] group-hover/row:outline-solid sm:h-[124px] sm:p-1.5"
                >
                  <MapThumbnail canvasState={project.canvasState} />
                </div>
                <div className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                  <h2 className="type-section-sm m-0 mb-1.5 sm:type-section-lg sm:mt-1">
                    <button
                      type="button"
                      onClick={() => openProject(project)}
                      className="max-w-full text-left decoration-2 underline-offset-4 [overflow-wrap:anywhere] hover:underline"
                      data-testid={`project-card-${project.id}`}
                      aria-label={`Open ${project.name}`}
                    >
                      {project.name}
                    </button>
                  </h2>
                  {editingDescriptionId === project.id ? (
                    <div className="mb-3 max-w-[520px]">
                      <textarea
                        autoFocus
                        rows={3}
                        value={descriptionDraft}
                        onChange={(event) => {
                          setDescriptionDraft(event.target.value);
                          setDescriptionError("");
                        }}
                        onBlur={() => void saveDescription(project)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            event.currentTarget.blur();
                          } else if (event.key === "Escape") {
                            event.preventDefault();
                            cancelDescriptionEdit();
                          }
                        }}
                        disabled={descriptionSaving}
                        aria-label={`Description for ${project.name}`}
                        aria-invalid={descriptionError ? true : undefined}
                        aria-describedby={
                          descriptionError ? `description-error-${project.id}` : undefined
                        }
                        className="field-textarea max-h-64 disabled:cursor-wait"
                      />
                      {descriptionError ? (
                        <p
                          id={`description-error-${project.id}`}
                          className="field-error"
                          role="alert"
                        >
                          {descriptionError}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startDescriptionEdit(project)}
                      className={`mb-3 block max-w-[520px] cursor-text py-0.5 text-left text-[14.5px] leading-[1.45] decoration-rule-strong decoration-dashed underline-offset-4 hover:underline ${project.description ? "text-ink" : "text-ink2"}`}
                      aria-label={`Edit description for ${project.name}`}
                    >
                      <span className="line-clamp-2">
                        {project.description || "Add a description"}
                      </span>
                    </button>
                  )}
                  <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink2">
                    {project.repoUrl ? (
                      <span className="inline-flex items-center gap-2 whitespace-nowrap">
                        <GitBranch className="size-[15px]" aria-hidden="true" />
                        Repository map
                      </span>
                    ) : null}
                    <span className="whitespace-nowrap">
                      Updated {formatDate(project.updatedAt)}
                    </span>
                  </p>
                </div>
                <div className="relative col-start-2 row-start-1 sm:col-start-3">
                  <IconControl
                    label={`More actions for ${project.name}`}
                    tooltip="More actions"
                    tooltipPlacement="left"
                    aria-haspopup="menu"
                    aria-expanded={menuProjectId === project.id}
                    onClick={(event) => {
                      menuTriggerRef.current = event.currentTarget;
                      setMenuProjectId((current) => (current === project.id ? null : project.id));
                    }}
                  >
                    <MoreHorizontal />
                  </IconControl>
                  {menuProjectId === project.id ? (
                    <div
                      ref={menuRef}
                      role="menu"
                      aria-label={`Actions for ${project.name}`}
                      className="menu absolute top-full right-0 z-20 mt-2 w-[196px]"
                      onKeyDown={(event) => {
                        const items = Array.from(
                          event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')
                        );
                        const index = items.indexOf(document.activeElement as HTMLElement);
                        const next =
                          event.key === "ArrowDown"
                            ? items[(index + 1) % items.length]
                            : event.key === "ArrowUp"
                              ? items[(index - 1 + items.length) % items.length]
                              : event.key === "Home"
                                ? items[0]
                                : event.key === "End"
                                  ? items.at(-1)
                                  : null;
                        if (!next) return;
                        event.preventDefault();
                        next.focus();
                      }}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuProjectId(null);
                          openProject(project);
                        }}
                        className="menu__item"
                      >
                        <FolderOpen aria-hidden="true" />
                        Open map
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuProjectId(null);
                          startDescriptionEdit(project);
                        }}
                        className="menu__item"
                      >
                        <Pencil aria-hidden="true" />
                        Edit description
                      </button>
                      <hr className="menu__rule" />
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          deleteInvokerRef.current = menuTriggerRef.current;
                          setMenuProjectId(null);
                          setDeleteError("");
                          setDeleteTarget(project);
                        }}
                        className="menu__item menu__item--danger"
                        aria-label={`Delete ${project.name}`}
                      >
                        <Trash2 aria-hidden="true" />
                        Delete map
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        canClose={!deleting}
        title="Delete map"
        size="sm"
        invokerRef={deleteInvokerRef}
        footer={
          <>
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              data-autofocus
              className="btn btn--quiet"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting || descriptionSaving}
              className="btn btn--danger-solid"
            >
              {deleting ? "Deleting..." : deleteError ? "Retry delete" : "Delete"}
            </button>
          </>
        }
      >
        <p className="m-0">
          Delete <strong>{deleteTarget?.name}</strong> from this device? This cannot be undone.
        </p>
        {deleteError ? (
          <p className="field-error mt-3" role="alert">
            {deleteError}
          </p>
        ) : null}
      </Modal>
    </AppPageShell>
  );
}
