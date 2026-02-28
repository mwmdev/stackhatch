import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { getSettings, getApiKey, getModel } from "@/lib/ai/settings";
import { buildCanvasContext } from "@/lib/ai/context-builder";
import type { StackArchitecture, AlternativeNode } from "@/types/stack";
import { getAuthenticatedUser, requireRole } from "@/lib/auth";

const requestSchema = z.object({
  node: z.object({
    name: z.string(),
    technology: z.string(),
    category: z.string(),
    subtype: z.string(),
    description: z.string(),
  }),
});

const alternativeSchema = z.object({
  name: z.string(),
  technology: z.string(),
  description: z.string(),
  reasoning: z.string(),
  category: z.string(),
  subtype: z.string(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }
  const roleErr = requireRole(user.role, ["admin", "paid-user"]);
  if (roleErr) return roleErr;
  const userId = user.userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const db = getDb();
  runMigrations(db);

  const settingsMap = getSettings(db);
  const apiKey = getApiKey(settingsMap);
  if (!apiKey) {
    return NextResponse.json(
      { error: "API key not configured. Please set it in Settings." },
      { status: 400 },
    );
  }

  const model = getModel(settingsMap);

  // Load current architecture for context and verify ownership
  const project = db
    .select({ canvasState: projects.canvasState })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .get();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  let architectureContext = "";
  if (project?.canvasState) {
    try {
      const arch: StackArchitecture = JSON.parse(project.canvasState);
      architectureContext = buildCanvasContext(arch);
    } catch {
      // Ignore malformed canvas state
    }
  }

  const { node } = parsed.data;
  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system:
        "You are a software architecture advisor. Given an architecture and a specific node, suggest 3-5 alternative technologies that could fill the same role. Return ONLY a JSON array of objects with fields: name, technology, description, reasoning, category, subtype. No markdown, no explanation — just the JSON array.",
      messages: [
        {
          role: "user",
          content: `${architectureContext}\nCurrent node to find alternatives for:\n- Name: ${node.name}\n- Technology: ${node.technology}\n- Category: ${node.category}\n- Subtype: ${node.subtype}\n- Description: ${node.description}\n\nSuggest 3-5 alternative technologies for this node's role. Keep the same category and subtype unless the alternative fundamentally changes the approach.`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Extract JSON array from response (handle possible markdown wrapping)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 500 },
      );
    }

    const rawAlternatives = JSON.parse(jsonMatch[0]);
    const alternatives: AlternativeNode[] = [];
    for (const alt of rawAlternatives) {
      const valid = alternativeSchema.safeParse(alt);
      if (valid.success) {
        alternatives.push(valid.data as AlternativeNode);
      }
    }

    return NextResponse.json({ alternatives });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
