import type Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage } from "@/types/chat";
import type { StackArchitecture } from "@/types/stack";
import { nodeConfig } from "@/lib/node-config";

/**
 * Builds a context block describing the current canvas state for the AI.
 * Includes locked status so the AI knows what to preserve.
 */
function buildCanvasContext(architecture: StackArchitecture): string {
  const lockedNodes = architecture.nodes.filter((n) => n.locked);
  const unlockedNodes = architecture.nodes.filter((n) => !n.locked);

  let context = "## Current Architecture State\n\n";

  if (lockedNodes.length > 0) {
    context +=
      "### LOCKED Nodes (must NOT be modified or removed):\n";
    for (const node of lockedNodes) {
      const catName = nodeConfig[node.category].displayName;
      context += `- **${node.name}** (${catName} / ${node.technology}) — ${node.description}\n`;
    }
    context += "\n";
  }

  if (unlockedNodes.length > 0) {
    context += "### Unlocked Nodes (may be modified or removed):\n";
    for (const node of unlockedNodes) {
      const catName = nodeConfig[node.category].displayName;
      context += `- **${node.name}** (${catName} / ${node.technology}) — ${node.description}\n`;
    }
    context += "\n";
  }

  if (architecture.edges.length > 0) {
    context += "### Connections:\n";
    const nodeMap = new Map(architecture.nodes.map((n) => [n.id, n.name]));
    for (const edge of architecture.edges) {
      const src = nodeMap.get(edge.source) ?? edge.source;
      const tgt = nodeMap.get(edge.target) ?? edge.target;
      context += `- ${src} → ${tgt} (${edge.connectionType}): ${edge.label}\n`;
    }
    context += "\n";
  }

  return context;
}

/**
 * Builds the Anthropic API message array from chat history and optional canvas state.
 * Injects canvas context as a system-level user message so the AI knows the current architecture.
 */
export function buildMessages(
  chatHistory: ChatMessage[],
  currentArchitecture: StackArchitecture | null,
): Anthropic.MessageParam[] {
  const msgs: Anthropic.MessageParam[] = [];

  // If there's an existing architecture, prepend context as the first user message
  if (
    currentArchitecture &&
    currentArchitecture.nodes.length > 0
  ) {
    const canvasContext = buildCanvasContext(currentArchitecture);
    const contextJson = JSON.stringify(currentArchitecture, null, 2);

    msgs.push({
      role: "user",
      content: `[SYSTEM CONTEXT — Current Architecture]\n\n${canvasContext}\nRaw architecture JSON:\n\`\`\`json\n${contextJson}\n\`\`\`\n\nPlease consider this existing architecture when responding. Preserve all LOCKED nodes exactly as they are.`,
    });
    msgs.push({
      role: "assistant",
      content:
        "Understood. I can see the current architecture and will preserve all locked nodes.",
    });
  }

  // Append chat history
  for (const msg of chatHistory) {
    msgs.push({
      role: msg.role,
      content: msg.content,
    });
  }

  return msgs;
}
