import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export const OUT_DIR = path.resolve("out");
export const GENERATED_HOST_DIR = path.resolve("dist-host");
export const CADDY_TEMPLATE_PATH = path.resolve("static-host/Caddyfile.template");

export const CONNECT_ORIGINS = [
  "'self'",
  "https://api.github.com",
  "https://api.anthropic.com",
  "https://api.openai.com",
  "https://generativelanguage.googleapis.com",
  "https://openrouter.ai",
];

export const NAVIGATION_ORIGINS = [
  "https://github.com",
  "https://console.anthropic.com",
  "https://platform.openai.com",
  "https://aistudio.google.com",
  "https://openrouter.ai",
];

export const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "ambient-light-sensor=()",
  "attribution-reporting=()",
  "autoplay=()",
  "browsing-topics=()",
  "camera=()",
  "display-capture=()",
  "encrypted-media=()",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=()",
  "publickey-credentials-create=()",
  "publickey-credentials-get=()",
  "screen-wake-lock=()",
  "usb=()",
].join(", ");

export const LEGACY_COOKIE_EXPIRATIONS = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
].map(
  (name) =>
    `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`
);

export const DOCUMENT_ROUTES = [
  "/",
  "/app",
  "/app/maps",
  "/project",
  "/project/new",
  "/settings",
  "/support",
  "/privacy",
  "/terms",
];

export const TRAILING_DOCUMENT_ROUTES = DOCUMENT_ROUTES.filter((route) => route !== "/").map(
  (route) => `${route}/`
);

export const LEGACY_COOKIE_ROUTES = [...DOCUMENT_ROUTES, ...TRAILING_DOCUMENT_ROUTES];

function ignoreRules(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function hasEnvironmentIgnorePolicy(content) {
  const rules = ignoreRules(content);
  const exceptions = rules.filter((rule) => rule.startsWith("!.env"));
  return (
    rules.includes(".env") &&
    rules.includes(".env.*") &&
    exceptions.length === 2 &&
    exceptions.includes("!.env.example") &&
    exceptions.includes("!.env.local.example")
  );
}

export function validateEnvironmentIgnoreFiles(gitignore, dockerignore) {
  const errors = [];
  if (!hasEnvironmentIgnorePolicy(gitignore)) {
    errors.push("Repository ignore policy does not deny environment secrets.");
  }
  if (!hasEnvironmentIgnorePolicy(dockerignore)) {
    errors.push("Docker context ignore policy does not deny environment secrets.");
  }
  return errors;
}

export function validateDockerfileBaseImages(dockerfile) {
  const stages = new Map([
    ["builder", []],
    ["runner", []],
  ]);

  for (const line of dockerfile.split(/\r?\n/)) {
    const match = line.trim().match(/^FROM\s+(\S+)\s+AS\s+(\S+)$/);
    if (match && stages.has(match[2])) {
      stages.get(match[2]).push(match[1]);
    }
  }

  const isPinned = (stage) => {
    const references = stages.get(stage);
    return references.length === 1 && /^[^@\s]+:[^@\s]+@sha256:[0-9a-f]{64}$/.test(references[0]);
  };

  const errors = [];
  if (!isPinned("builder")) errors.push("Builder base image is not pinned by digest.");
  if (!isPinned("runner")) errors.push("Production Caddy base image is not pinned by digest.");
  return errors;
}

export async function walkFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
    })
  );
  return files.flat();
}

export async function collectInlineScriptHashes() {
  const files = await walkFiles(OUT_DIR);
  const hashes = new Set();

  for (const file of files.filter((candidate) => candidate.endsWith(".html"))) {
    const html = await readFile(file, "utf8");
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      const [, attributes, content] = match;
      if (/\bsrc\s*=/.test(attributes) || content.length === 0) continue;
      hashes.add(`'sha256-${createHash("sha256").update(content).digest("base64")}'`);
    }
  }

  return [...hashes].sort();
}

export function createContentSecurityPolicy(scriptHashes) {
  return [
    "default-src 'none'",
    "base-uri 'none'",
    `connect-src ${CONNECT_ORIGINS.join(" ")}`,
    "font-src 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "img-src 'self' blob: data:",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    `script-src 'self' ${scriptHashes.join(" ")}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
  ].join("; ");
}

export const HSTS_POLICY = "max-age=63072000; includeSubDomains";

export function createHeadersFile(contentSecurityPolicy) {
  const headers = [
    `  Content-Security-Policy: ${contentSecurityPolicy}`,
    "  Cache-Control: no-cache",
    "  Cross-Origin-Opener-Policy: same-origin",
    "  Cross-Origin-Resource-Policy: same-origin",
    `  Permissions-Policy: ${PERMISSIONS_POLICY}`,
    "  Referrer-Policy: no-referrer",
    `  Strict-Transport-Security: ${HSTS_POLICY}`,
    "  X-Content-Type-Options: nosniff",
    "  X-Frame-Options: DENY",
  ];

  return [
    "/*",
    ...headers,
    "",
    "/_next/static/*",
    ...headers.filter((header) => !header.includes("Cache-Control")),
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
    ...LEGACY_COOKIE_ROUTES.flatMap((route) => [
      route,
      ...LEGACY_COOKIE_EXPIRATIONS.map((cookie) => `  Set-Cookie: ${cookie}`),
      "",
    ]),
  ].join("\n");
}
