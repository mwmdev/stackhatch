const STACKHATCH_REPOSITORY_API = "https://api.github.com/repos/mwmdev/stackhatch";

export async function getGitHubStarCount(): Promise<number | null> {
  try {
    const response = await fetch(STACKHATCH_REPOSITORY_API, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "StackHatch",
      },
      next: { revalidate: 3600 },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { stargazers_count?: unknown };
    return typeof data.stargazers_count === "number" && data.stargazers_count >= 0
      ? data.stargazers_count
      : null;
  } catch {
    return null;
  }
}

export function formatGitHubStarCount(stars: number) {
  return new Intl.NumberFormat("en", {
    notation: stars >= 1_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(stars);
}
