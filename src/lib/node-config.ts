import type { NodeCategory, NodeSubtype, NoteColor } from "@/types/stack";
import type { CustomSubtypesMap } from "@/lib/custom-subtypes";

export interface SubtypeConfig {
  displayName: string;
  icon: string; // lucide-react icon name
}

export interface ResolvedSubtypeConfig extends SubtypeConfig {
  deprecated: boolean;
}

export interface CategoryConfig {
  displayName: string;
  color: string; // CSS variable name
  fill: string; // CSS variable name
  foreground: string; // CSS variable name
  icon: string;
  subtypes: Record<string, SubtypeConfig>;
}

export interface NoteColorConfig {
  value: NoteColor;
  label: string;
  fill: string;
  border: string;
  foreground: string;
}

export const DEFAULT_NOTE_COLOR: NoteColor = "yellow";

export const NOTE_COLOR_OPTIONS: NoteColorConfig[] = [
  {
    value: "yellow",
    label: "Butter",
    fill: "var(--note-yellow-fill)",
    border: "var(--note-yellow-border)",
    foreground: "var(--note-yellow-foreground)",
  },
  {
    value: "mint",
    label: "Mint",
    fill: "var(--note-mint-fill)",
    border: "var(--note-mint-border)",
    foreground: "var(--note-mint-foreground)",
  },
  {
    value: "peach",
    label: "Peach",
    fill: "var(--note-peach-fill)",
    border: "var(--note-peach-border)",
    foreground: "var(--note-peach-foreground)",
  },
  {
    value: "sky",
    label: "Sky",
    fill: "var(--note-sky-fill)",
    border: "var(--note-sky-border)",
    foreground: "var(--note-sky-foreground)",
  },
  {
    value: "lilac",
    label: "Lilac",
    fill: "var(--note-lilac-fill)",
    border: "var(--note-lilac-border)",
    foreground: "var(--note-lilac-foreground)",
  },
];

export function getNoteColorConfig(color?: NoteColor): NoteColorConfig {
  return NOTE_COLOR_OPTIONS.find((option) => option.value === color) ?? NOTE_COLOR_OPTIONS[0];
}

export const nodeConfig: Record<NodeCategory, CategoryConfig> = {
  client: {
    displayName: "Client",
    color: "var(--color-client)",
    fill: "var(--color-client-fill)",
    foreground: "var(--color-client-foreground)",
    icon: "Monitor",
    subtypes: {
      "web-app": { displayName: "Web App", icon: "Globe" },
      "mobile-app": { displayName: "Mobile App", icon: "Smartphone" },
      "desktop-app": { displayName: "Desktop App", icon: "Monitor" },
      cli: { displayName: "CLI", icon: "Terminal" },
    },
  },
  api: {
    displayName: "API Layer",
    color: "var(--color-api)",
    fill: "var(--color-api-fill)",
    foreground: "var(--color-api-foreground)",
    icon: "Server",
    subtypes: {
      "rest-api": { displayName: "REST API", icon: "ArrowRightLeft" },
      graphql: { displayName: "GraphQL", icon: "GitBranch" },
      grpc: { displayName: "gRPC", icon: "Zap" },
      "websocket-server": {
        displayName: "WebSocket Server",
        icon: "Radio",
      },
    },
  },
  services: {
    displayName: "Services",
    color: "var(--color-services)",
    fill: "var(--color-services-fill)",
    foreground: "var(--color-services-foreground)",
    icon: "Boxes",
    subtypes: {
      auth: { displayName: "Authentication", icon: "Shield" },
      payments: { displayName: "Payments", icon: "CreditCard" },
      notifications: { displayName: "Notifications", icon: "Bell" },
      search: { displayName: "Search", icon: "Search" },
      "file-processing": { displayName: "File Processing", icon: "FileText" },
      custom: { displayName: "Custom Service", icon: "Puzzle" },
    },
  },
  data: {
    displayName: "Data",
    color: "var(--color-data)",
    fill: "var(--color-data-fill)",
    foreground: "var(--color-data-foreground)",
    icon: "Database",
    subtypes: {
      "sql-db": { displayName: "SQL Database", icon: "Database" },
      "nosql-db": { displayName: "NoSQL Database", icon: "Layers" },
      cache: { displayName: "Cache", icon: "Cpu" },
      "message-queue": { displayName: "Message Queue", icon: "ListOrdered" },
      "object-storage": { displayName: "Object Storage", icon: "HardDrive" },
    },
  },
  infrastructure: {
    displayName: "Infrastructure",
    color: "var(--color-infrastructure)",
    fill: "var(--color-infrastructure-fill)",
    foreground: "var(--color-infrastructure-foreground)",
    icon: "Cloud",
    subtypes: {
      cdn: { displayName: "CDN", icon: "Globe" },
      "load-balancer": { displayName: "Load Balancer", icon: "Scale" },
      "api-gateway": { displayName: "API Gateway", icon: "DoorOpen" },
      dns: { displayName: "DNS", icon: "AtSign" },
      "reverse-proxy": { displayName: "Reverse Proxy", icon: "ArrowLeftRight" },
    },
  },
  external: {
    displayName: "External",
    color: "var(--color-external)",
    fill: "var(--color-external-fill)",
    foreground: "var(--color-external-foreground)",
    icon: "ExternalLink",
    subtypes: {
      "third-party-api": { displayName: "Third-Party API", icon: "Plug" },
      "oauth-provider": { displayName: "OAuth Provider", icon: "Key" },
      "email-sms-service": {
        displayName: "Email/SMS Service",
        icon: "Mail",
      },
    },
  },
  note: {
    displayName: "Note",
    color: "var(--color-note)",
    fill: "var(--color-note-fill)",
    foreground: "var(--color-note-foreground)",
    icon: "StickyNote",
    subtypes: {
      note: { displayName: "Note", icon: "StickyNote" },
    },
  },
};

export function getCategoryConfig(category: NodeCategory): CategoryConfig {
  return nodeConfig[category];
}

export function getSubtypeConfig(
  category: NodeCategory,
  subtype: NodeSubtype,
  custom?: CustomSubtypesMap
): SubtypeConfig | undefined {
  const builtIn = nodeConfig[category]?.subtypes[subtype];
  if (builtIn) return builtIn;
  const entry = custom?.[category]?.find((e) => e.slug === subtype);
  if (entry) return { displayName: entry.displayName, icon: entry.icon };
  return undefined;
}

export function resolveSubtypeConfig(
  category: NodeCategory,
  subtype: NodeSubtype,
  custom?: CustomSubtypesMap
): ResolvedSubtypeConfig {
  const configured = getSubtypeConfig(category, subtype, custom);
  if (configured) return { ...configured, deprecated: false };

  const categoryConfig = getCategoryConfig(category);
  return {
    displayName: subtype,
    icon: categoryConfig.icon,
    deprecated: true,
  };
}

export function getSubtypesForCategory(
  category: NodeCategory,
  custom?: CustomSubtypesMap
): Record<string, SubtypeConfig> {
  const builtIn = { ...(nodeConfig[category]?.subtypes ?? {}) };
  const entries = custom?.[category];
  if (!entries) return builtIn;
  for (const entry of entries) {
    if (!builtIn[entry.slug]) {
      builtIn[entry.slug] = { displayName: entry.displayName, icon: entry.icon };
    }
  }
  return builtIn;
}

/** All categories in display order */
export const categoryOrder: NodeCategory[] = [
  "client",
  "api",
  "services",
  "data",
  "infrastructure",
  "external",
  "note",
];
