export const LOCAL_SOURCE_LANGUAGES = [
  "typescript",
  "javascript",
  "php",
  "python",
  "rust",
  "text",
] as const;
export type LocalSourceLanguage = (typeof LOCAL_SOURCE_LANGUAGES)[number];

export type ExclusionReason =
  | "dependency"
  | "generated"
  | "version-control"
  | "editor"
  | "lockfile"
  | "binary"
  | "minified"
  | "secret"
  | "unrecognized"
  | "too-large"
  | "unsupported-name";
