import type { StackArchitecture } from "@/types/stack";

export interface CuratedStarterTemplate {
  id: `curated-${string}`;
  name: string;
  description: string;
  canvasState: string;
  createdAt: 0;
  source: "curated";
}

function canvasState(
  architecture: StackArchitecture,
  positions: Record<string, { x: number; y: number }>
) {
  return JSON.stringify({ ...architecture, positions });
}

export const CURATED_STARTER_TEMPLATES = [
  {
    id: "curated-web-app",
    name: "Web app foundation",
    description: "A browser client, application API, and relational database.",
    canvasState: canvasState(
      {
        nodes: [
          {
            id: "web-client",
            category: "client",
            subtype: "web-app",
            name: "Web App",
            technology: "React",
            description: "Customer-facing browser application.",
            reasoning: "A clear client boundary makes delivery and API ownership visible.",
            locked: false,
          },
          {
            id: "app-api",
            category: "api",
            subtype: "rest-api",
            name: "Application API",
            technology: "Node.js",
            description: "Owns application workflows and HTTP endpoints.",
            reasoning: "A single API is a simple starting boundary for a new product.",
            locked: false,
          },
          {
            id: "primary-db",
            category: "data",
            subtype: "sql-db",
            name: "Primary Database",
            technology: "PostgreSQL",
            description: "Stores durable application data.",
            reasoning: "Relational storage is a flexible default for transactional data.",
            locked: false,
          },
        ],
        edges: [
          {
            id: "web-to-api",
            source: "web-client",
            target: "app-api",
            connectionType: "http",
            label: "HTTPS",
          },
          {
            id: "api-to-db",
            source: "app-api",
            target: "primary-db",
            connectionType: "tcp",
            label: "SQL",
          },
        ],
      },
      {
        "web-client": { x: 80, y: 140 },
        "app-api": { x: 400, y: 140 },
        "primary-db": { x: 720, y: 140 },
      }
    ),
    createdAt: 0,
    source: "curated",
  },
  {
    id: "curated-event-driven",
    name: "Event-driven service",
    description: "An API publishes work to a queue for an independent worker.",
    canvasState: canvasState(
      {
        nodes: [
          {
            id: "event-api",
            category: "api",
            subtype: "rest-api",
            name: "Command API",
            technology: "Fastify",
            description: "Accepts requests and publishes asynchronous work.",
            reasoning: "The API stays responsive by handing slow work to a queue.",
            locked: false,
          },
          {
            id: "event-queue",
            category: "data",
            subtype: "message-queue",
            name: "Work Queue",
            technology: "RabbitMQ",
            description: "Buffers commands between the API and workers.",
            reasoning: "A durable queue isolates request traffic from processing capacity.",
            locked: false,
          },
          {
            id: "event-worker",
            category: "services",
            subtype: "custom",
            name: "Background Worker",
            technology: "Node.js",
            description: "Processes queued work independently.",
            reasoning: "Independent workers can scale and retry without blocking the API.",
            locked: false,
          },
          {
            id: "event-store",
            category: "data",
            subtype: "sql-db",
            name: "Service Database",
            technology: "PostgreSQL",
            description: "Stores processing state and results.",
            reasoning: "Durable state supports retries and operational visibility.",
            locked: false,
          },
        ],
        edges: [
          {
            id: "api-to-queue",
            source: "event-api",
            target: "event-queue",
            connectionType: "pub-sub",
            label: "Publish command",
          },
          {
            id: "queue-to-worker",
            source: "event-queue",
            target: "event-worker",
            connectionType: "pub-sub",
            label: "Consume work",
          },
          {
            id: "worker-to-store",
            source: "event-worker",
            target: "event-store",
            connectionType: "tcp",
            label: "SQL",
          },
        ],
      },
      {
        "event-api": { x: 60, y: 140 },
        "event-queue": { x: 350, y: 140 },
        "event-worker": { x: 640, y: 140 },
        "event-store": { x: 930, y: 140 },
      }
    ),
    createdAt: 0,
    source: "curated",
  },
  {
    id: "curated-saas-platform",
    name: "SaaS platform",
    description: "A web product with identity, an application service, and durable storage.",
    canvasState: canvasState(
      {
        nodes: [
          {
            id: "saas-client",
            category: "client",
            subtype: "web-app",
            name: "Customer Portal",
            technology: "Next.js",
            description: "The signed-in customer experience.",
            reasoning: "The portal owns presentation while services own business rules.",
            locked: false,
          },
          {
            id: "saas-api",
            category: "api",
            subtype: "rest-api",
            name: "Product API",
            technology: "TypeScript",
            description: "Exposes product workflows to the customer portal.",
            reasoning: "A stable API boundary keeps product logic out of the client.",
            locked: false,
          },
          {
            id: "saas-auth",
            category: "external",
            subtype: "oauth-provider",
            name: "Identity Provider",
            technology: "OIDC",
            description: "Authenticates users and issues identity tokens.",
            reasoning: "Managed identity reduces security-sensitive custom infrastructure.",
            locked: false,
          },
          {
            id: "saas-db",
            category: "data",
            subtype: "sql-db",
            name: "Tenant Database",
            technology: "PostgreSQL",
            description: "Stores tenant-scoped product records.",
            reasoning: "A relational model supports tenant ownership and transactions.",
            locked: false,
          },
        ],
        edges: [
          {
            id: "portal-to-api",
            source: "saas-client",
            target: "saas-api",
            connectionType: "http",
            label: "HTTPS",
          },
          {
            id: "portal-to-auth",
            source: "saas-client",
            target: "saas-auth",
            connectionType: "http",
            label: "OIDC",
          },
          {
            id: "api-to-db",
            source: "saas-api",
            target: "saas-db",
            connectionType: "tcp",
            label: "SQL",
          },
        ],
      },
      {
        "saas-client": { x: 80, y: 80 },
        "saas-api": { x: 400, y: 80 },
        "saas-auth": { x: 400, y: 340 },
        "saas-db": { x: 720, y: 80 },
      }
    ),
    createdAt: 0,
    source: "curated",
  },
] as const satisfies readonly CuratedStarterTemplate[];
