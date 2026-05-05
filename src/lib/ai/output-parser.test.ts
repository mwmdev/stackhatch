import { describe, it, expect } from "vitest";
import { parseAIResponse } from "./output-parser";

const validArchitecture = {
  nodes: [
    {
      id: "node-1",
      category: "client",
      subtype: "web-app",
      name: "React Frontend",
      technology: "Next.js 15",
      description: "Server-rendered React application",
      reasoning: "SSR for SEO, great DX",
      locked: false,
    },
    {
      id: "node-2",
      category: "data",
      subtype: "sql-db",
      name: "PostgreSQL Database",
      technology: "PostgreSQL 16",
      description: "Primary relational database",
      reasoning: "Mature, reliable, great JSON support",
      locked: true,
    },
  ],
  edges: [
    {
      id: "edge-1",
      source: "node-1",
      target: "node-2",
      connectionType: "http",
      label: "REST API calls",
    },
  ],
};

describe("parseAIResponse", () => {
  it("extracts valid architecture from <stack> block", () => {
    const text = `Here's the architecture I recommend.

<stack>
${JSON.stringify(validArchitecture, null, 2)}
</stack>

Let me know if you'd like changes.`;

    const result = parseAIResponse(text);

    expect(result.architecture).not.toBeNull();
    expect(result.architecture!.nodes).toHaveLength(2);
    expect(result.architecture!.edges).toHaveLength(1);
    expect(result.architecture!.nodes[0].name).toBe("React Frontend");
    expect(result.architecture!.nodes[1].locked).toBe(true);
    expect(result.architecture!.edges[0].connectionType).toBe("http");
  });

  it("removes <stack> block from message text", () => {
    const text = `Here's the architecture.

<stack>
${JSON.stringify(validArchitecture)}
</stack>

What do you think?`;

    const result = parseAIResponse(text);

    expect(result.message).not.toContain("<stack>");
    expect(result.message).not.toContain("</stack>");
    expect(result.message).toContain("Here's the architecture.");
    expect(result.message).toContain("What do you think?");
  });

  it("returns null architecture for pure chat messages", () => {
    const text = "What kind of application are you building?";

    const result = parseAIResponse(text);

    expect(result.architecture).toBeNull();
    expect(result.message).toBe(text);
  });

  it("returns null architecture for malformed JSON in <stack>", () => {
    const text = `Here's the architecture.

<stack>
{ this is not valid json }
</stack>

Thoughts?`;

    const result = parseAIResponse(text);

    expect(result.architecture).toBeNull();
    expect(result.message).toContain("Here's the architecture.");
  });

  it("returns null architecture when JSON doesn't match schema", () => {
    const invalidJson = {
      nodes: [
        {
          id: "node-1",
          category: "invalid-category",
          subtype: "web-app",
          name: "Test",
          technology: "Test",
          description: "Test",
          reasoning: "Test",
          locked: false,
        },
      ],
      edges: [],
    };

    const text = `Architecture:

<stack>
${JSON.stringify(invalidJson)}
</stack>`;

    const result = parseAIResponse(text);

    expect(result.architecture).toBeNull();
  });

  it("returns null architecture when nodes have missing required fields", () => {
    const missingFields = {
      nodes: [{ id: "node-1", category: "client" }],
      edges: [],
    };

    const text = `<stack>${JSON.stringify(missingFields)}</stack>`;

    const result = parseAIResponse(text);

    expect(result.architecture).toBeNull();
  });

  it("validates all connection types", () => {
    const connectionTypes = ["http", "websocket", "grpc", "tcp", "pub-sub", "file-io"];

    for (const connType of connectionTypes) {
      const arch = {
        nodes: [
          {
            id: "a",
            category: "client",
            subtype: "web-app",
            name: "A",
            technology: "",
            description: "",
            reasoning: "",
            locked: false,
          },
          {
            id: "b",
            category: "api",
            subtype: "rest-api",
            name: "B",
            technology: "",
            description: "",
            reasoning: "",
            locked: false,
          },
        ],
        edges: [
          {
            id: "e1",
            source: "a",
            target: "b",
            connectionType: connType,
            label: "test",
          },
        ],
      };

      const text = `<stack>${JSON.stringify(arch)}</stack>`;
      const result = parseAIResponse(text);

      expect(result.architecture).not.toBeNull();
      expect(result.architecture!.edges[0].connectionType).toBe(connType);
    }
  });

  it("validates all node categories and subtypes", () => {
    const categorySubtypes: Record<string, string[]> = {
      client: ["web-app", "mobile-app", "desktop-app", "cli"],
      api: ["rest-api", "graphql", "grpc", "websocket-server"],
      services: ["auth", "payments", "notifications", "search", "file-processing", "custom"],
      data: ["sql-db", "nosql-db", "cache", "message-queue", "object-storage"],
      infrastructure: ["cdn", "load-balancer", "api-gateway", "dns", "reverse-proxy"],
      external: ["third-party-api", "oauth-provider", "email-sms-service"],
      note: ["note"],
    };

    for (const [category, subtypes] of Object.entries(categorySubtypes)) {
      for (const subtype of subtypes) {
        const arch = {
          nodes: [
            {
              id: `${category}-${subtype}`,
              category,
              subtype,
              name: "Test",
              technology: "",
              description: "",
              reasoning: "",
              locked: false,
            },
          ],
          edges: [],
        };

        const text = `<stack>${JSON.stringify(arch)}</stack>`;
        const result = parseAIResponse(text);

        expect(result.architecture, `${category}/${subtype} should be valid`).not.toBeNull();
      }
    }
  });

  it("rejects note nodes when the feature is disabled", () => {
    const arch = {
      nodes: [
        {
          id: "note-1",
          category: "note",
          subtype: "note",
          name: "Decision note",
          technology: "",
          description: "Keep the first release simple.",
          reasoning: "",
          locked: false,
        },
      ],
      edges: [],
    };

    const text = `<stack>${JSON.stringify(arch)}</stack>`;
    const result = parseAIResponse(text, { allowNoteNodes: false });

    expect(result.architecture).toBeNull();
  });

  it("preserves valid note colors", () => {
    const arch = {
      nodes: [
        {
          id: "note-1",
          category: "note",
          subtype: "note",
          name: "Decision note",
          technology: "",
          description: "Keep the first release simple.",
          reasoning: "",
          locked: false,
          noteColor: "peach",
        },
      ],
      edges: [],
    };

    const text = `<stack>${JSON.stringify(arch)}</stack>`;
    const result = parseAIResponse(text);

    expect(result.architecture?.nodes[0].noteColor).toBe("peach");
  });

  it("rejects invalid note colors", () => {
    const arch = {
      nodes: [
        {
          id: "note-1",
          category: "note",
          subtype: "note",
          name: "Decision note",
          technology: "",
          description: "Keep the first release simple.",
          reasoning: "",
          locked: false,
          noteColor: "neon",
        },
      ],
      edges: [],
    };

    const text = `<stack>${JSON.stringify(arch)}</stack>`;
    const result = parseAIResponse(text);

    expect(result.architecture).toBeNull();
  });

  it("rejects invalid connection type", () => {
    const arch = {
      nodes: [
        {
          id: "a",
          category: "client",
          subtype: "web-app",
          name: "A",
          technology: "",
          description: "",
          reasoning: "",
          locked: false,
        },
      ],
      edges: [
        {
          id: "e1",
          source: "a",
          target: "a",
          connectionType: "invalid-type",
          label: "test",
        },
      ],
    };

    const text = `<stack>${JSON.stringify(arch)}</stack>`;
    const result = parseAIResponse(text);

    expect(result.architecture).toBeNull();
  });

  it("rejects edges that reference missing node ids", () => {
    const arch = {
      nodes: [
        {
          id: "web-client",
          category: "client",
          subtype: "web-app",
          name: "Web Client",
          technology: "Next.js 16",
          description: "Browser UI",
          reasoning: "Strong React framework",
          locked: false,
        },
      ],
      edges: [
        {
          id: "edge-1",
          source: "Web Client",
          target: "api-server",
          connectionType: "http",
          label: "Calls API",
        },
      ],
    };

    const text = `<stack>${JSON.stringify(arch)}</stack>`;
    const result = parseAIResponse(text);

    expect(result.architecture).toBeNull();
  });

  it("rejects duplicate node and edge ids", () => {
    const arch = {
      nodes: [
        {
          id: "api-server",
          category: "api",
          subtype: "rest-api",
          name: "API Server",
          technology: "Fastify",
          description: "Backend API",
          reasoning: "Fast TypeScript server",
          locked: false,
        },
        {
          id: "api-server",
          category: "data",
          subtype: "sql-db",
          name: "Database",
          technology: "PostgreSQL 16",
          description: "Primary data store",
          reasoning: "Reliable relational storage",
          locked: false,
        },
      ],
      edges: [
        {
          id: "edge-1",
          source: "api-server",
          target: "api-server",
          connectionType: "tcp",
          label: "SQL",
        },
      ],
    };

    const text = `<stack>${JSON.stringify(arch)}</stack>`;
    const result = parseAIResponse(text);

    expect(result.architecture).toBeNull();
  });

  it("handles empty architecture (no nodes, no edges)", () => {
    const arch = { nodes: [], edges: [] };
    const text = `<stack>${JSON.stringify(arch)}</stack>`;
    const result = parseAIResponse(text);

    expect(result.architecture).not.toBeNull();
    expect(result.architecture!.nodes).toHaveLength(0);
    expect(result.architecture!.edges).toHaveLength(0);
  });

  it("handles whitespace around JSON in <stack> block", () => {
    const text = `Text before.

<stack>

  ${JSON.stringify(validArchitecture, null, 2)}

</stack>

Text after.`;

    const result = parseAIResponse(text);

    expect(result.architecture).not.toBeNull();
    expect(result.architecture!.nodes).toHaveLength(2);
  });
});
