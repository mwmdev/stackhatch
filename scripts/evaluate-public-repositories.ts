import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "../src/lib/ai/system-prompt";
import { parseAIResponse } from "../src/lib/ai/output-parser";
import { listRepositoryFiles } from "../src/lib/github-analyzer";
import { modelOption, parseModelReference } from "../src/lib/ai/providers";
import { isPathIncluded } from "../src/lib/local-source/folder-tree";
import {
  buildLocalGeneration,
  estimateLocalGeneration,
  repositorySubject,
} from "../src/lib/local-source/generation";

// Folders left out so the selection fits the model's context window.
const targets = [
  {
    repository: "pocketbase/pocketbase",
    excludedPaths: [".github", "examples", "migrations", "plugins", "tests", "tools", "ui"],
  },
  {
    repository: "umami-software/umami",
    excludedPaths: [
      ".eloqnt",
      ".github",
      "db",
      "docker",
      "packages",
      "podman",
      "public",
      "scripts",
      "tests",
    ],
  },
] as const;
const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
const githubToken = process.env.GITHUB_TOKEN?.trim() || null;
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
    "Set ANTHROPIC_API_KEY before running npm run eval:repositories. GITHUB_TOKEN is optional but needed above 60 GitHub requests an hour. Model output is printed; keys are never logged."
  );
}

async function main() {
  const client = new Anthropic({ apiKey });
  const system = buildSystemPrompt(undefined, { includeNoteNodes: true });
  const results = [];

  for (const { repository, excludedPaths } of targets) {
    process.stderr.write(`Evaluating ${repository}...\n`);
    const { snapshot, enumeration } = await listRepositoryFiles(repository, { githubToken });
    const excluded = new Set<string>(excludedPaths);
    const files = enumeration.files.filter((file) => isPathIncluded(file.path, excluded));
    const subject = repositorySubject(snapshot);
    const estimate = estimateLocalGeneration({
      files,
      subject,
      systemPromptCharacters: system.length,
      option: modelOption(selection),
    });
    if (!estimate.fits) {
      throw new Error(
        `${repository}: about ${estimate.inputTokens} input tokens exceed ${model}'s limit; add folders to its excludedPaths.`
      );
    }
    const generation = await buildLocalGeneration({
      subject,
      files,
      signal: new AbortController().signal,
      onProgress: () => {},
    });
    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      system,
      messages: [{ role: "user", content: `${generation.summary}\n\n${generation.context}` }],
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
      normalizedUrl: snapshot.normalizedUrl,
      defaultBranch: snapshot.defaultBranch,
      commitSha: snapshot.commitSha,
      treeTruncated: snapshot.treeTruncated,
      files: generation.citablePaths.length,
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
