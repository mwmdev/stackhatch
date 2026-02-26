import { z } from "zod";
import type { StackArchitecture } from "@/types/stack";

const nodeCategories = [
  "client",
  "api",
  "services",
  "data",
  "infrastructure",
  "external",
] as const;

const nodeSubtypes = [
  "web-app",
  "mobile-app",
  "desktop-app",
  "cli",
  "rest-api",
  "graphql",
  "grpc",
  "websocket-server",
  "auth",
  "payments",
  "notifications",
  "search",
  "file-processing",
  "custom",
  "sql-db",
  "nosql-db",
  "cache",
  "message-queue",
  "object-storage",
  "cdn",
  "load-balancer",
  "api-gateway",
  "dns",
  "reverse-proxy",
  "third-party-api",
  "oauth-provider",
  "email-sms-service",
] as const;

const connectionTypes = [
  "http",
  "websocket",
  "grpc",
  "tcp",
  "pub-sub",
  "file-io",
] as const;

const stackNodeSchema = z.object({
  id: z.string().min(1),
  category: z.enum(nodeCategories),
  subtype: z.enum(nodeSubtypes),
  name: z.string().min(1),
  technology: z.string(),
  description: z.string(),
  reasoning: z.string(),
  locked: z.boolean(),
});

const stackEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  connectionType: z.enum(connectionTypes),
  label: z.string(),
});

export const stackArchitectureSchema = z.object({
  nodes: z.array(stackNodeSchema),
  edges: z.array(stackEdgeSchema),
});

export interface ParsedAIResponse {
  message: string;
  architecture: StackArchitecture | null;
}

/**
 * Extracts a `<stack>...</stack>` JSON block from an AI response.
 * Returns the cleaned message text and the parsed architecture (or null).
 */
export function parseAIResponse(text: string): ParsedAIResponse {
  const stackRegex = /<stack>\s*([\s\S]*?)\s*<\/stack>/;
  const match = stackRegex.exec(text);

  if (!match) {
    return { message: text, architecture: null };
  }

  const jsonStr = match[1];
  const cleanedMessage = text.replace(stackRegex, "").trim();

  try {
    const parsed = JSON.parse(jsonStr);
    const result = stackArchitectureSchema.safeParse(parsed);

    if (result.success) {
      return { message: cleanedMessage, architecture: result.data };
    }

    // Validation failed — return message without architecture
    return { message: cleanedMessage, architecture: null };
  } catch {
    // JSON parse failed — return message without architecture
    return { message: cleanedMessage, architecture: null };
  }
}
