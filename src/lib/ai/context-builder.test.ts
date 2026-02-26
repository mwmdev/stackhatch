import { describe, it, expect } from "vitest";
import { buildMessages } from "./context-builder";
import type { ChatMessage } from "@/types/chat";
import type { StackArchitecture } from "@/types/stack";

const sampleHistory: ChatMessage[] = [
  {
    id: "m1",
    projectId: "p1",
    role: "user",
    content: "I want to build a chat app",
    createdAt: 1000,
  },
  {
    id: "m2",
    projectId: "p1",
    role: "assistant",
    content: "What language do you prefer?",
    createdAt: 2000,
  },
  {
    id: "m3",
    projectId: "p1",
    role: "user",
    content: "TypeScript",
    createdAt: 3000,
  },
];

const sampleArchitecture: StackArchitecture = {
  nodes: [
    {
      id: "node-1",
      category: "client",
      subtype: "web-app",
      name: "React Frontend",
      technology: "Next.js 15",
      description: "Web client",
      reasoning: "SSR support",
      locked: true,
    },
    {
      id: "node-2",
      category: "api",
      subtype: "rest-api",
      name: "API Server",
      technology: "Express.js",
      description: "REST API backend",
      reasoning: "Simple and flexible",
      locked: false,
    },
    {
      id: "node-3",
      category: "data",
      subtype: "sql-db",
      name: "PostgreSQL",
      technology: "PostgreSQL 16",
      description: "Primary database",
      reasoning: "Reliable and mature",
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
    {
      id: "edge-2",
      source: "node-2",
      target: "node-3",
      connectionType: "tcp",
      label: "SQL queries",
    },
  ],
};

describe("buildMessages", () => {
  it("returns chat history as Anthropic messages when no architecture", () => {
    const msgs = buildMessages(sampleHistory, null);

    expect(msgs).toHaveLength(3);
    expect(msgs[0]).toEqual({ role: "user", content: "I want to build a chat app" });
    expect(msgs[1]).toEqual({ role: "assistant", content: "What language do you prefer?" });
    expect(msgs[2]).toEqual({ role: "user", content: "TypeScript" });
  });

  it("prepends canvas context when architecture exists", () => {
    const msgs = buildMessages(sampleHistory, sampleArchitecture);

    // 2 context messages + 3 history messages
    expect(msgs).toHaveLength(5);
    expect(msgs[0].role).toBe("user");
    expect(msgs[1].role).toBe("assistant");
    // History follows
    expect(msgs[2]).toEqual({ role: "user", content: "I want to build a chat app" });
  });

  it("context message includes locked nodes clearly", () => {
    const msgs = buildMessages([], sampleArchitecture);
    const contextMsg = msgs[0].content as string;

    expect(contextMsg).toContain("LOCKED");
    expect(contextMsg).toContain("React Frontend");
    expect(contextMsg).toContain("PostgreSQL");
  });

  it("context message includes unlocked nodes", () => {
    const msgs = buildMessages([], sampleArchitecture);
    const contextMsg = msgs[0].content as string;

    expect(contextMsg).toContain("Unlocked");
    expect(contextMsg).toContain("API Server");
  });

  it("context message includes edges with readable names", () => {
    const msgs = buildMessages([], sampleArchitecture);
    const contextMsg = msgs[0].content as string;

    expect(contextMsg).toContain("React Frontend");
    expect(contextMsg).toContain("API Server");
    expect(contextMsg).toContain("REST API calls");
    expect(contextMsg).toContain("http");
  });

  it("context message includes raw JSON", () => {
    const msgs = buildMessages([], sampleArchitecture);
    const contextMsg = msgs[0].content as string;

    expect(contextMsg).toContain('"node-1"');
    expect(contextMsg).toContain('"locked": true');
  });

  it("skips canvas context for empty architecture", () => {
    const emptyArch: StackArchitecture = { nodes: [], edges: [] };
    const msgs = buildMessages(sampleHistory, emptyArch);

    // No context messages — just history
    expect(msgs).toHaveLength(3);
    expect(msgs[0]).toEqual({ role: "user", content: "I want to build a chat app" });
  });

  it("skips canvas context when architecture is null", () => {
    const msgs = buildMessages(sampleHistory, null);

    expect(msgs).toHaveLength(3);
  });

  it("handles empty chat history with architecture", () => {
    const msgs = buildMessages([], sampleArchitecture);

    // Just the 2 context messages
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("user");
    expect(msgs[1].role).toBe("assistant");
  });

  it("handles all-locked nodes architecture", () => {
    const allLocked: StackArchitecture = {
      nodes: sampleArchitecture.nodes.map((n) => ({ ...n, locked: true })),
      edges: sampleArchitecture.edges,
    };

    const msgs = buildMessages([], allLocked);
    const contextMsg = msgs[0].content as string;

    expect(contextMsg).toContain("LOCKED");
    expect(contextMsg).not.toContain("Unlocked Nodes");
  });

  it("handles all-unlocked nodes architecture", () => {
    const allUnlocked: StackArchitecture = {
      nodes: sampleArchitecture.nodes.map((n) => ({ ...n, locked: false })),
      edges: sampleArchitecture.edges,
    };

    const msgs = buildMessages([], allUnlocked);
    const contextMsg = msgs[0].content as string;

    expect(contextMsg).toContain("Unlocked");
    expect(contextMsg).not.toContain("LOCKED Nodes");
  });

  it("assistant context acknowledgement message is present", () => {
    const msgs = buildMessages([], sampleArchitecture);

    expect(msgs[1].role).toBe("assistant");
    expect((msgs[1].content as string).toLowerCase()).toContain("locked");
  });
});
