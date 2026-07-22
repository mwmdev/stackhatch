import type { NodeCategory } from "@/types/stack";
import { nodeConfig, type SubtypeConfig } from "@/lib/node-config";
import * as lucideIcons from "lucide-react";

export interface CustomSubtypeEntry {
  slug: string;
  displayName: string;
  icon: string;
}

export type CustomSubtypesMap = Partial<Record<NodeCategory, CustomSubtypeEntry[]>>;

const MAX_ENTRIES_PER_CATEGORY = 20;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LINE_BREAK_PATTERN = /[\r\n\u2028\u2029]/;
const ENTRY_KEYS = ["displayName", "icon", "slug"];
const NODE_CATEGORIES = Object.keys(nodeConfig) as NodeCategory[];
const NODE_CATEGORY_SET = new Set<string>(NODE_CATEGORIES);

export class CustomSubtypesValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomSubtypesValidationError";
  }
}

function fail(message: string): never {
  throw new CustomSubtypesValidationError(`Invalid custom subtypes: ${message}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isSupportedLucideIcon(icon: string): boolean {
  const candidate = (lucideIcons as unknown as Record<string, unknown>)[icon];
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    "$$typeof" in candidate &&
    candidate.$$typeof === Symbol.for("react.forward_ref")
  );
}

export function validateCustomSubtypes(value: unknown): CustomSubtypesMap {
  if (!isPlainObject(value)) fail("the catalog must be an object");

  const validated: CustomSubtypesMap = {};
  for (const [categoryName, rawEntries] of Object.entries(value)) {
    if (!NODE_CATEGORY_SET.has(categoryName)) {
      fail(`unknown category \"${categoryName}\"`);
    }
    const category = categoryName as NodeCategory;
    if (!Array.isArray(rawEntries)) {
      fail(`category \"${category}\" must be an array`);
    }
    if (rawEntries.length > MAX_ENTRIES_PER_CATEGORY) {
      fail(`category \"${category}\" cannot contain more than 20 entries`);
    }

    const slugs = new Set<string>();
    const entries: CustomSubtypeEntry[] = [];
    for (const [index, rawEntry] of rawEntries.entries()) {
      if (!isPlainObject(rawEntry)) {
        fail(`entry ${index + 1} in \"${category}\" must be an object`);
      }
      const keys = Object.keys(rawEntry).sort();
      if (keys.length !== ENTRY_KEYS.length || keys.some((key, i) => key !== ENTRY_KEYS[i])) {
        fail(
          `entry ${index + 1} in \"${category}\" must contain exactly slug, displayName, and icon`
        );
      }

      const { slug, displayName, icon } = rawEntry;
      if (typeof slug !== "string" || slug.length < 1 || slug.length > 40) {
        fail(`entry ${index + 1} in \"${category}\" has a slug outside 1-40 characters`);
      }
      if (!SLUG_PATTERN.test(slug)) {
        fail(`slug \"${slug}\" in \"${category}\" must be kebab-case`);
      }
      if (Object.hasOwn(nodeConfig[category].subtypes, slug)) {
        fail(`slug \"${slug}\" in \"${category}\" collides with a built-in subtype`);
      }
      if (slugs.has(slug)) {
        fail(`slug \"${slug}\" in \"${category}\" must be unique`);
      }

      if (typeof displayName !== "string" || displayName.length < 1 || displayName.length > 60) {
        fail(`entry \"${slug}\" in \"${category}\" has a displayName outside 1-60 characters`);
      }
      if (displayName !== displayName.trim()) {
        fail(`displayName for \"${slug}\" in \"${category}\" must be trimmed`);
      }
      if (LINE_BREAK_PATTERN.test(displayName)) {
        fail(`displayName for \"${slug}\" in \"${category}\" cannot contain line breaks`);
      }
      if (typeof icon !== "string" || !isSupportedLucideIcon(icon)) {
        fail(`icon for \"${slug}\" in \"${category}\" must name a supported Lucide icon`);
      }

      slugs.add(slug);
      entries.push({ slug, displayName, icon });
    }
    validated[category] = entries;
  }

  return validated;
}

export function parseCustomSubtypes(json: string | undefined): CustomSubtypesMap {
  if (json === undefined) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    fail("the catalog must be valid JSON");
  }
  return validateCustomSubtypes(parsed);
}

export function serializeCustomSubtypes(value: unknown): string {
  const validated = validateCustomSubtypes(value);
  const ordered: CustomSubtypesMap = {};
  for (const category of NODE_CATEGORIES) {
    if (validated[category] !== undefined) {
      ordered[category] = validated[category];
    }
  }
  return JSON.stringify(ordered);
}

export function getMergedSubtypes(
  category: NodeCategory,
  custom?: CustomSubtypesMap
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
