export const BACKUP_LIMITS = {
  maxBytes: 8 * 1024 * 1024,
  maxDepth: 24,
  maxArrayLength: 5_000,
  maxRecords: 20_000,
  maxStringLength: 1_000_000,
  maxProjects: 1_000,
  maxTemplates: 1_000,
  maxMessagesPerProject: 5_000,
  maxEvidencePerProject: 500,
  maxEvidenceCharacters: 100_000,
} as const;
