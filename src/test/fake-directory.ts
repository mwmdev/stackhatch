type FakeEntry = FileSystemFileHandle | FileSystemDirectoryHandle;

/** Creates a directory handle from slash-separated file paths and UTF-8 contents. */
export function fakeDirectory(
  files: Record<string, string>,
  name = "fixture"
): FileSystemDirectoryHandle {
  const entries = new Map<string, FakeEntry>();
  const directories = new Map<string, Record<string, string>>();
  for (const [path, text] of Object.entries(files)) {
    const slash = path.indexOf("/");
    if (slash >= 0) {
      const part = path.slice(0, slash);
      const children = directories.get(part) ?? {};
      children[path.slice(slash + 1)] = text;
      directories.set(part, children);
    } else {
      const file = {
        kind: "file",
        name: path,
        async getFile() {
          const result = new File([text], path);
          Object.defineProperty(result, "arrayBuffer", {
            value: async () => new TextEncoder().encode(text).buffer,
          });
          return result;
        },
      } as FileSystemFileHandle;
      entries.set(path, file);
    }
  }
  for (const [part, children] of directories) entries.set(part, fakeDirectory(children, part));
  return {
    kind: "directory",
    name,
    async *entries() {
      yield* entries;
    },
    async getDirectoryHandle(child: string) {
      const entry = entries.get(child);
      if (!entry || entry.kind !== "directory")
        throw new DOMException("Entry not found", "NotFoundError");
      return entry as FileSystemDirectoryHandle;
    },
    async getFileHandle(child: string) {
      const entry = entries.get(child);
      if (!entry || entry.kind !== "file")
        throw new DOMException("Entry not found", "NotFoundError");
      return entry as FileSystemFileHandle;
    },
  } as FileSystemDirectoryHandle;
}
