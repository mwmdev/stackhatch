import type { RepositorySourceCommit } from "@/lib/ai/provider-run";
import type { ApprovedLocalGeneration } from "./generation";

export const LOCAL_FOLDER_PICKER_ID = "stackhatch-local-source";

// Folder permissions and source text never outlive this tab.
const folders = new Map<string, FileSystemDirectoryHandle>();
export type PendingGeneration =
  | { source: "local"; generation: ApprovedLocalGeneration }
  | { source: "github"; generation: ApprovedLocalGeneration; repository: RepositorySourceCommit };

const pendingGenerations = new Map<string, PendingGeneration>();
let pickedFolder: FileSystemDirectoryHandle | null = null;
let pickedRepository: string | null = null;

/** Hands a folder picked on the landing page to the New map page in this tab. */
export function setPickedLocalFolder(handle: FileSystemDirectoryHandle): void {
  pickedFolder = handle;
}

export function takePickedLocalFolder(): FileSystemDirectoryHandle | null {
  const handle = pickedFolder;
  pickedFolder = null;
  return handle;
}

/** Hands a repository chosen on the landing page to the New map page in this tab. */
export function setPickedRepository(reference: string): void {
  pickedRepository = reference;
}

export function takePickedRepository(): string | null {
  const reference = pickedRepository;
  pickedRepository = null;
  return reference;
}

export function rememberLocalFolder(projectId: string, handle: FileSystemDirectoryHandle): void {
  folders.set(projectId, handle);
}

/** The remembered folder, or undefined when none is kept or the browser no longer grants read access. */
export async function usableLocalFolder(
  projectId: string
): Promise<FileSystemDirectoryHandle | undefined> {
  const handle = folders.get(projectId);
  if (!handle) return undefined;
  try {
    const access = handle as FileSystemDirectoryHandle & {
      requestPermission?: (descriptor: { mode: "read" }) => Promise<PermissionState>;
    };
    if (
      access.requestPermission &&
      (await access.requestPermission({ mode: "read" })) !== "granted"
    ) {
      folders.delete(projectId);
      return undefined;
    }
  } catch {
    folders.delete(projectId);
    return undefined;
  }
  return handle;
}

export function localFolderFor(projectId: string): FileSystemDirectoryHandle | undefined {
  return folders.get(projectId);
}

export function registerPendingGeneration(projectId: string, pending: PendingGeneration): void {
  pendingGenerations.set(projectId, pending);
}

export function peekPendingGeneration(projectId: string): PendingGeneration | undefined {
  return pendingGenerations.get(projectId);
}

export function clearPendingGeneration(projectId: string): void {
  pendingGenerations.delete(projectId);
}
