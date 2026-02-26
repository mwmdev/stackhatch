export interface RepoAnalysis {
  owner: string;
  repo: string;
  description: string | null;
  primaryLanguage: string | null;
  languages: Record<string, number>;
  topics: string[];
  packageFiles: Array<{ path: string; content: string }>;
}

const PACKAGE_FILES = [
  "package.json",
  "requirements.txt",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
  "composer.json",
  "Gemfile",
  "build.gradle",
  "pom.xml",
  "docker-compose.yml",
  "docker-compose.yaml",
  "Dockerfile",
];

const MAX_PACKAGE_FILES = 5;
const MAX_FILE_SIZE = 4000;

export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/\s]+)\/([^/?\s#]+)/);
  if (!match) return null;
  const owner = match[1];
  const repo = match[2].replace(/\.git$/, "");
  return { owner, repo };
}

async function ghFetch(path: string): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}

export async function analyzeRepo(repoUrl: string): Promise<RepoAnalysis> {
  const parsed = parseGitHubUrl(repoUrl);
  if (!parsed) throw new Error("Invalid GitHub URL");

  const { owner, repo } = parsed;

  // Fetch repo metadata and languages in parallel
  const [repoRes, langRes] = await Promise.all([
    ghFetch(`/repos/${owner}/${repo}`),
    ghFetch(`/repos/${owner}/${repo}/languages`),
  ]);

  if (repoRes.status === 404) throw new Error("Repository not found or is private");
  if (repoRes.status === 403 || repoRes.status === 429) {
    throw new Error("GitHub API rate limit reached. Please wait a few minutes and try again.");
  }
  if (!repoRes.ok) throw new Error(`GitHub API error: ${repoRes.status}`);

  const repoData = await repoRes.json();
  const languages: Record<string, number> = langRes.ok ? await langRes.json() : {};
  const topics: string[] = repoData.topics ?? [];

  // Fetch package files in parallel (try all, keep first MAX_PACKAGE_FILES that succeed)
  const fileResults = await Promise.allSettled(
    PACKAGE_FILES.map(async (path) => {
      const res = await ghFetch(`/repos/${owner}/${repo}/contents/${path}`);
      if (!res.ok) throw new Error("not found");
      const data = await res.json();
      if (data.encoding === "base64" && data.content) {
        const content = Buffer.from(data.content, "base64").toString("utf-8");
        return { path, content: content.slice(0, MAX_FILE_SIZE) };
      }
      return { path, content: "(binary or empty)" };
    }),
  );

  const packageFiles = fileResults
    .filter((r): r is PromiseFulfilledResult<{ path: string; content: string }> =>
      r.status === "fulfilled",
    )
    .map((r) => r.value)
    .slice(0, MAX_PACKAGE_FILES);

  return {
    owner,
    repo,
    description: repoData.description ?? null,
    primaryLanguage: repoData.language ?? null,
    languages,
    topics,
    packageFiles,
  };
}

export function formatRepoAnalysis(analysis: RepoAnalysis): string {
  const totalBytes = Object.values(analysis.languages).reduce((a, b) => a + b, 0);
  const langBreakdown = Object.entries(analysis.languages)
    .sort(([, a], [, b]) => b - a)
    .map(([lang, bytes]) => `${lang} (${totalBytes > 0 ? Math.round((bytes / totalBytes) * 100) : 0}%)`)
    .join(", ");

  let text = `Analyze this GitHub repository and generate a complete architecture diagram for it.

Repository: https://github.com/${analysis.owner}/${analysis.repo}`;

  if (analysis.description) {
    text += `\nDescription: ${analysis.description}`;
  }
  if (analysis.primaryLanguage) {
    text += `\nPrimary Language: ${analysis.primaryLanguage}`;
  }
  if (langBreakdown) {
    text += `\nLanguages: ${langBreakdown}`;
  }
  if (analysis.topics.length > 0) {
    text += `\nTopics: ${analysis.topics.join(", ")}`;
  }

  if (analysis.packageFiles.length > 0) {
    text += "\n\nPackage/config files found:";
    for (const file of analysis.packageFiles) {
      text += `\n\n--- ${file.path} ---\n${file.content}`;
    }
  }

  text += "\n\nBased on this codebase analysis, generate the architecture immediately — skip the interview questions since we have concrete data. Explain what you found and why you made each architectural decision.";

  return text;
}
