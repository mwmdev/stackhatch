import { describe, expect, it } from "vitest";
import { fakeDirectory } from "@/test/fake-directory";
import { readLocalEvidence } from "./evidence";
import { LOCAL_SOURCE_LIMITS } from "./limits";

describe("readLocalEvidence", () => {
  it("shares the attachment limit and truncates on a newline", async () => {
    const content = `${"a".repeat(89_000)}\n${"b".repeat(60_999)}`;
    const root = fakeDirectory({ "src/a.ts": content, "src/b.ts": content });
    const result = await readLocalEvidence(root, ["src/a.ts", "src/b.ts", "missing.ts"]);
    expect(result.omitted).toEqual(["missing.ts"]);
    expect(result.files).toHaveLength(2);
    for (const file of result.files) {
      expect(file.truncated).toBe(true);
      expect(file.content.length).toBe(89_000);
      expect(file.content.length).toBeLessThanOrEqual(90_000);
    }
  });

  it("omits unsafe paths, binary and likely-secret files", async () => {
    const root = fakeDirectory({
      "good.ts": "safe",
      "binary.ts": "x\0y",
      "secret.ts": "-----BEGIN RSA PRIVATE KEY-----",
    });
    const result = await readLocalEvidence(root, [
      "./good.ts",
      "../good.ts",
      "binary.ts",
      "secret.ts",
    ]);
    expect(result.files).toEqual([{ path: "good.ts", content: "safe", truncated: false }]);
    expect(result.omitted).toEqual(["../good.ts", "binary.ts", "secret.ts"]);
  });

  it("does not traverse excluded directories or read secret filenames", async () => {
    const root = fakeDirectory({ ".env": "ordinary", "node_modules/pkg/a.ts": "ordinary" });
    const result = await readLocalEvidence(root, [".env", "node_modules/pkg/a.ts"]);
    expect(result.files).toEqual([]);
    expect(result.omitted).toEqual([".env", "node_modules/pkg/a.ts"]);
  });

  it("omits oversized files before allocating their contents", async () => {
    let reads = 0;
    const root = {
      getFileHandle: async () => ({
        getFile: async () => ({
          size: LOCAL_SOURCE_LIMITS.maxFileBytes + 1,
          arrayBuffer: async () => {
            reads++;
            return new ArrayBuffer(0);
          },
        }),
      }),
    } as unknown as FileSystemDirectoryHandle;
    const result = await readLocalEvidence(root, ["large.ts"]);
    expect(result.omitted).toEqual(["large.ts"]);
    expect(reads).toBe(0);
  });

  it("propagates cancellation after a read and before any work", async () => {
    const controller = new AbortController();
    const root = {
      getFileHandle: async () => ({
        getFile: async () => ({
          size: 1,
          arrayBuffer: async () => {
            controller.abort();
            return new ArrayBuffer(1);
          },
        }),
      }),
    } as unknown as FileSystemDirectoryHandle;
    await expect(
      readLocalEvidence(root, ["a.ts"], { signal: controller.signal })
    ).rejects.toMatchObject({ name: "AbortError" });
    await expect(readLocalEvidence(root, [], { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("does not truncate to nothing when the only newline is first", async () => {
    const root = fakeDirectory({ "a.ts": `\n${"x".repeat(200_000)}` });
    const result = await readLocalEvidence(root, ["a.ts"]);
    expect(result.files[0].content.length).toBe(LOCAL_SOURCE_LIMITS.evidenceAttachmentCharacters);
    expect(result.files[0].truncated).toBe(true);
  });
});
