import { CANVAS_EVIDENCE_LIMITS } from "@/lib/canvas-limits";
import type { StackArchitecture, StackNode } from "@/types/stack";

const UNSAFE_PATH = /[\\\u0000-\u001f\u007f]/;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** True for a string that cannot be encoded as UTF-8 or percent-encoded into a URL. */
export function hasLoneSurrogate(value: string): boolean {
  return LONE_SURROGATE.test(value);
}

/** A repository-rooted file path, or null when the value cannot be one. */
export function normalizeEvidencePath(value: unknown, options?: { trim?: boolean }): string | null {
  if (typeof value !== "string") return null;
  const path = (options?.trim === false ? value : value.trim()).replace(/^(?:\.\/)+/, "");
  if (
    !path ||
    path.length > CANVAS_EVIDENCE_LIMITS.pathLength ||
    UNSAFE_PATH.test(path) ||
    hasLoneSurrogate(path)
  ) {
    return null;
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return null;
  }
  return path;
}

/** Bounded, de-duplicated evidence paths; undefined when none remain. */
export function normalizeEvidencePaths(
  value: unknown,
  allowed?: ReadonlySet<string>
): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const paths: string[] = [];
  for (const item of value) {
    const path = normalizeEvidencePath(item);
    if (!path || paths.includes(path) || (allowed && !allowed.has(path))) continue;
    paths.push(path);
    if (paths.length === CANVAS_EVIDENCE_LIMITS.pathsPerNode) break;
  }
  return paths.length > 0 ? paths : undefined;
}

function withEvidence(node: StackNode, evidence: string[] | undefined): StackNode {
  const { evidence: _evidence, ...rest } = node;
  return evidence ? { ...rest, evidence } : rest;
}

/**
 * Evidence comes from repository scans, never from the model's imagination.
 * A scan may cite only the files it listed (`citable`). Any other run may keep
 * paths already on the map, and a node returned without the field keeps its own.
 */
export function applyEvidencePolicy(
  incoming: StackArchitecture,
  current: StackArchitecture | null,
  citable: ReadonlySet<string> | null
): StackArchitecture {
  const currentById = new Map(current?.nodes.map((node) => [node.id, node]));
  const allowed = citable ?? new Set(current?.nodes.flatMap((node) => node.evidence ?? []));
  return {
    ...incoming,
    nodes: incoming.nodes.map((node) =>
      withEvidence(
        node,
        !citable && node.evidence === undefined
          ? currentById.get(node.id)?.evidence
          : normalizeEvidencePaths(node.evidence, allowed)
      )
    ),
  };
}
