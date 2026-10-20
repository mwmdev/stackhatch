/**
 * The optional GitHub token that lets a scan read private repositories.
 *
 * Only fine-grained personal access tokens are accepted: they can be limited to
 * read-only access on chosen repositories, while classic tokens usually carry
 * write access to every repository their owner can reach.
 */
export const GITHUB_CREDENTIAL_ID = "github";
export type GitHubCredentialId = typeof GITHUB_CREDENTIAL_ID;

export const GITHUB_TOKEN_PREFIX = "github_pat_";

const FINE_GRAINED_TOKEN = /^github_pat_[A-Za-z0-9_]+$/;
const OTHER_GITHUB_TOKEN = /^(?:ghp|gho|ghu|ghs|ghr)_/;

/**
 * A local shape check, not a verification that GitHub will accept the token.
 * Returns the message to show, or null when the token looks right.
 */
export function githubTokenShapeError(value: string): string | null {
  const token = value.trim();
  if (FINE_GRAINED_TOKEN.test(token)) return null;
  if (OTHER_GITHUB_TOKEN.test(token)) {
    return `StackHatch only accepts fine-grained tokens, which can be limited to read-only access. Create one that starts with ${GITHUB_TOKEN_PREFIX}`;
  }
  return `Enter a fine-grained GitHub token. It starts with ${GITHUB_TOKEN_PREFIX}`;
}

/**
 * GitHub's token form, pre-filled with read-only Contents access (which also
 * grants Metadata) and, when known, the repository owner. The user still picks
 * the repositories on GitHub.
 */
export function githubTokenCreationUrl(owner?: string | null): string {
  const url = new URL("https://github.com/settings/personal-access-tokens/new");
  url.searchParams.set("name", "StackHatch");
  url.searchParams.set("description", "Read-only access for StackHatch repository maps");
  if (owner) url.searchParams.set("target_name", owner);
  url.searchParams.set("contents", "read");
  return url.toString();
}
