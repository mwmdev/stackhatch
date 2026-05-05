import type { NodeCategory } from "@/types/stack";
import { nodeConfig, categoryOrder } from "@/lib/node-config";
import { getMergedSubtypes, type CustomSubtypesMap } from "@/lib/custom-subtypes";
import { DEFAULT_CHAT_PROMPT } from "@/lib/ai/default-prompts";

function buildSubtypesSection(custom?: CustomSubtypesMap, includeNoteNodes = true): string {
  return categoryOrder
    .filter((cat) => includeNoteNodes || cat !== "note")
    .map((cat: NodeCategory) => {
      const merged = getMergedSubtypes(cat, custom);
      const slugs = Object.keys(merged).join(", ");
      return `- **${cat}**: ${slugs}`;
    })
    .join("\n");
}

export function buildSystemPrompt(
  custom?: CustomSubtypesMap,
  basePrompt?: string,
  options: { includeNoteNodes?: boolean } = {}
): string {
  const subtypesSection = buildSubtypesSection(custom, options.includeNoteNodes ?? true);
  const base = basePrompt ?? DEFAULT_CHAT_PROMPT;

  return `${base}

### Valid Categories and Subtypes
${subtypesSection}`;
}

export const INIT_INSTRUCTION =
  "Begin the architecture interview for a new project. Greet the user warmly and ask your first question about what they are building.";
