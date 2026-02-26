// Node categories and their subtypes
export type NodeCategory =
  | "client"
  | "api"
  | "services"
  | "data"
  | "infrastructure"
  | "external";

export type ClientSubtype = "web-app" | "mobile-app" | "desktop-app" | "cli";
export type ApiSubtype =
  | "rest-api"
  | "graphql"
  | "grpc"
  | "websocket-server";
export type ServicesSubtype =
  | "auth"
  | "payments"
  | "notifications"
  | "search"
  | "file-processing"
  | "custom";
export type DataSubtype =
  | "sql-db"
  | "nosql-db"
  | "cache"
  | "message-queue"
  | "object-storage";
export type InfraSubtype =
  | "cdn"
  | "load-balancer"
  | "api-gateway"
  | "dns"
  | "reverse-proxy";
export type ExternalSubtype =
  | "third-party-api"
  | "oauth-provider"
  | "email-sms-service";

export type BuiltInNodeSubtype =
  | ClientSubtype
  | ApiSubtype
  | ServicesSubtype
  | DataSubtype
  | InfraSubtype
  | ExternalSubtype;

export type NodeSubtype = BuiltInNodeSubtype | (string & {});

// Connection types between nodes
export type ConnectionType =
  | "http"
  | "websocket"
  | "grpc"
  | "tcp"
  | "pub-sub"
  | "file-io";

// A stack node as the AI generates it (before React Flow positioning)
export interface StackNode {
  id: string;
  category: NodeCategory;
  subtype: NodeSubtype;
  name: string;
  technology: string;
  description: string;
  reasoning: string;
  locked: boolean;
}

// A connection between two nodes
export interface StackEdge {
  id: string;
  source: string;
  target: string;
  connectionType: ConnectionType;
  label: string;
}

// An alternative technology suggestion for a canvas slot
export interface AlternativeNode {
  name: string;
  technology: string;
  description: string;
  reasoning: string;
  category: NodeCategory;
  subtype: NodeSubtype;
}

// The complete architecture state
export interface StackArchitecture {
  nodes: StackNode[];
  edges: StackEdge[];
}
