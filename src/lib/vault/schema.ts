import type { DBSchema } from "idb";
import type { AlternativeNode, StackArchitecture } from "@/types/stack";
import type { CustomSubtypeEntry, CustomSubtypesMap } from "@/lib/custom-subtypes";

export const VAULT_DATABASE_NAME = "stackhatch-vault";
export const VAULT_SCHEMA_VERSION = 2;
export const VAULT_META_ID = "vault" as const;
export const DEVICE_RECORD_ID = "device" as const;

export const VAULT_STORE_NAMES = [
  "meta",
  "projects",
  "messages",
  "templates",
  "preferences",
  "resume",
  "repositoryEvidence",
  "repositoryProvenance",
  "providerRuns",
] as const;

export type VaultStoreName = (typeof VAULT_STORE_NAMES)[number];

export interface VaultCanvasState extends StackArchitecture {
  positions?: Record<string, { x: number; y: number }>;
  alternatives?: Record<string, AlternativeNode[]>;
}

export interface VaultMetaRecord {
  id: typeof VAULT_META_ID;
  generation: string;
  schemaVersion: number;
  createdAt: number;
  updatedAt: number;
}

export interface VaultProjectRecord {
  id: string;
  name: string;
  description: string | null;
  repoUrl: string | null;
  canvasState: VaultCanvasState | null;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface VaultMessageRecord {
  id: string;
  projectId: string;
  role: "user" | "assistant";
  content: string;
  revision: number;
  createdAt: number;
}

export interface VaultTemplateRecord {
  id: string;
  name: string;
  description: string | null;
  canvasState: VaultCanvasState;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export type VaultCustomSubtype = CustomSubtypeEntry;
export type VaultCustomSubtypes = CustomSubtypesMap;

export interface VaultDevicePreferencesRecord {
  id: typeof DEVICE_RECORD_ID;
  model: string;
  theme: "light" | "dark" | "system";
  customSubtypes: VaultCustomSubtypes;
  editorDisplay: Record<string, boolean>;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface VaultResumeRecord {
  id: typeof DEVICE_RECORD_ID;
  lastOpenedProjectId: string | null;
  revision: number;
  updatedAt: number;
}

export interface VaultRepositoryEvidenceRecord {
  id: string;
  projectId: string;
  path: string;
  content: string;
  etag: string | null;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface VaultRepositoryProvenanceRecord {
  projectId: string;
  repositoryUrl: string;
  commitSha: string;
  scannedAt: number;
  analysisStatus: "complete" | "partial";
  warning: string | null;
  revision: number;
  updatedAt: number;
}

export type VaultProviderRunKind =
  | "chat"
  | "initialization"
  | "repository-generation"
  | "alternatives"
  | "prd";

export type VaultProviderRunStatus =
  | "draft"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "stale";

/**
 * Durable non-secret provider state. Stream chunks and credentials deliberately
 * have no representation in this record.
 */
export interface VaultProviderRunRecord {
  id: string;
  projectId: string;
  kind: VaultProviderRunKind;
  status: VaultProviderRunStatus;
  prompt: string;
  model: string | null;
  requestId: string | null;
  errorCode: string | null;
  expectedProjectRevision: number;
  expectedVaultGeneration: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface StackHatchVaultDatabase extends DBSchema {
  meta: {
    key: typeof VAULT_META_ID;
    value: VaultMetaRecord;
  };
  projects: {
    key: string;
    value: VaultProjectRecord;
    indexes: {
      "by-updated": [number, number, string];
    };
  };
  messages: {
    key: string;
    value: VaultMessageRecord;
    indexes: {
      "by-project": string;
      "by-project-created": [string, number, string];
    };
  };
  templates: {
    key: string;
    value: VaultTemplateRecord;
    indexes: {
      "by-created": [number, string];
    };
  };
  preferences: {
    key: typeof DEVICE_RECORD_ID;
    value: VaultDevicePreferencesRecord;
  };
  resume: {
    key: typeof DEVICE_RECORD_ID;
    value: VaultResumeRecord;
  };
  repositoryEvidence: {
    key: string;
    value: VaultRepositoryEvidenceRecord;
    indexes: {
      "by-project": string;
      "by-project-path": [string, string];
    };
  };
  repositoryProvenance: {
    key: string;
    value: VaultRepositoryProvenanceRecord;
  };
  providerRuns: {
    key: string;
    value: VaultProviderRunRecord;
    indexes: {
      "by-project": string;
      "by-updated": [number, string];
    };
  };
}
