import type { ConnectionType, NodeCategory, NodeSubtype } from "@/types/stack";

export interface DemoNode {
  id: string;
  name: string;
  technology: string;
  category: NodeCategory;
  subtype: NodeSubtype;
  description: string;
  reasoning: string;
  position: { x: number; y: number };
}

export interface DemoEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  connectionType: ConnectionType;
}

export interface DemoQuestion {
  id: string;
  label: string;
  answer: string;
  nodeIds: string[];
  edgeIds: string[];
}

export interface DemoAlternative {
  name: string;
  technology: string;
  tradeoff: string;
  whenToUse: string;
}

export const STACKHATCH_DEMO = {
  repository: "mwmdev/stackhatch",
  sourceUrl: "https://github.com/mwmdev/stackhatch",
  sourceCommit: "5d05e8a",
  mappedAt: "2026-07-14",
  nodes: [
    {
      id: "next-ui",
      name: "Next.js interface",
      technology: "Next.js 16 · React 19",
      category: "client",
      subtype: "web-app",
      description:
        "The public site, authenticated dashboard, settings, and project workspace share one App Router application.",
      reasoning:
        "A single Next.js application keeps navigation and server-rendered product surfaces in one deployable unit.",
      position: { x: 260, y: 0 },
    },
    {
      id: "react-flow",
      name: "Map workspace",
      technology: "React Flow",
      category: "client",
      subtype: "web-app",
      description:
        "The interactive canvas renders architecture nodes, connections, details, comments, and export controls.",
      reasoning:
        "React Flow provides the spatial interaction model while StackHatch owns the architecture vocabulary.",
      position: { x: 520, y: 0 },
    },
    {
      id: "route-handlers",
      name: "Route handlers",
      technology: "Next.js server routes",
      category: "api",
      subtype: "rest-api",
      description:
        "Authenticated endpoints manage projects, settings, teams, repository scans, and streamed architecture chat.",
      reasoning:
        "Co-locating the API with the application keeps the current deployment and permission model compact.",
      position: { x: 390, y: 185 },
    },
    {
      id: "auth",
      name: "Authentication",
      technology: "Auth.js · GitHub OAuth",
      category: "services",
      subtype: "auth",
      description:
        "GitHub sign-in establishes the user session used to protect projects, teams, settings, and administration.",
      reasoning:
        "GitHub is a natural identity provider for a product centered on public repositories.",
      position: { x: 0, y: 370 },
    },
    {
      id: "repo-analyzer",
      name: "Repository analyzer",
      technology: "GitHub evidence pipeline",
      category: "services",
      subtype: "file-processing",
      description:
        "The analyzer gathers bounded repository metadata, language, tree, README, and configuration evidence.",
      reasoning:
        "Architecture generation starts from concrete repository evidence rather than only a project description.",
      position: { x: 260, y: 370 },
    },
    {
      id: "ai-orchestration",
      name: "AI orchestration",
      technology: "Anthropic SDK",
      category: "services",
      subtype: "custom",
      description:
        "Prompt and stream handlers turn repository evidence and architecture questions into structured map updates.",
      reasoning:
        "The orchestration layer isolates model-specific streaming and structured-output handling from the interface.",
      position: { x: 520, y: 370 },
    },
    {
      id: "sqlite",
      name: "Application data",
      technology: "SQLite · Drizzle",
      category: "data",
      subtype: "sql-db",
      description:
        "Projects, map state, chat history, encrypted provider settings, users, and teams live in a relational store.",
      reasoning:
        "SQLite keeps the self-hosted single-instance deployment simple while Drizzle supplies typed queries and migrations.",
      position: { x: 780, y: 185 },
    },
    {
      id: "github",
      name: "GitHub API",
      technology: "Public repository API",
      category: "external",
      subtype: "third-party-api",
      description:
        "StackHatch reads public repository metadata and selected source evidence. Sign-in does not grant private-repository access.",
      reasoning:
        "The public API provides the source context needed to map a repository without cloning it on the application server.",
      position: { x: 0, y: 555 },
    },
    {
      id: "anthropic",
      name: "Anthropic API",
      technology: "User-provided API key",
      category: "external",
      subtype: "third-party-api",
      description:
        "Repository analysis, architecture questions, and alternatives use the model selected with the user's own API key.",
      reasoning:
        "BYOK keeps StackHatch free of plans and quotas while model usage is billed directly by Anthropic.",
      position: { x: 520, y: 555 },
    },
    {
      id: "docker",
      name: "Docker runtime",
      technology: "Docker · Node.js",
      category: "infrastructure",
      subtype: "reverse-proxy",
      description:
        "A standalone Next.js build and persistent SQLite volume form the current self-hosted runtime.",
      reasoning:
        "The container boundary makes a small installation reproducible without introducing a larger platform.",
      position: { x: 780, y: 555 },
    },
  ] satisfies DemoNode[],
  edges: [
    {
      id: "ui-routes",
      source: "next-ui",
      target: "route-handlers",
      label: "requests and streams",
      connectionType: "http",
    },
    {
      id: "routes-canvas",
      source: "route-handlers",
      target: "react-flow",
      label: "architecture state",
      connectionType: "http",
    },
    {
      id: "routes-auth",
      source: "route-handlers",
      target: "auth",
      label: "session checks",
      connectionType: "http",
    },
    {
      id: "routes-analyzer",
      source: "route-handlers",
      target: "repo-analyzer",
      label: "scan request",
      connectionType: "http",
    },
    {
      id: "analyzer-github",
      source: "repo-analyzer",
      target: "github",
      label: "repository evidence",
      connectionType: "http",
    },
    {
      id: "analyzer-ai",
      source: "repo-analyzer",
      target: "ai-orchestration",
      label: "bounded context",
      connectionType: "file-io",
    },
    {
      id: "ai-anthropic",
      source: "ai-orchestration",
      target: "anthropic",
      label: "model stream",
      connectionType: "http",
    },
    {
      id: "routes-db",
      source: "route-handlers",
      target: "sqlite",
      label: "projects and settings",
      connectionType: "file-io",
    },
    {
      id: "ai-db",
      source: "ai-orchestration",
      target: "sqlite",
      label: "map and chat state",
      connectionType: "file-io",
    },
    {
      id: "docker-routes",
      source: "docker",
      target: "route-handlers",
      label: "hosts",
      connectionType: "tcp",
    },
    {
      id: "docker-db",
      source: "docker",
      target: "sqlite",
      label: "persistent volume",
      connectionType: "file-io",
    },
  ] satisfies DemoEdge[],
  questions: [
    {
      id: "repo-to-map",
      label: "How does a repository become a map?",
      answer:
        "A route handler passes the public repository to the analyzer. Its bounded evidence becomes context for AI orchestration, which streams structured architecture back into the React Flow workspace.",
      nodeIds: [
        "route-handlers",
        "repo-analyzer",
        "github",
        "ai-orchestration",
        "anthropic",
        "react-flow",
      ],
      edgeIds: [
        "routes-analyzer",
        "analyzer-github",
        "analyzer-ai",
        "ai-anthropic",
        "routes-canvas",
      ],
    },
    {
      id: "data-storage",
      label: "Where is project data stored?",
      answer:
        "Route handlers persist projects, map state, chat history, users, teams, and encrypted provider settings through Drizzle into SQLite. The database stays on a persistent Docker volume.",
      nodeIds: ["route-handlers", "sqlite", "docker"],
      edgeIds: ["routes-db", "docker-db"],
    },
    {
      id: "rescan",
      label: "What happens when a repository is re-scanned?",
      answer:
        "The analyzer reads a fresh bounded snapshot from GitHub and the AI layer generates a new architecture overview. The current generated map and architecture chat are replaced after confirmation.",
      nodeIds: ["github", "repo-analyzer", "ai-orchestration", "anthropic", "sqlite"],
      edgeIds: ["analyzer-github", "analyzer-ai", "ai-anthropic", "ai-db"],
    },
  ] satisfies DemoQuestion[],
  alternatives: {
    sqlite: [
      {
        name: "PostgreSQL",
        technology: "PostgreSQL · Drizzle",
        tradeoff: "Adds an operated database, connection management, backups, and network latency.",
        whenToUse:
          "Choose it when StackHatch needs multiple application instances or heavier concurrent writes.",
      },
      {
        name: "libSQL",
        technology: "Turso / self-hosted libSQL",
        tradeoff:
          "Keeps SQLite semantics but introduces replication and another operational dependency.",
        whenToUse:
          "Choose it when edge reads or replicated SQLite are more useful than a full PostgreSQL move.",
      },
    ],
    auth: [
      {
        name: "Multiple OAuth providers",
        technology: "Auth.js provider expansion",
        tradeoff: "Broadens access but makes account linking and identity support more complex.",
        whenToUse: "Choose it when non-GitHub developers become a meaningful part of the audience.",
      },
    ],
    docker: [
      {
        name: "Managed container platform",
        technology: "Managed Node.js runtime",
        tradeoff: "Reduces server maintenance but changes costs, storage, and deployment control.",
        whenToUse:
          "Choose it when operating the host costs more than the managed platform premium.",
      },
    ],
  } satisfies Record<string, DemoAlternative[]>,
} as const;

export type StackHatchDemo = typeof STACKHATCH_DEMO;
