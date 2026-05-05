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
      category: "note",
      subtype: "note",
      name: "Launch note",
      technology: "",
      description: "Keep v1 focused",
      reasoning: "",
      locked: false,
      noteColor: "mint",
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

    // 3 history messages + 2 context messages, with context before the latest user request
    expect(msgs).toHaveLength(5);
    expect(msgs[0]).toEqual({ role: "user", content: "I want to build a chat app" });
    expect(msgs[1]).toEqual({ role: "assistant", content: "What language do you prefer?" });
    expect(msgs[2].role).toBe("user");
    expect(msgs[2].content).toContain("[SYSTEM CONTEXT - Latest Canvas]");
    expect(msgs[4]).toEqual({ role: "user", content: "TypeScript" });
  });

  it("context message includes locked nodes clearly", () => {
    const msgs = buildMessages([], sampleArchitecture);
    const contextMsg = msgs[0].content as string;

    expect(contextMsg).toContain("LOCKED");
    expect(contextMsg).toContain("React Frontend");
    expect(contextMsg).toContain('"locked":true');
  });

  it("context message includes note colors", () => {
    const msgs = buildMessages([], sampleArchitecture);
    const contextMsg = msgs[0].content as string;

    expect(contextMsg).toContain("Launch note");
    expect(contextMsg).toContain('"noteColor":"mint"');
  });

  it("context message includes edges with readable names", () => {
    const msgs = buildMessages([], sampleArchitecture);
    const contextMsg = msgs[0].content as string;

    expect(contextMsg).toContain("React Frontend");
    expect(contextMsg).toContain("API Server");
    expect(contextMsg).toContain("REST API calls");
    expect(contextMsg).toContain("http");
  });

  it("context message includes compact JSON without pretty raw JSON duplication", () => {
    const msgs = buildMessages([], sampleArchitecture);
    const contextMsg = msgs[0].content as string;

    expect(contextMsg).toContain('"node-1"');
    expect(contextMsg).toContain('"locked":true');
    expect(contextMsg).not.toContain("Raw architecture JSON");
    expect(contextMsg).not.toContain("```json");
    expect(contextMsg).not.toContain('"technology":""');
    expect(contextMsg).not.toContain('"reasoning":""');
  });

  it("strips stale stack JSON from assistant history", () => {
    const history: ChatMessage[] = [
      {
        id: "m1",
        projectId: "p1",
        role: "assistant",
        content: `Here is the update.\n<stack>${JSON.stringify(sampleArchitecture)}</stack>`,
        createdAt: 1000,
      },
      {
        id: "m2",
        projectId: "p1",
        role: "user",
        content: "What changed?",
        createdAt: 2000,
      },
    ];
    const msgs = buildMessages(history, sampleArchitecture);
    const allContent = msgs.map((msg) => msg.content).join("\n");

    expect(allContent).toContain("Here is the update.");
    expect(allContent).not.toContain("<stack>");
    expect(allContent).not.toContain("</stack>");
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

    expect(contextMsg).toContain('"locked":true');
    expect(contextMsg).toContain("LOCKED nodes must be preserved");
  });

  it("documents when node locking is disabled", () => {
    const allUnlocked: StackArchitecture = {
      nodes: sampleArchitecture.nodes.map((n) => ({ ...n, locked: false })),
      edges: sampleArchitecture.edges,
    };

    const msgs = buildMessages([], allUnlocked, { nodeLockingEnabled: false });
    const contextMsg = msgs[0].content as string;

    expect(contextMsg).toContain("Node locking is disabled");
    expect(contextMsg).toContain('"locked":false');
  });

  it("assistant context acknowledgement message is present", () => {
    const msgs = buildMessages([], sampleArchitecture);

    expect(msgs[1].role).toBe("assistant");
    expect((msgs[1].content as string).toLowerCase()).toContain("locked");
  });
});
