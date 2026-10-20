import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "../src/lib/ai/system-prompt";
import { parseAIResponse } from "../src/lib/ai/output-parser";
import { analyzeRepo, formatRepoAnalysis } from "../src/lib/github-analyzer";
import { parseModelReference } from "../src/lib/ai/providers";

const repositories = ["pocketbase/pocketbase", "umami-software/umami"] as const;
const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
// Accepts the stored `provider:model` form as well as a bare Anthropic id.
const selection = parseModelReference(process.env.STACKHATCH_EVAL_MODEL);
const model = selection.model;
// Effort is sent only to models known to accept it; leaving it out is always safe.
const supportsEffort = ["claude-sonnet-5", "claude-opus-4-8"].includes(model);

if (selection.provider !== "anthropic") {
  throw new Error("npm run eval:repositories evaluates Anthropic models only.");
}

if (!apiKey) {
  throw new Error(
    "Set ANTHROPIC_API_KEY before running npm run eval:repositories. Repository evidence and model output are printed, but the key is never logged."
  );
}

async function main() {
  const client = new Anthropic({ apiKey });
  const system = buildSystemPrompt(undefined, { includeNoteNodes: true });
  const results = [];

  for (const repository of repositories) {
    process.stderr.write(`Evaluating ${repository}...\n`);
    const analysis = await analyzeRepo(repository);
    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      system,
      messages: [{ role: "user", content: formatRepoAnalysis(analysis) }],
      ...(supportsEffort ? { output_config: { effort: "low" as const } } : {}),
    });
    const fullResponse = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
    const parsed = parseAIResponse(fullResponse, { allowNoteNodes: true });

    if (!parsed.architecture || parsed.architecture.nodes.length === 0) {
      throw new Error(
        `${repository} did not produce a valid non-empty architecture (stop reason: ${response.stop_reason}). Text output: ${fullResponse.slice(0, 1200)}`
      );
    }

    results.push({
      repository,
      normalizedUrl: analysis.normalizedUrl,
      defaultBranch: analysis.defaultBranch,
      commitSha: analysis.commitSha,
      analysisStatus: analysis.status,
      warnings: analysis.warnings,
      model,
      explanation: parsed.message,
      architecture: parsed.architecture,
    });
  }

  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
