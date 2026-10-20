// Written out on purpose rather than imported from the CSP generator, so the
// build gate fails when an origin is added there without being approved here.
const APPROVED_CONNECT_ORIGINS = [
  "'self'",
  "https://api.github.com",
  "https://api.anthropic.com",
  "https://api.openai.com",
  "https://generativelanguage.googleapis.com",
  "https://openrouter.ai",
];

const REQUIRED_NONE_DIRECTIVES = [
  "default-src",
  "script-src-attr",
  "object-src",
  "base-uri",
  "form-action",
  "frame-ancestors",
  "frame-src",
];

const REQUIRED_HEADERS = new Map([
  ["Strict-Transport-Security", "max-age=63072000; includeSubDomains"],
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"],
  ["Referrer-Policy", "no-referrer"],
]);

export function validateSecurityPolicy(policy) {
  const errors = [];
  const directives = new Map();
  for (const part of policy.split(";")) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (!name) continue;
    if (directives.has(name)) errors.push(`Duplicate CSP directive: ${name}`);
    directives.set(name, values);
  }
  for (const name of REQUIRED_NONE_DIRECTIVES) {
    if (directives.get(name)?.join(" ") !== "'none'") {
      errors.push(`CSP ${name} must be 'none'.`);
    }
  }
  const scripts = directives.get("script-src") ?? [];
  if (
    scripts.filter((value) => value === "'self'").length !== 1 ||
    scripts.length < 2 ||
    scripts.some((value) => value !== "'self'" && !/^'sha256-[A-Za-z0-9+/]{43}='$/.test(value))
  ) {
    errors.push("CSP script-src must contain only 'self' and sha256 hashes.");
  }
  const connections = directives.get("connect-src") ?? [];
  const approved = APPROVED_CONNECT_ORIGINS;
  if (
    connections.length !== approved.length ||
    connections.some((value) => !approved.includes(value))
  ) {
    errors.push(
      "CSP connect-src must contain exactly self, GitHub's API and the supported AI provider API origins."
    );
  }
  return errors;
}

export function validateHeaders(headers, caddyfile) {
  const errors = [];
  // Check each independently applicable _headers block, not just whether one header appears somewhere.
  // Route-specific cookie expiration blocks inherit the global header policy.
  const policyBlocks = headers
    .split(/\n\s*\n/)
    .filter((block) => /^\s*Content-Security-Policy:/m.test(block));
  if (policyBlocks.length !== 2)
    errors.push("Expected global and immutable asset security header blocks.");
  for (const block of policyBlocks) {
    const [route, ...lines] = block.split(/\r?\n/);
    const entries = new Map(
      lines
        .map((line) => line.trim().match(/^([^:]+):\s*(.*)$/))
        .filter(Boolean)
        .map((match) => [match[1], match[2]])
    );
    for (const [name, value] of REQUIRED_HEADERS) {
      if (entries.get(name) !== value) errors.push(`${route}: missing or invalid ${name}.`);
    }
    errors.push(
      ...validateSecurityPolicy(entries.get("Content-Security-Policy") ?? "").map(
        (error) => `${route}: ${error}`
      )
    );
  }
  // Both ordinary responses and Caddy's explicit error responses must carry the headers.
  const headerBlocks = [...caddyfile.matchAll(/\bheader\s*\{([^}]*)\}/g)].map((match) => match[1]);
  if (headerBlocks.length !== 2)
    errors.push("Expected Caddy response and error security header blocks.");
  for (const [index, block] of headerBlocks.entries()) {
    for (const [name, value] of REQUIRED_HEADERS) {
      if (!block.split(/\r?\n/).some((line) => line.trim() === `${name} "${value}"`)) {
        errors.push(`Caddy header block ${index + 1}: missing or invalid ${name}.`);
      }
    }
    const policy = block.match(/\bContent-Security-Policy\s+"([^"]+)"/)?.[1] ?? "";
    errors.push(
      ...validateSecurityPolicy(policy).map((error) => `Caddy header block ${index + 1}: ${error}`)
    );
  }
  return errors;
}

export function validateDeployment(dockerfile, compose) {
  const errors = [];
  const runner =
    dockerfile.split(/^FROM /m).find((stage) => /^[^\n]+ AS runner\s*$/m.test(stage)) ?? "";
  if (!/^USER\s+(?!root\b|0\b)[A-Za-z_][\w-]*\s*$/m.test(runner)) {
    errors.push("Production Dockerfile runner must use a non-root USER.");
  }
  const prod =
    compose.split(/^  (?=[\w-]+:)/m).find((service) => /^prod:\s*$/m.test(service)) ?? "";
  if (!/^    read_only:\s*true\s*$/m.test(prod))
    errors.push("Production Compose service must use a read-only filesystem.");
  if (!/^    cap_drop:\s*\n\s+- ALL\s*$/m.test(prod))
    errors.push("Production Compose service must drop ALL capabilities.");
  if (!/^    security_opt:\s*\n\s+- no-new-privileges:true\s*$/m.test(prod))
    errors.push("Production Compose service must set no-new-privileges.");
  return errors;
}

export const SECRET_VALUE_PATTERNS = [
  [/sk-ant-[A-Za-z0-9_-]{12,}/, "Anthropic key value"],
  [/\bsk-(?:proj|svcacct)-[A-Za-z0-9_-]{20,}/, "OpenAI key value"],
  [/\bsk-or-v1-[0-9a-fA-F]{20,}/, "OpenRouter key value"],
  [/\bAIza[0-9A-Za-z_-]{35}/, "Google API key value"],
  [/\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/, "GitHub token value"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key value"],
  [/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/, "private key value"],
];
