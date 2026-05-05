import { z } from "zod";

const nodeCategories = [
  "client",
  "api",
  "services",
  "data",
  "infrastructure",
  "external",
  "note",
] as const;

const connectionTypes = [
  "http",
  "websocket",
  "grpc",
  "tcp",
  "pub-sub",
  "file-io",
] as const;

const noteColors = ["yellow", "mint", "peach", "sky", "lilac"] as const;

export const chatCanvasStateSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string().min(1),
      category: z.enum(nodeCategories),
      subtype: z.string().min(1),
      name: z.string(),
      technology: z.string(),
      description: z.string(),
      reasoning: z.string(),
      locked: z.boolean(),
      noteColor: z.enum(noteColors).optional(),
    })
  ),
  edges: z.array(
    z.object({
      id: z.string().min(1),
      source: z.string().min(1),
      target: z.string().min(1),
      connectionType: z.enum(connectionTypes),
      label: z.string(),
    })
  ),
});
