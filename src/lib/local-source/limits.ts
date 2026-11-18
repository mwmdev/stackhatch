export const LOCAL_SOURCE_LIMITS = {
  maxFileBytes: 2 * 1024 * 1024,
  maxGenerationBytes: 16 * 1024 * 1024,
  maxEnumeratedEntries: 1_000_000,
  reportListLimit: 1_000,
  binarySniffCharacters: 8_000,
  maxExcludedPaths: 5_000,
  maxFolderNameLength: 200,
  /** Total file text one "Ask about these files" attachment may carry; under MAX_CHAT_ATTACHMENT_BYTES. */
  evidenceAttachmentCharacters: 180_000,
} as const;
/** Conservative for code; the estimate is labelled approximate. */
export const ESTIMATED_CHARACTERS_PER_TOKEN = 3.5;
