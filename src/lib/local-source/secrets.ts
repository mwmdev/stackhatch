const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/,
  /sk-ant-[A-Za-z0-9_-]{20,}/,
  /\bsk-(?:proj|svcacct)-[A-Za-z0-9_-]{20,}/,
  /\bsk-or-v1-[0-9a-fA-F]{20,}/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\bAQ\.[A-Za-z0-9_-]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/,
];

/** Best-effort detector for credential values; it cannot find every secret. */
export function containsLikelySecret(text: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}
