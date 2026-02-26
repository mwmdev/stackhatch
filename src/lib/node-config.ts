import type {
  NodeCategory,
  NodeSubtype,
} from "@/types/stack";

export interface SubtypeConfig {
  displayName: string;
  icon: string; // lucide-react icon name
}

export interface CategoryConfig {
  displayName: string;
  color: string; // CSS variable name
  icon: string;
  subtypes: Record<string, SubtypeConfig>;
}

export const nodeConfig: Record<NodeCategory, CategoryConfig> = {
  client: {
    displayName: "Client",
    color: "var(--color-client)",
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
};

export function getCategoryConfig(category: NodeCategory): CategoryConfig {
  return nodeConfig[category];
}

export function getSubtypeConfig(
  category: NodeCategory,
  subtype: NodeSubtype,
): SubtypeConfig | undefined {
  return nodeConfig[category]?.subtypes[subtype];
}

export function getSubtypesForCategory(
  category: NodeCategory,
): Record<string, SubtypeConfig> {
  return nodeConfig[category]?.subtypes ?? {};
}

/** All categories in display order */
export const categoryOrder: NodeCategory[] = [
  "client",
  "api",
  "services",
  "data",
  "infrastructure",
  "external",
];
