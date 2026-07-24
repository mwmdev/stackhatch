import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  CADDY_TEMPLATE_PATH,
  GENERATED_HOST_DIR,
  LEGACY_COOKIE_EXPIRATIONS,
  OUT_DIR,
  PERMISSIONS_POLICY,
  collectInlineScriptHashes,
  createContentSecurityPolicy,
  createHeadersFile,
} from "./static-policy.mjs";

const hashes = await collectInlineScriptHashes();
if (hashes.length === 0) {
  throw new Error("Static policy generation found no inline scripts to authorize.");
}

const contentSecurityPolicy = createContentSecurityPolicy(hashes);
const template = await readFile(CADDY_TEMPLATE_PATH, "utf8");
const caddyfile = template
  .replaceAll("{{CONTENT_SECURITY_POLICY}}", contentSecurityPolicy)
  .replaceAll("{{PERMISSIONS_POLICY}}", PERMISSIONS_POLICY)
  .replace(
    "{{LEGACY_COOKIE_EXPIRATIONS}}",
    LEGACY_COOKIE_EXPIRATIONS.map((cookie) => `\t\t+Set-Cookie "${cookie}"`).join("\n")
  );

if (caddyfile.includes("{{")) {
  throw new Error("Static host template contains an unresolved placeholder.");
}

await mkdir(GENERATED_HOST_DIR, { recursive: true });
await writeFile(`${GENERATED_HOST_DIR}/Caddyfile`, caddyfile);
await writeFile(`${OUT_DIR}/_headers`, createHeadersFile(contentSecurityPolicy));

console.log(`Generated static host policy with ${hashes.length} inline-script hashes.`);
