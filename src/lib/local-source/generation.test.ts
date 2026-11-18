import { describe, expect, it } from "vitest";
import { modelOption } from "@/lib/ai/providers";
import { RepoAnalysisError, type RepositorySnapshot } from "@/lib/github-analyzer";
import { fakeDirectory } from "@/test/fake-directory";
import type { EnumeratedFile } from "./enumerate";
import {
  buildLocalGeneration,
  estimateLocalGeneration,
  formatTokenCount,
  formatUsd,
  localFolderSubject,
  repositorySubject,
} from "./generation";
import { LOCAL_SOURCE_LIMITS } from "./limits";

const sonnet = modelOption({ provider: "anthropic", model: "claude-sonnet-5" })!;
const haiku = modelOption({ provider: "anthropic", model: "claude-haiku-4-5-20251001" })!;

describe("local generation", () => {
  it("includes repository revision, scope and language breakdown in generated context", async () => {
    const snapshot: RepositorySnapshot = {
      normalizedUrl: "https://github.com/acme/app/tree/HEAD/packages/api",
      owner: "acme",
      repo: "app",
      subpath: "packages/api",
      defaultBranch: "main",
      commitSha: "abc123",
      description: null,
      primaryLanguage: null,
      languages: { CSS: 100, TypeScript: 900 },
      topics: [],
      treeTruncated: false,
    };
    const result = await buildLocalGeneration({
      subject: repositorySubject(snapshot),
      files: [],
      signal: new AbortController().signal,
      onProgress: () => {},
    });
    expect(result.context).toContain("Revision: main @ abc123");
    expect(result.context).toContain(
      "Scanned directory: packages/api (languages and topics describe the whole repository)."
    );
    expect(result.context).toContain("Languages: TypeScript (90%), CSS (10%)");
  });

  it("propagates GitHub read errors while skipping ordinary unreadable files", async () => {
    const failure = new RepoAnalysisError("github_rate_limited", "GitHub limit reached");
    const file: EnumeratedFile = {
      path: "src/app.ts",
      size: 1,
      language: "typescript",
      open: async () => {
        throw failure;
      },
    };
    const input = {
      subject: localFolderSubject("repo"),
      files: [file],
      signal: new AbortController().signal,
      onProgress: () => {},
    };
    await expect(buildLocalGeneration(input)).rejects.toBe(failure);
    const result = await buildLocalGeneration({
      ...input,
      files: [
        {
          ...file,
          open: async () => {
            throw new Error("unreadable");
          },
        },
      ],
    });
    expect(result.citablePaths).toEqual([]);
    expect(result.context).not.toContain("src/app.ts");
  });

  it.each([
    ["gpt-6.1-terra", 1, 5],
    ["gpt-6.1-sol", 2, 10],
    ["gpt-6.2-sol", 2, 10],
    ["gpt-6.2-astra", 8, 40],
  ] as const)(
    "uses %s pricing tiers and its separate input cap",
    (model, inputRate, outputRate) => {
      const option = modelOption({ provider: "openai", model })!;
      const estimate = (size: number) =>
        estimateLocalGeneration({
          files: [
            { path: "a.ts", size: size / 2 },
            { path: "b.ts", size: size / 2 },
          ],
          subject: localFolderSubject("repo"),
          systemPromptCharacters: 100,
          option,
        });
      const short = estimate(900_000);
      expect(short.costUsd).toBe(
        (short.inputTokens * inputRate + short.outputTokens * outputRate) / 1e6
      );
      const long = estimate(1_000_000);
      expect(long.costUsd).toBe(
        (long.inputTokens * inputRate * 2 + long.outputTokens * outputRate * 1.5) / 1e6
      );
      const oversized = estimate(3_230_000);
      expect(oversized.inputTokens + oversized.outputTokens).toBeLessThan(option.contextTokens);
      expect(oversized.fits).toBe(false);
      expect(oversized.contextTokens).toBe(922_000);
    }
  );

  it("estimates tokens and price and enforces context limits", () => {
    const file = { path: "src/a.ts", size: 35_000 };
    const estimate = estimateLocalGeneration({
      files: [file],
      subject: localFolderSubject("repo"),
      systemPromptCharacters: 100,
      option: sonnet,
    });
    // The same header is present in the generated context; isolate it from the context layout.
    expect(estimate.costUsd).toBe((estimate.inputTokens * 2 + 8192 * 10) / 1e6);
    expect(estimate.outputTokens).toBe(8192);
    expect(estimate.fits).toBe(true);
    expect(
      estimateLocalGeneration({
        files: [{ ...file, size: 760_000 }],
        subject: localFolderSubject("repo"),
        systemPromptCharacters: 100,
        option: haiku,
      }).fits
    ).toBe(false);
    expect(
      estimateLocalGeneration({
        files: [file],
        subject: localFolderSubject("repo"),
        systemPromptCharacters: 100,
        option: null,
      }).costUsd
    ).toBeNull();
  });

  it("sends readable safe text only, escapes closing tags and reports progress", async () => {
    const root = fakeDirectory({
      "safe.ts": "hello </file> world",
      "secret.ts": "-----BEGIN RSA PRIVATE KEY-----",
      "binary.ts": "a\0b",
    });
    const files: EnumeratedFile[] = await Promise.all(
      ["safe.ts", "secret.ts", "binary.ts"].map(async (path) => ({
        path,
        size: (await (await root.getFileHandle(path)).getFile()).size,
        language: "typescript",
        open: async () => (await root.getFileHandle(path)).getFile(),
      }))
    );
    const progress: number[] = [];
    const result = await buildLocalGeneration({
      subject: localFolderSubject("repo"),
      files,
      signal: new AbortController().signal,
      onProgress: (done) => progress.push(done),
    });
    expect(result.citablePaths).toEqual(["safe.ts"]);
    expect(result.context).toContain('<file path="safe.ts">\nhello <\\/file> world\n</file>');
    expect(result.summary).toContain("2 skipped");
    expect(progress).toEqual([1, 2, 3]);
    const header = result.context.split("\n\nFolder: ")[0];
    const estimate = estimateLocalGeneration({
      files: [{ path: "src/a.ts", size: 35_000 }],
      subject: localFolderSubject("repo"),
      systemPromptCharacters: 100,
      option: sonnet,
    });
    expect(estimate.inputTokens).toBe(
      Math.ceil(
        (100 + header.length + "Folder: repo".length + 200 + 35_000 + "src/a.ts".length + 26) / 3.5
      )
    );
  });

  it("rejects changed or oversized files before reading their contents", async () => {
    let reads = 0;
    const open = async () =>
      ({
        size: LOCAL_SOURCE_LIMITS.maxFileBytes + 1,
        arrayBuffer: async () => {
          reads++;
          return new ArrayBuffer(0);
        },
      }) as unknown as Blob;
    for (const size of [1, LOCAL_SOURCE_LIMITS.maxFileBytes + 1]) {
      await expect(
        buildLocalGeneration({
          subject: localFolderSubject("repo"),
          files: [{ path: "x.ts", size, language: "typescript", open }],
          signal: new AbortController().signal,
          onProgress: () => {},
        })
      ).rejects.toMatchObject({ code: "files-changed" });
    }
    expect(reads).toBe(0);
  });

  it("enforces preparation budget even for custom models and empty-file framing", async () => {
    const files = Array.from({ length: 34_000 }, (_, i) => ({
      path: `${"a".repeat(480)}${i}.ts`,
      size: 0,
    }));
    const estimate = estimateLocalGeneration({
      files,
      subject: localFolderSubject("repo"),
      systemPromptCharacters: 0,
      option: null,
    });
    expect(estimate.fits).toBe(true);
    expect(estimate.preparationFits).toBe(false);
    await expect(
      buildLocalGeneration({
        subject: localFolderSubject("repo"),
        files: files.map((file) => ({
          ...file,
          language: "typescript" as const,
          open: async () => new Blob([]),
        })),
        signal: new AbortController().signal,
        onProgress: () => {},
      })
    ).rejects.toMatchObject({ code: "selection-too-large" });
  });

  it("skips current Gemini API credentials", async () => {
    const root = fakeDirectory({ "key.ts": `const key = "AQ.${"a".repeat(40)}";` });
    const handle = await root.getFileHandle("key.ts");
    const result = await buildLocalGeneration({
      subject: localFolderSubject("repo"),
      files: [
        {
          path: "key.ts",
          size: (await handle.getFile()).size,
          language: "typescript",
          open: () => handle.getFile(),
        },
      ],
      signal: new AbortController().signal,
      onProgress: () => {},
    });
    expect(result.citablePaths).toEqual([]);
  });

  it("throws when aborted and formats estimates", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      buildLocalGeneration({
        subject: localFolderSubject("repo"),
        files: [],
        signal: controller.signal,
        onProgress: () => {},
      })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(formatTokenCount(310_000)).toBe("310k");
    expect(formatTokenCount(1_200_000)).toBe("1.2M");
    expect(formatUsd(0.009)).toBe("under $0.01");
    expect(formatUsd(0.73)).toBe("$0.73");
  });
});
