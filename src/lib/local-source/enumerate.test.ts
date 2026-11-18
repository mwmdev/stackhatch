import { describe, expect, it } from "vitest";
import { fakeDirectory } from "@/test/fake-directory";
import { enumerateFolder } from "./enumerate";
import { LOCAL_SOURCE_LIMITS } from "./limits";

const options = () => ({
  signal: new AbortController().signal,
  now: () => 0,
  onProgress: () => {},
});

describe("enumerateFolder", () => {
  it("counts every excluded directory even when the sample is full", async () => {
    const count = LOCAL_SOURCE_LIMITS.reportListLimit + 7;
    const files = Object.fromEntries(
      Array.from({ length: count }, (_, i) => [`parent-${i}/node_modules/file.js`, "x"])
    );
    const result = await enumerateFolder(fakeDirectory(files), options());
    expect(result.excludedDirectoryCount).toBe(count);
    expect(result.excludedDirectories).toHaveLength(LOCAL_SOURCE_LIMITS.reportListLimit);
  });

  it("counts unreadable files and subtrees independently of the bounded sample", async () => {
    const count = LOCAL_SOURCE_LIMITS.reportListLimit + 3;
    const deniedDirectory = (name: string) =>
      ({
        kind: "directory",
        name,
        async *entries() {
          throw new DOMException("Denied", "NotAllowedError");
        },
      }) as unknown as FileSystemDirectoryHandle;
    const deniedFile = {
      kind: "file",
      name: "unreadable.ts",
      async getFile() {
        throw new DOMException("Denied", "NotAllowedError");
      },
    } as unknown as FileSystemFileHandle;
    const root = {
      kind: "directory",
      name: "fixture",
      async *entries() {
        yield [deniedFile.name, deniedFile] as [string, FileSystemHandle];
        for (let i = 0; i < count; i++) {
          const directory = deniedDirectory(`subtree-${i}`);
          yield [directory.name, directory] as [string, FileSystemHandle];
        }
      },
    } as unknown as FileSystemDirectoryHandle;
    const result = await enumerateFolder(root, options());
    expect(result.unreadableCount).toBe(count + 1);
    expect(result.unreadable).toHaveLength(LOCAL_SOURCE_LIMITS.reportListLimit);
    expect(result.unreadable).toContain("unreadable.ts");
  });
});
