/* The architecture map behind the landing page. The hero's faint backdrop and the lens's detailed
   copy share HERO_NODES/HERO_EDGES; below the hero the map descends the stack, one layer per band.
   Everything here is geometry: no DOM. */

export type Tone = "client" | "api" | "services" | "data" | "infrastructure" | "external";
export type Wire = "http" | "websocket" | "grpc" | "tcp";

export const TONE_LABEL: Record<Tone, string> = {
  client: "Client",
  api: "API Layer",
  services: "Services",
  data: "Data",
  infrastructure: "Infra",
  external: "External",
};

/* ---------- Hero (viewBox 0 0 760 300, anchored bottom right) ---------- */

export const HERO_VIEWBOX = { width: 760, height: 300 } as const;
export const HERO_NODE = { width: 110, height: 40 } as const;

export const HERO_NODES = [
  { x: 170, y: 24, name: "Web app", tech: "Next.js", tone: "client" },
  { x: 470, y: 12, name: "Mobile app", tech: "React Native", tone: "client" },
  { x: 330, y: 120, name: "Edge CDN", tech: "Cache + TLS", tone: "infrastructure" },
  { x: 600, y: 118, name: "Admin console", tech: "Vite + React", tone: "client" },
] as const satisfies readonly { x: number; y: number; name: string; tech: string; tone: Tone }[];

export const HERO_EDGES = [
  "M225 64 C225 95 385 90 385 120",
  "M525 52 C525 90 385 85 385 120",
  "M525 52 C525 90 655 85 655 118",
  "M385 160 C385 230 20 220 20 300",
  "M655 158 C655 230 735 220 735 300",
] as const;

/** Where the two hero connectors leave the band, in hero viewBox units; they continue below. */
export const HERO_EXITS = { left: 20, right: 735 } as const;

/* ---------- Below the hero: one layer of the stack per band ---------- */

export type Band = "audience" | "features" | "privacy" | "closing";

/**
 * `fx` is the node centre as a fraction of the band width. `at` places it vertically: level with
 * the band heading's centre (`head`), or `offset` px above the band's bottom edge (`bottom`).
 */
export interface StackNode {
  id: string;
  band: Band;
  fx: number;
  at: "head" | "bottom";
  offset?: number;
  name: string;
  tech: string;
  tone: Tone;
}

export const STACK_NODES: readonly StackNode[] = [
  {
    id: "gateway",
    band: "audience",
    fx: 0.6,
    at: "head",
    name: "API gateway",
    tech: "Hono",
    tone: "api",
  },
  {
    id: "auth",
    band: "audience",
    fx: 0.84,
    at: "head",
    name: "Auth",
    tech: "OIDC + JWT",
    tone: "api",
  },
  {
    id: "billing",
    band: "features",
    fx: 0.52,
    at: "head",
    name: "Billing worker",
    tech: "Node",
    tone: "services",
  },
  {
    id: "search",
    band: "features",
    fx: 0.71,
    at: "head",
    name: "Search",
    tech: "Go",
    tone: "services",
  },
  {
    id: "queue",
    band: "features",
    fx: 0.9,
    at: "head",
    name: "Job queue",
    tech: "BullMQ",
    tone: "services",
  },
  {
    id: "notify",
    band: "features",
    fx: 0.3,
    at: "bottom",
    offset: 44,
    name: "Notifications",
    tech: "Email + push",
    tone: "services",
  },
  {
    id: "events",
    band: "features",
    fx: 0.72,
    at: "bottom",
    offset: 44,
    name: "Event bus",
    tech: "NATS",
    tone: "services",
  },
  {
    id: "postgres",
    band: "privacy",
    fx: 0.62,
    at: "head",
    name: "PostgreSQL",
    tech: "Primary + replica",
    tone: "data",
  },
  {
    id: "redis",
    band: "privacy",
    fx: 0.79,
    at: "head",
    name: "Redis",
    tech: "Sessions",
    tone: "data",
  },
  {
    id: "objects",
    band: "privacy",
    fx: 0.94,
    at: "head",
    name: "Object storage",
    tech: "S3",
    tone: "data",
  },
  {
    id: "cluster",
    band: "closing",
    fx: 0.6,
    at: "head",
    name: "Cluster",
    tech: "Kubernetes",
    tone: "infrastructure",
  },
  {
    id: "stripe",
    band: "closing",
    fx: 0.77,
    at: "head",
    name: "Stripe",
    tech: "Payments API",
    tone: "external",
  },
];

/** `from` may be a hero exit; edges run top to bottom. */
export const STACK_EDGES: readonly { from: string; to: string; wire: Wire }[] = [
  { from: "hero:left", to: "gateway", wire: "http" },
  { from: "hero:right", to: "auth", wire: "http" },
  { from: "gateway", to: "billing", wire: "grpc" },
  { from: "gateway", to: "search", wire: "grpc" },
  { from: "auth", to: "queue", wire: "http" },
  { from: "queue", to: "events", wire: "websocket" },
  { from: "billing", to: "notify", wire: "websocket" },
  { from: "billing", to: "postgres", wire: "tcp" },
  { from: "search", to: "redis", wire: "tcp" },
  { from: "events", to: "objects", wire: "tcp" },
  { from: "postgres", to: "cluster", wire: "tcp" },
  { from: "notify", to: "stripe", wire: "http" },
];

export const STACK_NODE = { width: 156, height: 48 } as const;

/* ---------- Layout ---------- */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Page geometry measured from the DOM; all values in page (document) pixels. */
export interface PageGeometry {
  bands: Partial<Record<Band, { box: Box; headY: number; obstacles: Box[] }>>;
  /** The hero lens's box; the hero map is laid out inside it, anchored bottom right. */
  hero?: Box;
  /** The overlay's box: all of `main`. */
  overlay?: Box;
  heroExits?: { left: { x: number; y: number }; right: { x: number; y: number } };
}

export interface PlacedNode extends StackNode {
  x: number;
  y: number;
}

export interface PlacedEdge {
  d: string;
  wire: Wire;
}

const EDGE_INSET = 12;
const CLEARANCE = 24;

function overlaps(a: Box, b: Box, margin: number): boolean {
  return (
    a.left < b.left + b.width + margin &&
    b.left < a.left + a.width + margin &&
    a.top < b.top + b.height + margin &&
    b.top < a.top + a.height + margin
  );
}

/** A vertical S-curve, like the editor's connectors, from a bottom port to a top port. */
function curve(x1: number, y1: number, x2: number, y2: number): string {
  const bend = Math.max(36, (y2 - y1) / 2);
  return `M${x1} ${y1} C${x1} ${y1 + bend} ${x2} ${y2 - bend} ${x2} ${y2}`;
}

export interface StackLayout {
  nodes: PlacedNode[];
  edges: PlacedEdge[];
}

/**
 * Places each node in its band, clamped inside the band and dropped where it would collide with
 * the band's heading text, call to action or an earlier node, then routes the edges between the
 * survivors.
 */
export function layoutStack(geometry: PageGeometry): StackLayout {
  const { width: w, height: h } = STACK_NODE;
  const placed = new Map<string, PlacedNode>();

  for (const node of STACK_NODES) {
    const band = geometry.bands[node.band];
    if (!band) continue;
    const { box, headY, obstacles } = band;
    const minX = box.left + EDGE_INSET + w / 2;
    const maxX = box.left + box.width - EDGE_INSET - w / 2;
    if (maxX < minX) continue;
    const x = Math.min(maxX, Math.max(minX, box.left + node.fx * box.width));
    const y = node.at === "head" ? headY : box.top + box.height - (node.offset ?? h);
    const rect = { left: x - w / 2, top: y - h / 2, width: w, height: h };
    if (rect.top < box.top || rect.top + h > box.top + box.height) continue;
    if (obstacles.some((o) => overlaps(rect, o, CLEARANCE))) continue;
    const others = [...placed.values()].map((p) => ({
      left: p.x - w / 2,
      top: p.y - h / 2,
      width: w,
      height: h,
    }));
    if (others.some((o) => overlaps(rect, o, CLEARANCE))) continue;
    placed.set(node.id, { ...node, x, y });
  }

  const edges: PlacedEdge[] = [];
  for (const { from, to, wire } of STACK_EDGES) {
    const target = placed.get(to);
    if (!target) continue;
    let start: { x: number; y: number } | undefined;
    if (from === "hero:left" || from === "hero:right") {
      start = geometry.heroExits?.[from === "hero:left" ? "left" : "right"];
    } else {
      const source = placed.get(from);
      if (source) start = { x: source.x, y: source.y + h / 2 };
    }
    if (!start) continue;
    edges.push({ d: curve(start.x, start.y, target.x, target.y - h / 2), wire });
  }

  return { nodes: [...placed.values()], edges };
}
