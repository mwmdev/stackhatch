import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "../src/lib/ai/system-prompt";
import { DEFAULT_CHAT_PROMPT } from "../src/lib/ai/default-prompts";
import { parseAIResponse } from "../src/lib/ai/output-parser";
import { analyzeRepo, formatRepoAnalysis } from "../src/lib/github-analyzer";
import { modelSupportsEffort, normalizeAiModel } from "../src/lib/ai/models";

const repositories = ["pocketbase/pocketbase", "umami-software/umami"] as const;
const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
const model = normalizeAiModel(process.env.STACKHATCH_EVAL_MODEL?.trim());

if (!apiKey) {
  throw new Error(
    "Set ANTHROPIC_API_KEY before running npm run eval:repositories. Repository evidence and model output are printed, but the key is never logged."
  );
}

async function main() {
  const client = new Anthropic({ apiKey });
  const system = buildSystemPrompt(undefined, DEFAULT_CHAT_PROMPT, { includeNoteNodes: true });
  const results = [];

  for (const repository of repositories) {
    process.stderr.write(`Evaluating ${repository}...\n`);
    const analysis = await analyzeRepo(repository);
    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      system,
      messages: [{ role: "user", content: formatRepoAnalysis(analysis) }],
      ...(modelSupportsEffort(model) ? { output_config: { effort: "low" as const } } : {}),
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
