import { z } from "zod";
import type { StackArchitecture } from "@/types/stack";
import { CANVAS_ID_PATTERN, CANVAS_TEXT_LIMITS } from "@/lib/canvas-limits";

const nodeCategories = ["client", "api", "services", "data", "infrastructure", "external"] as const;
const nodeCategoriesWithNotes = [...nodeCategories, "note"] as const;

const noteColors = ["yellow", "mint", "peach", "sky", "lilac"] as const;

const connectionTypes = ["http", "websocket", "grpc", "tcp", "pub-sub", "file-io"] as const;

function createStackNodeSchema(allowNoteNodes: boolean) {
  return z.object({
    id: z.string().min(1),
    category: z.enum(allowNoteNodes ? nodeCategoriesWithNotes : nodeCategories),
    subtype: z.string().min(1),
    name: z.string().min(1),
    technology: z.string(),
    description: z.string(),
    reasoning: z.string(),
    locked: z.boolean(),
    noteColor: z.enum(noteColors).optional(),
  });
}

const stackEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  connectionType: z.enum(connectionTypes),
  label: z.string(),
});

export const stackArchitectureSchema = z.object({
  nodes: z.array(createStackNodeSchema(true)),
  edges: z.array(stackEdgeSchema),
});

export interface ParsedAIResponse {
  message: string;
  architecture: StackArchitecture | null;
}

function hasValidNodeAndEdgeReferences(architecture: StackArchitecture): boolean {
  const nodeIds = new Set<string>();
  for (const node of architecture.nodes) {
    if (nodeIds.has(node.id)) return false;
    nodeIds.add(node.id);
  }

  const edgeIds = new Set<string>();
  for (const edge of architecture.edges) {
    if (edgeIds.has(edge.id)) return false;
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return false;
  }

  return true;
}

function uniqueId(candidate: string, used: Set<string>): string {
  const base = candidate.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 128) || "id";
  let next = base;
  for (let suffix = 2; used.has(next); suffix++) {
    next = `${base.slice(0, 128 - String(suffix).length - 1)}-${suffix}`;
  }
  used.add(next);
  return next;
}

export function normalizeArchitecture(architecture: StackArchitecture): {
  architecture: StackArchitecture;
  nodeIdMap: Map<string, string>;
} {
  // Keep valid IDs intact even if an earlier invalid ID normalizes to the same spelling.
  const nodeIds = new Set(
    architecture.nodes.filter((node) => CANVAS_ID_PATTERN.test(node.id)).map((node) => node.id)
  );
  const mappedIds = new Map<string, string>();
  const nodes = architecture.nodes.map((node) => {
    const id = CANVAS_ID_PATTERN.test(node.id) ? node.id : uniqueId(node.id, nodeIds);
    mappedIds.set(node.id, id);
    return {
      ...node,
      id,
      subtype: node.subtype.slice(0, CANVAS_TEXT_LIMITS.nodeSubtype),
      name: node.name.slice(0, CANVAS_TEXT_LIMITS.nodeName),
      technology: node.technology.slice(0, CANVAS_TEXT_LIMITS.nodeTechnology),
    };
  });
  const edgeIds = new Set(
    architecture.edges.filter((edge) => CANVAS_ID_PATTERN.test(edge.id)).map((edge) => edge.id)
  );
  const seenEdgeIds = new Set<string>();
  const edges = architecture.edges.map((edge) => {
    const id =
      CANVAS_ID_PATTERN.test(edge.id) && !seenEdgeIds.has(edge.id)
        ? edge.id
        : uniqueId(edge.id, edgeIds);
    seenEdgeIds.add(id);
    return {
      ...edge,
      id,
      source: mappedIds.get(edge.source) ?? edge.source,
      target: mappedIds.get(edge.target) ?? edge.target,
      label: edge.label.slice(0, CANVAS_TEXT_LIMITS.edgeLabel),
    };
  });
  return { architecture: { nodes, edges }, nodeIdMap: mappedIds };
}

/**
 * Extracts a `<stack>...</stack>` JSON block from an AI response.
 * Returns the cleaned message text and the parsed architecture (or null).
 */
export function parseAIResponse(
  text: string,
  options: { allowNoteNodes?: boolean } = {}
): ParsedAIResponse {
  const stackRegex = /<stack>\s*([\s\S]*?)\s*<\/stack>/;
  const match = stackRegex.exec(text);

  if (!match) {
    return { message: text, architecture: null };
  }

  const jsonStr = match[1];
  const cleanedMessage = text.replace(stackRegex, "").trim();

  try {
    const parsed = JSON.parse(jsonStr);
    const schema = z.object({
      nodes: z.array(createStackNodeSchema(options.allowNoteNodes ?? true)),
      edges: z.array(stackEdgeSchema),
    });
    const result = schema.safeParse(parsed);

    if (result.success && hasValidNodeAndEdgeReferences(result.data)) {
      return {
        message: cleanedMessage,
        architecture: normalizeArchitecture(result.data).architecture,
      };
    }

    // Validation failed — return message without architecture
    return { message: cleanedMessage, architecture: null };
  } catch {
    // JSON parse failed — return message without architecture
    return { message: cleanedMessage, architecture: null };
  }
}
