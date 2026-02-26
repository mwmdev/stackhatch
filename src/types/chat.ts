/** A chat message as stored in the database */
export interface ChatMessage {
  id: string;
  projectId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

/** SSE event types sent from the chat API */
export type ChatSSEEvent =
  | { type: "text"; content: string }
  | { type: "architecture"; content: object }
  | { type: "error"; content: string }
  | { type: "done" };
