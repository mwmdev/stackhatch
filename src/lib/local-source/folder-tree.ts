export interface FolderTreeNode {
  path: string;
  name: string;
  files: number;
  bytes: number;
  children: FolderTreeNode[];
}

export interface FolderTree {
  rootFiles: { files: number; bytes: number };
  folders: FolderTreeNode[];
}

export type FolderCheckState = "checked" | "mixed" | "unchecked";

export function buildFolderTree(files: readonly { path: string; size: number }[]): FolderTree {
  const tree: FolderTree = { rootFiles: { files: 0, bytes: 0 }, folders: [] };
  const nodes = new Map<string, FolderTreeNode>();

  for (const file of files) {
    const segments = file.path.split("/");
    if (segments.length === 1) {
      tree.rootFiles.files++;
      tree.rootFiles.bytes += file.size;
      continue;
    }

    let path = "";
    let siblings = tree.folders;
    for (const name of segments.slice(0, -1)) {
      path = path ? `${path}/${name}` : name;
      let node = nodes.get(path);
      if (!node) {
        node = { path, name, files: 0, bytes: 0, children: [] };
        nodes.set(path, node);
        siblings.push(node);
      }
      node.files++;
      node.bytes += file.size;
      siblings = node.children;
    }
  }

  const sortFolders = (folders: FolderTreeNode[]) => {
    folders.sort((a, b) => a.name.localeCompare(b.name, "en"));
    for (const folder of folders) sortFolders(folder.children);
  };
  sortFolders(tree.folders);
  return tree;
}

export function hasExcludedAncestor(path: string, excluded: ReadonlySet<string>): boolean {
  let separator = path.indexOf("/");
  while (separator !== -1) {
    if (excluded.has(path.slice(0, separator))) return true;
    separator = path.indexOf("/", separator + 1);
  }
  return false;
}

export function isPathIncluded(filePath: string, excluded: ReadonlySet<string>): boolean {
  return !excluded.has(filePath) && !hasExcludedAncestor(filePath, excluded);
}

export function folderCheckState(path: string, excluded: ReadonlySet<string>): FolderCheckState {
  if (excluded.has(path)) return "unchecked";
  const prefix = `${path}/`;
  for (const item of excluded) {
    if (item.startsWith(prefix)) return "mixed";
  }
  return "checked";
}

export function toggleFolder(path: string, excluded: ReadonlySet<string>): Set<string> {
  const next = new Set(excluded);
  const state = folderCheckState(path, excluded);
  if (state === "unchecked") {
    next.delete(path);
  } else {
    const prefix = `${path}/`;
    for (const item of next) {
      if (item.startsWith(prefix)) next.delete(item);
    }
    if (state === "checked") next.add(path);
  }
  return next;
}

export function normalizeExcludedPaths(paths: readonly string[]): string[] {
  const result = new Set<string>();
  for (const path of [...new Set(paths)].sort()) {
    if (!hasExcludedAncestor(path, result)) result.add(path);
  }
  return [...result];
}
