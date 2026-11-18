import { classifyDirectory, classifyFile } from "./classify";
import { LocalSourceError } from "./errors";
import { LOCAL_SOURCE_LIMITS } from "./limits";
import type { ExclusionReason, LocalSourceLanguage } from "./types";

export interface EnumeratedFile {
  path: string;
  size: number;
  language: LocalSourceLanguage;
  /** Reads the current file content; the source decides how (disk handle or GitHub blob). */
  open: (signal: AbortSignal) => Promise<Blob>;
}

export interface EnumerationResult {
  folderName: string;
  files: EnumeratedFile[];
  excludedFiles: Array<{ path: string; reason: ExclusionReason }>;
  excludedFileCounts: Partial<Record<ExclusionReason, number>>;
  excludedDirectories: Array<{ path: string; reason: ExclusionReason }>;
  excludedDirectoryCount: number;
  unreadable: string[];
  unreadableCount: number;
  entriesSeen: number;
  elapsedMs: number;
}

export interface EnumerateOptions {
  signal: AbortSignal;
  now: () => number;
  onProgress: (entriesSeen: number) => void;
}

const PROGRESS_INTERVAL = 250;

/** Walks the folder, applying the fixed default exclusions; excluded directories are not descended. */
export async function enumerateFolder(
  root: FileSystemDirectoryHandle,
  options: EnumerateOptions
): Promise<EnumerationResult> {
  const start = options.now();
  const files: EnumeratedFile[] = [];
  const excludedFiles: EnumerationResult["excludedFiles"] = [];
  const excludedFileCounts: EnumerationResult["excludedFileCounts"] = {};
  const excludedDirectories: EnumerationResult["excludedDirectories"] = [];
  const unreadable: string[] = [];
  let excludedDirectoryCount = 0;
  let unreadableCount = 0;
  let entriesSeen = 0;
  const stack: Array<{ handle: FileSystemDirectoryHandle; prefix: string }> = [
    { handle: root, prefix: "" },
  ];
  const listLimit = LOCAL_SOURCE_LIMITS.reportListLimit;

  while (stack.length > 0) {
    const { handle: directory, prefix } = stack.pop()!;
    try {
      for await (const [name, entry] of directory.entries()) {
        options.signal.throwIfAborted();
        entriesSeen += 1;
        if (entriesSeen > LOCAL_SOURCE_LIMITS.maxEnumeratedEntries) {
          throw new LocalSourceError(
            "too-many-entries",
            "This folder has more than 1,000,000 entries. Choose a smaller folder."
          );
        }
        if (entriesSeen % PROGRESS_INTERVAL === 0) options.onProgress(entriesSeen);
        const path = `${prefix}${name}`;
        try {
          if (entry.kind === "directory") {
            const reason = classifyDirectory(name);
            if (reason) {
              excludedDirectoryCount += 1;
              if (excludedDirectories.length < listLimit)
                excludedDirectories.push({ path, reason });
            } else {
              stack.push({ handle: entry as FileSystemDirectoryHandle, prefix: `${path}/` });
            }
            continue;
          }
          const fileHandle = entry as FileSystemFileHandle;
          // Most exclusions do not depend on size, so avoid reading metadata for them.
          let verdict = classifyFile(path, 0);
          let size = 0;
          if ("language" in verdict) {
            size = (await fileHandle.getFile()).size;
            verdict = classifyFile(path, size);
          }
          if ("excluded" in verdict) {
            excludedFileCounts[verdict.excluded] = (excludedFileCounts[verdict.excluded] ?? 0) + 1;
            if (excludedFiles.length < listLimit) {
              excludedFiles.push({ path, reason: verdict.excluded });
            }
          } else {
            files.push({
              path,
              size,
              language: verdict.language,
              open: () => fileHandle.getFile(),
            });
          }
        } catch (error) {
          if (isAbort(error) || error instanceof LocalSourceError) throw error;
          unreadableCount += 1;
          if (unreadable.length < listLimit) unreadable.push(path);
        }
      }
    } catch (error) {
      if (directory === root || isAbort(error) || error instanceof LocalSourceError) throw error;
      unreadableCount += 1;
      if (unreadable.length < listLimit) unreadable.push(prefix ? prefix.slice(0, -1) : ".");
    }
  }

  options.onProgress(entriesSeen);
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return {
    folderName: root.name,
    files,
    excludedFiles,
    excludedFileCounts,
    excludedDirectories,
    excludedDirectoryCount,
    unreadable,
    unreadableCount,
    entriesSeen,
    elapsedMs: options.now() - start,
  };
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
