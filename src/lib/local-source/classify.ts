import { normalizeEvidencePath } from "@/lib/node-evidence";
import { LOCAL_SOURCE_LIMITS } from "./limits";
import type { ExclusionReason, LocalSourceLanguage } from "./types";

const IGNORED_FILENAMES = new Set([
  "bun.lock",
  "bun.lockb",
  "cargo.lock",
  "composer.lock",
  "package-lock.json",
  "pnpm-lock.yaml",
  "poetry.lock",
  "uv.lock",
  "yarn.lock",
]);

const BINARY_EXTENSIONS = new Set([
  "7z",
  "avi",
  "avif",
  "bin",
  "bmp",
  "class",
  "dll",
  "dmg",
  "doc",
  "docx",
  "eot",
  "exe",
  "gif",
  "gz",
  "ico",
  "jar",
  "jpeg",
  "jpg",
  "mov",
  "mp3",
  "mp4",
  "otf",
  "pdf",
  "png",
  "ppt",
  "pptx",
  "pyc",
  "so",
  "tar",
  "tiff",
  "ttf",
  "wav",
  "webm",
  "webp",
  "woff",
  "woff2",
  "xls",
  "xlsx",
  "zip",
]);

const entries = (reason: ExclusionReason, names: string[]): Array<[string, ExclusionReason]> =>
  names.map((name) => [name, reason]);

export const LOCAL_EXCLUDED_DIRECTORIES: Readonly<Record<string, ExclusionReason>> = Object.freeze(
  Object.fromEntries([
    ...entries("version-control", [".git", ".hg", ".svn"]),
    ...entries("dependency", ["node_modules", "bower_components", "vendor", ".venv", "venv"]),
    ...entries("generated", [
      "__pycache__",
      ".next",
      ".nuxt",
      ".output",
      ".turbo",
      "build",
      "dist",
      "out",
      "target",
      "coverage",
      "generated",
      ".cache",
      ".parcel-cache",
      ".svelte-kit",
      ".mypy_cache",
      ".pytest_cache",
      ".tox",
    ]),
    ...entries("editor", [".idea", ".vscode"]),
  ])
);

export function classifyDirectory(name: string): ExclusionReason | null {
  const key = name.toLowerCase();
  return Object.hasOwn(LOCAL_EXCLUDED_DIRECTORIES, key) ? LOCAL_EXCLUDED_DIRECTORIES[key] : null;
}

const TYPESCRIPT_EXTENSIONS = new Set(["ts", "tsx", "mts", "cts"]);
const JAVASCRIPT_EXTENSIONS = new Set(["js", "jsx", "mjs", "cjs"]);
const PHP_EXTENSIONS = new Set(["php", "phtml"]);
const PYTHON_EXTENSIONS = new Set(["py", "pyi"]);

const TEXT_EXTENSIONS = new Set(
  (
    "md mdx txt rst adoc json jsonc json5 yaml yml toml ini cfg conf properties xml html htm css scss sass less " +
    "vue svelte astro sql graphql gql proto sh bash zsh fish ps1 bat cmd go java kt kts scala rb c h cc cpp cxx " +
    "hpp hh cs swift m mm lua pl pm r dart ex exs erl hrl hs clj cljs tf hcl gradle csv tsv"
  ).split(" ")
);

const TEXT_FILE_NAMES = new Set([
  "dockerfile",
  "go.mod",
  "schema.prisma",
  "makefile",
  "rakefile",
  "gemfile",
  "procfile",
  "justfile",
  "license",
  "readme",
  "codeowners",
  ".gitignore",
  ".gitattributes",
  ".editorconfig",
  ".prettierrc",
  ".eslintrc",
  ".babelrc",
  ".npmignore",
  ".dockerignore",
  ".nvmrc",
  ".tool-versions",
]);

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1).toLowerCase();
}

function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  return index <= 0 ? "" : name.slice(index + 1);
}

export function languageForPath(path: string): LocalSourceLanguage | null {
  const name = baseName(path);
  if (/^\.env\.(example|sample|template)$/.test(name)) return "text";
  const extension = extensionOf(name);
  if (TYPESCRIPT_EXTENSIONS.has(extension)) return "typescript";
  if (JAVASCRIPT_EXTENSIONS.has(extension)) return "javascript";
  if (PHP_EXTENSIONS.has(extension)) return "php";
  if (PYTHON_EXTENSIONS.has(extension)) return "python";
  if (extension === "rs") return "rust";
  if (extension && TEXT_EXTENSIONS.has(extension)) return "text";
  if (TEXT_FILE_NAMES.has(name) || name.startsWith("dockerfile.")) return "text";
  return null;
}

const SECRET_EXTENSIONS = new Set([
  "pem",
  "key",
  "p12",
  "pfx",
  "jks",
  "keystore",
  "kdbx",
  "tfstate",
  "tfvars",
]);
const SECRET_NAMES = new Set([".npmrc", ".pypirc", ".netrc", ".htpasswd", "credentials.json"]);

function isSecretName(name: string): boolean {
  if (/^\.env(\..+)?$/.test(name) && !/^\.env\.(example|sample|template)$/.test(name)) return true;
  if (SECRET_EXTENSIONS.has(extensionOf(name))) return true;
  if (/^id_(rsa|dsa|ecdsa|ed25519)$/.test(name)) return true;
  if (SECRET_NAMES.has(name)) return true;
  if (/^secrets?\.(json|ya?ml|toml|env)$/.test(name)) return true;
  return /^service-account.*\.json$/.test(name);
}

export function classifyFile(
  path: string,
  size: number
): { language: LocalSourceLanguage } | { excluded: ExclusionReason } {
  if (path.length > 512 || normalizeEvidencePath(path) !== path) {
    return { excluded: "unsupported-name" };
  }
  const name = baseName(path);
  if (IGNORED_FILENAMES.has(name)) return { excluded: "lockfile" };
  if (isSecretName(name)) return { excluded: "secret" };
  if (/\.min\.(js|css)$/.test(name)) return { excluded: "minified" };
  const extension = extensionOf(name);
  if (extension === "map") return { excluded: "generated" };
  if (extension && BINARY_EXTENSIONS.has(extension)) return { excluded: "binary" };
  if (size > LOCAL_SOURCE_LIMITS.maxFileBytes) return { excluded: "too-large" };
  const language = languageForPath(path);
  return language ? { language } : { excluded: "unrecognized" };
}
