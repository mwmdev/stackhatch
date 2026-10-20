/** A chat message stored in the device vault. */
export interface ChatMessage {
  id: string;
  projectId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}
