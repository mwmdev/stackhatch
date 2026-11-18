import { normalizeEvidencePath } from "@/lib/node-evidence";
import { classifyDirectory, classifyFile } from "./classify";
import { LOCAL_SOURCE_LIMITS } from "./limits";
import { containsLikelySecret } from "./secrets";

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
}

export async function readLocalEvidence(
  root: FileSystemDirectoryHandle,
  paths: readonly string[],
  options: { signal?: AbortSignal } = {}
): Promise<{
  files: Array<{ path: string; content: string; truncated: boolean }>;
  omitted: string[];
}> {
  const read: Array<{ path: string; content: string }> = [];
  const omitted: string[] = [];
  for (const original of paths) {
    throwIfAborted(options.signal);
    const path = normalizeEvidencePath(original);
    const segments = path?.split("/") ?? [];
    const name = segments.pop() ?? "";
    const classification = path ? classifyFile(path, 0) : null;
    if (
      !path ||
      segments.some((segment) => classifyDirectory(segment)) ||
      (classification && "excluded" in classification && classification.excluded === "secret")
    ) {
      omitted.push(original);
      continue;
    }
    try {
      let directory = root;
      for (const segment of segments) {
        directory = await directory.getDirectoryHandle(segment);
        throwIfAborted(options.signal);
      }
      const handle = await directory.getFileHandle(name);
      throwIfAborted(options.signal);
      const file = await handle.getFile();
      throwIfAborted(options.signal);
      if (file.size > LOCAL_SOURCE_LIMITS.maxFileBytes) {
        omitted.push(original);
        continue;
      }
      const content = new TextDecoder("utf-8").decode(await file.arrayBuffer());
      throwIfAborted(options.signal);
      if (
        content.slice(0, LOCAL_SOURCE_LIMITS.binarySniffCharacters).includes("\u0000") ||
        containsLikelySecret(content)
      ) {
        omitted.push(original);
      } else {
        read.push({ path, content });
      }
    } catch {
      throwIfAborted(options.signal);
      omitted.push(original);
    }
  }
  throwIfAborted(options.signal);
  const share = Math.floor(LOCAL_SOURCE_LIMITS.evidenceAttachmentCharacters / read.length);
  return {
    files: read.map(({ path, content }) => {
      if (content.length <= share) return { path, content, truncated: false };
      const newline = content.lastIndexOf("\n", share - 1);
      return { path, content: content.slice(0, newline <= 0 ? share : newline), truncated: true };
    }),
    omitted,
  };
}
