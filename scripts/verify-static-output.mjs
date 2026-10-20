import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  CONNECT_ORIGINS,
  GENERATED_HOST_DIR,
  NAVIGATION_ORIGINS,
  OUT_DIR,
  collectInlineScriptHashes,
  createContentSecurityPolicy,
  createHeadersFile,
  validateDockerfileBaseImages,
  validateEnvironmentIgnoreFiles,
  walkFiles,
} from "./static-policy.mjs";
import {
  SECRET_VALUE_PATTERNS,
  validateDeployment,
  validateHeaders,
} from "./static-policy-checks.mjs";
const errors = [];

async function requireFile(file) {
  try {
    const details = await stat(file);
    if (!details.isFile()) errors.push(`Expected a file: ${file}`);
  } catch {
    errors.push(`Missing required file: ${file}`);
  }
}

for (const route of [
  "index.html",
  "404.html",
  "app.html",
  "app/maps.html",
  "project.html",
  "project/new.html",
  "settings.html",
  "support.html",
  "privacy.html",
  "terms.html",
  "robots.txt",
  "sitemap.xml",
]) {
  await requireFile(path.join(OUT_DIR, route));
}

const files = await walkFiles(OUT_DIR);
const relativeFiles = files.map((file) => path.relative(OUT_DIR, file));
for (const file of relativeFiles) {
  if (/(^|\/)(api|server|operator|drizzle)(\/|$)/i.test(file)) {
    errors.push(`Server artifact is forbidden: ${file}`);
  }
  if (/\.(?:map|node|sqlite|db|wal|shm)$/i.test(file)) {
    errors.push(`Runtime or sensitive artifact is forbidden: ${file}`);
  }
}

const textualFiles = files.filter(
  (file) => /\.(?:css|html|js|json|txt|xml)$/.test(file) || file.endsWith("/_headers")
);
const forbiddenArtifactPatterns = [
  [/\bNEXTAUTH_(?:SECRET|URL)\b/i, "Auth.js runtime secret"],
  [/\bSTACKHATCH_ENCRYPTION_KEY\b/i, "server encryption secret"],
  [/\bDATABASE_URL\b/i, "database configuration"],
  [/\bGITHUB_(?:CLIENT_ID|CLIENT_SECRET|TOKEN)\b/i, "GitHub runtime credential"],
  [/\bNEXT_PUBLIC_UMAMI_/i, "analytics configuration"],
  [/\bnext-auth\b/i, "Auth.js dependency"],
  [/\bbetter-sqlite3\b/i, "SQLite server dependency"],
  [/\bdrizzle-orm\b/i, "Drizzle server dependency"],
  [/support@stackhatch\.io/i, "retired operational support address"],
  [/encrypted before storage/i, "retired encrypted-server-key claim"],
  [/active application database/i, "retired server database claim"],
  [/sign in with GitHub/i, "retired account claim"],
];
forbiddenArtifactPatterns.push(...SECRET_VALUE_PATTERNS);

for (const file of textualFiles) {
  const content = await readFile(file, "utf8");
  for (const [pattern, label] of forbiddenArtifactPatterns) {
    if (pattern.test(content)) {
      errors.push(`${label} found in ${path.relative(OUT_DIR, file)}`);
    }
  }

  if (file.endsWith(".html")) {
    if (/<script\b[^>]*\bsrc=["']https?:/i.test(content)) {
      errors.push(`Remote executable script found in ${path.relative(OUT_DIR, file)}`);
    }
    if (
      /<link\b[^>]*\brel=["'](?:stylesheet|modulepreload|preload)["'][^>]*\bhref=["']https?:/i.test(
        content
      )
    ) {
      errors.push(`Remote executable asset found in ${path.relative(OUT_DIR, file)}`);
    }
    for (const match of content.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) {
      const href = match[1];
      if (!/^https?:/i.test(href)) continue;
      const origin = new URL(href).origin;
      if (!NAVIGATION_ORIGINS.includes(origin)) {
        errors.push(
          `Unapproved navigation origin ${origin} found in ${path.relative(OUT_DIR, file)}`
        );
      }
    }
  }

  if (file.endsWith(".css") && /url\(\s*["']?https?:/i.test(content)) {
    errors.push(`Remote CSS asset found in ${path.relative(OUT_DIR, file)}`);
  }
}

const scriptHashes = await collectInlineScriptHashes();
const expectedPolicy = createContentSecurityPolicy(scriptHashes);
const headersPath = path.join(OUT_DIR, "_headers");
const caddyPath = path.join(GENERATED_HOST_DIR, "Caddyfile");
await requireFile(headersPath);
await requireFile(caddyPath);

const [headers, caddyfile, dockerfile, compose, gitignore, dockerignore] = await Promise.all([
  readFile(headersPath, "utf8"),
  readFile(caddyPath, "utf8"),
  readFile("Dockerfile", "utf8"),
  readFile("docker-compose.yml", "utf8"),
  readFile(".gitignore", "utf8"),
  readFile(".dockerignore", "utf8"),
]);

if (headers !== createHeadersFile(expectedPolicy)) {
  errors.push("out/_headers does not match the exported HTML.");
}
if (!caddyfile.includes(`Content-Security-Policy "${expectedPolicy}"`)) {
  errors.push("Generated Caddy policy does not match the exported HTML.");
}
errors.push(...validateHeaders(headers, caddyfile));

errors.push(...validateEnvironmentIgnoreFiles(gitignore, dockerignore));
errors.push(...validateDockerfileBaseImages(dockerfile));
for (const forbiddenDockerPattern of [
  /\.next\/standalone/,
  /\bserver\.js\b/,
  /\/app\/data/,
  /\bVOLUME\b/,
]) {
  if (forbiddenDockerPattern.test(dockerfile)) {
    errors.push(`Production Dockerfile retains a runtime surface: ${forbiddenDockerPattern}`);
  }
}

errors.push(...validateDeployment(dockerfile, compose));
const prodService =
  compose.split(/^  (?=[\w-]+:)/m).find((service) => /^prod:\s*$/m.test(service)) ?? "";
for (const forbiddenProdSetting of ["volumes:", "env_file:", "environment:", "secrets:"]) {
  if (prodService.includes(forbiddenProdSetting)) {
    errors.push(`Production Compose service contains ${forbiddenProdSetting}`);
  }
}

if (errors.length > 0) {
  console.error("Static artifact verification failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Verified ${relativeFiles.length} static files, ${scriptHashes.length} inline-script hashes, CSP/security headers, artifact secret patterns, and production container restrictions.`
  );
}
