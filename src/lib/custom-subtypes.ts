import type { NodeCategory } from "@/types/stack";
import { nodeConfig, type SubtypeConfig } from "@/lib/node-config";

export interface CustomSubtypeEntry {
  slug: string;
  displayName: string;
  icon: string;
}

export type CustomSubtypesMap = Partial<
  Record<NodeCategory, CustomSubtypeEntry[]>
>;

export function parseCustomSubtypes(json: string | undefined): CustomSubtypesMap {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as CustomSubtypesMap;
  } catch {
    return {};
  }
}

export function getMergedSubtypes(
  category: NodeCategory,
  custom?: CustomSubtypesMap,
): Record<string, SubtypeConfig> {
  const builtIn = { ...nodeConfig[category].subtypes };
  const entries = custom?.[category];
  if (!entries) return builtIn;
  for (const entry of entries) {
    if (!builtIn[entry.slug]) {
      builtIn[entry.slug] = {
        displayName: entry.displayName,
        icon: entry.icon,
      };
    }
  }
  return builtIn;
}
