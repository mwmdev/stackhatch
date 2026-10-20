import type { ChatMessage } from "@/types/chat";
import type { StackArchitecture, StackEdge, StackNode } from "@/types/stack";

export type ProviderMessage = Pick<ChatMessage, "role" | "content">;

export function stripStackTags(text: string): string {
  return text
    .replace(/<stack>\s*[\s\S]*?\s*<\/stack>/g, "")
    .replace(/<stack>[\s\S]*$/g, "")
    .trim();
}

function compactNode(node: StackNode): Partial<StackNode> {
  return {
    id: node.id,
    category: node.category,
    subtype: node.subtype,
    name: node.name,
    ...(node.technology ? { technology: node.technology } : {}),
    ...(node.description ? { description: node.description } : {}),
    ...(node.reasoning ? { reasoning: node.reasoning } : {}),
    locked: node.locked,
    ...(node.noteColor ? { noteColor: node.noteColor } : {}),
  };
}

function compactEdge(edge: StackEdge): Partial<StackEdge> {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    connectionType: edge.connectionType,
    ...(edge.label ? { label: edge.label } : {}),
  };
}

export function buildCompactArchitectureJson(architecture: StackArchitecture): string {
  return JSON.stringify({
    nodes: architecture.nodes.map(compactNode),
    edges: architecture.edges.map(compactEdge),
  });
}

/**
 * Builds a context block describing the current canvas state for the AI.
 * Includes locked status so the AI knows what to preserve.
 */
export function buildCanvasContext(
  architecture: StackArchitecture,
  options: { nodeLockingEnabled?: boolean } = {}
): string {
  const nodeLockingEnabled = options.nodeLockingEnabled ?? true;
  const lockInstruction = nodeLockingEnabled
    ? "LOCKED nodes must be preserved exactly unless the user explicitly asks to unlock or replace them."
    : "Node locking is disabled; treat stored locked flags as informational.";

  return [
    "[SYSTEM CONTEXT - Latest Canvas]",
    "This compact JSON is the current in-browser canvas state and overrides older architecture in chat history.",
    lockInstruction,
    buildCompactArchitectureJson(architecture),
  ].join("\n");
}

/**
 * Builds the Anthropic API message array from chat history and optional canvas state.
 * Injects canvas context as a system-level user message so the AI knows the current architecture.
 */
export function buildMessages(
  chatHistory: ChatMessage[],
  currentArchitecture: StackArchitecture | null,
  options: { nodeLockingEnabled?: boolean } = {}
): ProviderMessage[] {
  const msgs: ProviderMessage[] = [];
  const sanitizedHistory: ProviderMessage[] = chatHistory
    .map((msg) => ({
      role: msg.role,
      content: msg.role === "assistant" ? stripStackTags(msg.content) : msg.content,
    }))
    .filter((msg) => msg.content.trim().length > 0);

  const lastMessage = sanitizedHistory[sanitizedHistory.length - 1];
  const priorHistory =
    lastMessage?.role === "user" ? sanitizedHistory.slice(0, -1) : sanitizedHistory;

  msgs.push(...priorHistory);

  // If there's an existing architecture, inject compact latest context near the current request.
  if (currentArchitecture && currentArchitecture.nodes.length > 0) {
    const nodeLockingEnabled = options.nodeLockingEnabled ?? true;
    const canvasContext = buildCanvasContext(currentArchitecture, { nodeLockingEnabled });

    msgs.push({
      role: "user",
      content: canvasContext,
    });
    msgs.push({
      role: "assistant",
      content: nodeLockingEnabled
        ? "Understood. I can see the current architecture and will preserve all locked nodes."
        : "Understood. I can see the current architecture and will treat every node as editable.",
    });
  }

  if (lastMessage?.role === "user") {
    msgs.push(lastMessage);
  }

  return msgs;
}
