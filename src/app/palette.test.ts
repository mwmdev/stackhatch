import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the design tokens against contrast regressions.
 *
 * The palette is defined entirely in `globals.css` (no colour literals exist in
 * `.tsx`), so parsing that file is enough to verify the whole system. Thresholds
 * follow WCAG 2.2: 4.5:1 for normal text (SC 1.4.3) and 3:1 for control
 * boundaries, focus indicators, and meaningful graphics (SC 1.4.11).
 */

const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
// Comments are stripped up front: a `/* ... */` run merges into the following
// declaration when splitting on `;`, which would silently hide that token.
const TOKENS_CSS = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

const TEXT_MIN = 4.5;
const NON_TEXT_MIN = 3;

function readBlock(selector: string) {
  // Matches the first `selector { ... }` block. The token blocks contain no
  // nested braces, so a non-greedy match to the first `}` is sufficient.
  const match = TOKENS_CSS.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`No ${selector} block in globals.css`);
  const declarations: Record<string, string> = {};
  for (const line of match[1].split(";")) {
    const [rawName, ...rest] = line.split(":");
    const name = rawName.trim();
    if (!name.startsWith("--")) continue;
    declarations[name] = rest.join(":").trim();
  }
  return declarations;
}

function resolve(
  name: string,
  declarations: Record<string, string>,
  seen = new Set<string>()
): string {
  if (seen.has(name)) throw new Error(`Circular token reference at ${name}`);
  seen.add(name);
  const value = declarations[name];
  if (value === undefined) throw new Error(`Undefined token ${name}`);
  const reference = value.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  return reference ? resolve(reference[1], declarations, seen) : value;
}

/** Returns sRGB channels in 0-1, or null for values this test cannot compare. */
function parseColor(value: string): [number, number, number] | null {
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const digits =
      hex[1].length === 3
        ? hex[1]
            .split("")
            .map((d) => d + d)
            .join("")
        : hex[1];
    return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16) / 255) as [
      number,
      number,
      number,
    ];
  }
  const rgb = value.match(/^rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*[\d.]+\s*)?\)$/);
  if (rgb) return [1, 2, 3].map((i) => Number(rgb[i]) / 255) as [number, number, number];
  // color-mix() and other computed forms are out of scope for static checking.
  return null;
}

function relativeLuminance([r, g, b]: [number, number, number]) {
  const linear = [r, g, b].map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground: string, background: string) {
  const a = parseColor(foreground);
  const b = parseColor(background);
  if (!a || !b) return null;
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const THEMES = {
  light: readBlock(":root"),
  // `.dark` overrides a subset; unlisted tokens inherit from `:root`. Merge the
  // raw declarations before resolving so `var()` chains pick up dark values.
  dark: { ...readBlock(":root"), ...readBlock("\\.dark") },
};

const NOTE_COLORS = ["yellow", "mint", "peach", "sky", "lilac"];
const CATEGORIES = [
  "client",
  "api",
  "services",
  "data",
  "infrastructure",
  "external",
  "note",
] as const;
const EDGES = ["http", "websocket", "grpc", "tcp", "pub-sub", "file-io"] as const;

/** Work surfaces that carry text and controls. */
const SURFACES = ["--bg", "--paper", "--canvas", "--field"] as const;

/** [foreground, background] pairs that carry normal-size text. */
const TEXT_PAIRS: [string, string][] = [
  ...SURFACES.map((surface) => ["--ink", surface] as [string, string]),
  ...SURFACES.map((surface) => ["--ink2", surface] as [string, string]),
  // Hover fill of quiet controls and the highlighted menu row.
  ["--ink", "--muted"],
  ["--ink2", "--muted"],
  // Tooltips are an ink chip with page-coloured text.
  ["--bg", "--ink"],
  ["--link", "--bg"],
  ["--link", "--paper"],
  ["--primary-fg", "--primary"],
  ["--primary-fg", "--primary-hover"],
  ["--danger", "--bg"],
  ["--danger", "--paper"],
  ["--danger", "--danger-surface"],
  ["--danger-fg", "--danger"],
  ["--danger-fg", "--danger-hover"],
  ["--success", "--bg"],
  ["--success", "--paper"],
  ["--warning", "--bg"],
  ["--warning", "--paper"],
  // The ink frame, at rest and under a raised (hover, pressed, active) fill.
  ["--frame-fg", "--frame"],
  ["--frame-muted", "--frame"],
  ["--frame-fg", "--frame-raised"],
  ["--frame-muted", "--frame-raised"],
  ["--toast-fg", "--toast-bg"],
  ...NOTE_COLORS.map(
    (name) => [`--note-${name}-foreground`, `--note-${name}-fill`] as [string, string]
  ),
  // Category tag text on its tag fill.
  ...CATEGORIES.map(
    (name) => [`--color-${name}-foreground`, `--color-${name}-fill`] as [string, string]
  ),
];

/**
 * [object, surface] pairs for control boundaries, focus indicators, and
 * graphics that convey meaning. `--rule` and `--frame-rule` are intentionally
 * absent: they are decorative separators. Control boundaries use
 * `--rule-strong`.
 */
const NON_TEXT_PAIRS: [string, string][] = [
  ...SURFACES.map((surface) => ["--rule-strong", surface] as [string, string]),
  ...SURFACES.map((surface) => ["--ring", surface] as [string, string]),
  // Focus rings on hover/active fills and error surfaces.
  ["--ring", "--muted"],
  ["--ring", "--danger-surface"],
  ["--ring-frame", "--frame"],
  ["--toast-ring", "--toast-bg"],
  ["--primary", "--frame"],
  // Selected node border and handles.
  ["--select", "--canvas"],
  ["--select", "--paper"],
  ...EDGES.map((name) => [`--edge-${name}`, "--canvas"] as [string, string]),
  // Category tones on the canvas (thumbnails, exports) and on paper (nodes).
  ...CATEGORIES.map((name) => [`--color-${name}`, "--canvas"] as [string, string]),
  ...CATEGORIES.map((name) => [`--color-${name}`, "--paper"] as [string, string]),
  ...NOTE_COLORS.map(
    (name) => [`--note-${name}-border`, `--note-${name}-fill`] as [string, string]
  ),
];

describe.each(Object.entries(THEMES))("%s theme", (_theme, declarations) => {
  it.each(TEXT_PAIRS)("%s on %s meets 4.5:1 for text", (foreground, background) => {
    const ratio = contrast(resolve(foreground, declarations), resolve(background, declarations));
    expect(ratio).not.toBeNull();
    expect(ratio!).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  it.each(NON_TEXT_PAIRS)("%s on %s meets 3:1 for non-text", (object, surface) => {
    const ratio = contrast(resolve(object, declarations), resolve(surface, declarations));
    expect(ratio).not.toBeNull();
    expect(ratio!).toBeGreaterThanOrEqual(NON_TEXT_MIN);
  });

  it("keeps every node category distinguishable by luminance alone", () => {
    // Category colour is reinforced by an icon and a text badge, but the map is
    // also exported to PNG and printed, so the hues must not collapse in
    // greyscale. 0.02 is roughly one perceptible step at these luminances.
    const luminances = CATEGORIES.map((name) => ({
      name,
      value: relativeLuminance(parseColor(resolve(`--color-${name}`, declarations))!),
    })).sort((a, b) => a.value - b.value);

    for (let i = 1; i < luminances.length; i += 1) {
      const delta = luminances[i].value - luminances[i - 1].value;
      expect(
        delta,
        `${luminances[i - 1].name} and ${luminances[i].name} are too close in greyscale`
      ).toBeGreaterThan(0.02);
    }
  });
});

describe("hero video slot", () => {
  it.each(["--hero-slot", "--hero-slot-edge"])(
    "%s stays light in both themes, because the hero video is light",
    (token) => {
      expect(resolve(token, THEMES.dark)).toBe(resolve(token, THEMES.light));
    }
  );
});

describe("focus indicator", () => {
  it("does not dilute the ring with color-mix", () => {
    // A translucent outline drops below 3:1 against the page. The ring must be
    // a solid token so the computed contrast is the one asserted above.
    const outline = CSS.match(/:focus-visible[^{]*\{[^}]*outline:([^;]*);/);
    expect(outline).not.toBeNull();
    expect(outline![1]).not.toContain("color-mix");
  });
});
