import { describe, expect, it } from "vitest";
import { LOCAL_SOURCE_LIMITS } from "./limits";
import {
  buildFolderTree,
  folderCheckState,
  hasExcludedAncestor,
  isPathIncluded,
  normalizeExcludedPaths,
  toggleFolder,
} from "./folder-tree";

const files = [
  { path: "a/x.ts", size: 10 },
  { path: "a/b/y.ts", size: 20 },
  { path: "c/z.ts", size: 30 },
  { path: "r.md", size: 40 },
];

describe("folder tree", () => {
  it("counts files and bytes recursively, keeping root files separate", () => {
    expect(buildFolderTree(files)).toEqual({
      rootFiles: { files: 1, bytes: 40 },
      folders: [
        {
          path: "a",
          name: "a",
          files: 2,
          bytes: 30,
          children: [{ path: "a/b", name: "b", files: 1, bytes: 20, children: [] }],
        },
        { path: "c", name: "c", files: 1, bytes: 30, children: [] },
      ],
    });
  });

  it("sorts every level and handles an empty tree", () => {
    expect(buildFolderTree([])).toEqual({ rootFiles: { files: 0, bytes: 0 }, folders: [] });
    const tree = buildFolderTree([
      { path: "z/file", size: 1 },
      { path: "a/z/file", size: 2 },
      { path: "a/b/file", size: 3 },
    ]);
    expect(tree.folders.map((node) => node.name)).toEqual(["a", "z"]);
    expect(tree.folders[0].children.map((node) => node.name)).toEqual(["b", "z"]);
  });

  it("excludes descendant files and detects locked rows without matching path prefixes", () => {
    const excluded = toggleFolder("a", new Set<string>());
    expect(isPathIncluded("a/b/y.ts", excluded)).toBe(false);
    expect(isPathIncluded("a/x.ts", excluded)).toBe(false);
    expect(isPathIncluded("ab/y.ts", excluded)).toBe(true);
    expect(isPathIncluded("r.md", new Set(["r.md"]))).toBe(false);
    expect(isPathIncluded("r.md", excluded)).toBe(true);
    expect(hasExcludedAncestor("a/b", excluded)).toBe(true);
    expect(hasExcludedAncestor("a", excluded)).toBe(false);
    expect(hasExcludedAncestor("ab/b", excluded)).toBe(false);
    expect(folderCheckState("a", excluded)).toBe("unchecked");
    expect(toggleFolder("a", excluded).size).toBe(0);
  });

  it("clears descendant exclusions when toggling a mixed folder", () => {
    const excluded = toggleFolder("a/b", new Set<string>());
    excluded.add("other");
    expect(folderCheckState("a", excluded)).toBe("mixed");
    expect(folderCheckState("ab", excluded)).toBe("checked");
    expect(toggleFolder("a", excluded)).toEqual(new Set(["other"]));
    expect(excluded).toEqual(new Set(["a/b", "other"]));
  });

  it("retains absent paths while removing duplicates and descendants", () => {
    expect(normalizeExcludedPaths(["gone", "a", "a/b"])).toEqual(["a", "gone"]);
    expect(normalizeExcludedPaths(["c", "a/b", "a/b"])).toEqual(["a/b", "c"]);
    expect(normalizeExcludedPaths(["folder ", "folder /child"])).toEqual(["folder "]);
  });

  it("does not truncate exclusions beyond the dialog limit", () => {
    const paths = Array.from(
      { length: LOCAL_SOURCE_LIMITS.maxExcludedPaths + 2 },
      (_, i) => `folder-${String(i).padStart(5, "0")}`
    ).reverse();
    const normalized = normalizeExcludedPaths(paths);
    expect(normalized).toHaveLength(LOCAL_SOURCE_LIMITS.maxExcludedPaths + 2);
    expect(normalized[0]).toBe("folder-00000");
    expect(normalized.at(-1)).toBe("folder-05001");
  });
});
