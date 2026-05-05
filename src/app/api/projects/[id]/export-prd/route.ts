import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "@/db";
import { runMigrations } from "@/db/migrate";
import { getSettings, getApiKey, getModel, getPrompt } from "@/lib/ai/settings";
import { DEFAULT_PRD_PROMPT } from "@/lib/ai/default-prompts";
import { buildCanvasContext } from "@/lib/ai/context-builder";
import type { StackArchitecture } from "@/types/stack";
import { getAuthenticatedUser, requireRole } from "@/lib/auth";
import { getAccessibleProject } from "@/lib/project-access";
import { getActivePlan } from "@/lib/plans";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const roleErr = requireRole(user.role, ["admin", "starter", "pro"]);
  if (roleErr) return roleErr;

  const db = getDb();
  runMigrations(db);

  const plan = getActivePlan(db, user.userId, user.role);
  if (plan !== "pro") {
    return NextResponse.json(
      {
        error: "Studio plan required for PRD export",
        upgradeRequired: true,
        upgradeUrl: "/pricing",
      },
      { status: 403 }
    );
  }

  const project = getAccessibleProject(db, id, user.userId);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (!project.canvasState) {
    return NextResponse.json(
      { error: "No architecture to export. Add nodes to the canvas first." },
      { status: 400 }
    );
  }

  let architecture: StackArchitecture;
  try {
    architecture = JSON.parse(project.canvasState);
  } catch {
    return NextResponse.json({ error: "Invalid canvas state" }, { status: 400 });
  }

  if (!architecture.nodes || architecture.nodes.length === 0) {
    return NextResponse.json(
      { error: "No nodes in architecture. Add components first." },
      { status: 400 }
    );
  }

  const settingsMap = getSettings(db);
  const apiKey = getApiKey(db, user.userId);
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "Add your Anthropic API key in Settings to export a PRD.",
        code: "AI_NOT_CONFIGURED",
      },
      { status: 503 }
    );
  }

  const model = getModel(settingsMap);
  const prdPrompt = getPrompt(settingsMap, "prompt_prd", DEFAULT_PRD_PROMPT);
  const canvasContext = buildCanvasContext(architecture);
  const architectureJson = JSON.stringify(architecture, null, 2);

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: prdPrompt,
      messages: [
        {
          role: "user",
          content: `Project: ${project.name}\n\n${canvasContext}\nRaw architecture JSON:\n\`\`\`json\n${architectureJson}\n\`\`\`\n\nGenerate a detailed PRD for this architecture.`,
        },
      ],
    });

    const prd = response.content[0].type === "text" ? response.content[0].text : "";

    return NextResponse.json({ prd, projectName: project.name });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
