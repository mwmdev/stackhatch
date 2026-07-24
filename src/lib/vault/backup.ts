import { createId } from "@/lib/id";
import { parseGitHubRepoReference } from "@/lib/github-analyzer";
import { validateCustomSubtypes } from "@/lib/custom-subtypes";
import type {
  VaultDevicePreferencesRecord,
  VaultMessageRecord,
  VaultProjectRecord,
  VaultRepositoryEvidenceRecord,
  VaultRepositoryProvenanceRecord,
  VaultResumeRecord,
  VaultTemplateRecord,
} from "./schema";
import { DEVICE_RECORD_ID } from "./schema";
import type {
  VaultBackupProjectBundle,
  VaultProjectBundle,
  VaultRepository,
  VaultRepositorySnapshot,
} from "./repository";

export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_FORMAT = "stackhatch-backup";

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

export type BackupExportKind = "project" | "vault";
export type BackupConflictResolution = "keep-both" | "skip" | "replace";

export type BackupProjectBundle = VaultBackupProjectBundle;

export type StackHatchBackupPayload =
  | {
      kind: "project";
      projects: BackupProjectBundle[];
    }
  | {
      kind: "vault";
      projects: BackupProjectBundle[];
      templates: VaultTemplateRecord[];
      preferences: VaultDevicePreferencesRecord | null;
      resume: VaultResumeRecord | null;
    };

export interface StackHatchBackupEnvelope {
  format: typeof BACKUP_FORMAT;
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  exportKind: BackupExportKind;
  createdAt: string;
  applicationVersion: string;
  payload: string;
  checksum: string;
}

export interface BackupImportPreview {
  kind: BackupExportKind;
  projectCount: number;
  templateCount: number;
  projectNames: string[];
  templateNames: string[];
  conflicts: Array<{ recordType: "project" | "template"; id: string; name: string }>;
  includesDevicePreferences: boolean;
  includesRecentMap: boolean;
  deviceStateConflicts: Array<"preferences" | "recent-map">;
  defaultConflictResolution: "keep-both";
}

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupValidationError";
  }
}

interface BackupExportOptions {
  now?: () => Date;
  applicationVersion?: string;
}

interface BackupImportOptions {
  maxBytes?: number;
  idFactory?: () => string;
  beforeCommit?: () => void | Promise<void>;
}

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const NODE_CATEGORIES = new Set([
  "client",
  "api",
  "services",
  "data",
  "infrastructure",
  "external",
  "note",
]);
const CONNECTION_TYPES = new Set(["http", "websocket", "grpc", "tcp", "pub-sub", "file-io"]);
const NOTE_COLORS = new Set(["yellow", "mint", "peach", "sky", "lilac"]);
const THEMES = new Set(["light", "dark", "system"]);

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BackupValidationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string) {
  if (!Array.isArray(value)) throw new BackupValidationError(`${label} must be an array`);
  return value;
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = []
) {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new BackupValidationError(`Unknown backup field: ${key}`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new BackupValidationError(`Missing backup field: ${key}`);
  }
}

function string(value: unknown, label: string, maximum: number = BACKUP_LIMITS.maxStringLength) {
  if (typeof value !== "string" || value.length > maximum) {
    throw new BackupValidationError(`${label} must be a bounded string`);
  }
  return value;
}

function nullableString(value: unknown, label: string) {
  return value === null ? null : string(value, label);
}

function number(value: unknown, label: string, minimum = 0) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new BackupValidationError(`${label} must be a finite number`);
  }
  return value;
}

function revision(value: unknown, label: string) {
  const parsed = number(value, label, 1);
  if (!Number.isInteger(parsed)) throw new BackupValidationError(`${label} must be an integer`);
  return parsed;
}

function boolean(value: unknown, label: string) {
  if (typeof value !== "boolean") throw new BackupValidationError(`${label} must be boolean`);
  return value;
}

function id(value: unknown, label: string) {
  const parsed = string(value, label, 128);
  if (!/^[A-Za-z0-9_-]+$/.test(parsed)) {
    throw new BackupValidationError(`${label} contains unsupported characters`);
  }
  return parsed;
}

function inspectResourceLimits(value: unknown) {
  let records = 0;
  const visit = (candidate: unknown, depth: number) => {
    if (depth > BACKUP_LIMITS.maxDepth) {
      throw new BackupValidationError("Backup nesting is too deep");
    }
    if (typeof candidate === "string" && candidate.length > BACKUP_LIMITS.maxStringLength) {
      throw new BackupValidationError("Backup contains an oversized string");
    }
    if (!candidate || typeof candidate !== "object") return;
    records += 1;
    if (records > BACKUP_LIMITS.maxRecords) {
      throw new BackupValidationError("Backup contains too many records");
    }
    if (Array.isArray(candidate)) {
      if (candidate.length > BACKUP_LIMITS.maxArrayLength) {
        throw new BackupValidationError("Backup contains an oversized array");
      }
      for (const item of candidate) visit(item, depth + 1);
      return;
    }
    for (const [key, item] of Object.entries(candidate)) {
      if (FORBIDDEN_KEYS.has(key)) {
        throw new BackupValidationError(`Backup contains a forbidden field: ${key}`);
      }
      visit(item, depth + 1);
    }
  };
  visit(value, 0);
}

function validateRepositoryUrl(value: unknown, label: string) {
  if (value === null) return null;
  const url = string(value, label, 300);
  const parsed = parseGitHubRepoReference(url);
  if (!parsed || parsed.normalizedUrl !== url) {
    throw new BackupValidationError(`${label} must be a canonical public GitHub URL`);
  }
  return url;
}

function validateCanvas(value: unknown) {
  const canvas = object(value, "canvas state");
  exactKeys(canvas, ["nodes", "edges"], ["positions", "alternatives"]);
  const nodes = array(canvas.nodes, "canvas nodes");
  const edges = array(canvas.edges, "canvas edges");
  if (nodes.length > 1_000 || edges.length > 2_000) {
    throw new BackupValidationError("Canvas contains too many records");
  }
  const nodeIds = new Set<string>();
  const validatedNodes = nodes.map((item, index) => {
    const node = object(item, `node ${index + 1}`);
    exactKeys(
      node,
      ["id", "category", "subtype", "name", "technology", "description", "reasoning", "locked"],
      ["noteColor"]
    );
    const nodeId = id(node.id, "node id");
    if (nodeIds.has(nodeId)) throw new BackupValidationError("Canvas node IDs must be unique");
    nodeIds.add(nodeId);
    const category = string(node.category, "node category", 32);
    if (!NODE_CATEGORIES.has(category)) throw new BackupValidationError("Invalid node category");
    const noteColor =
      node.noteColor === undefined ? undefined : string(node.noteColor, "note color", 16);
    if (noteColor && !NOTE_COLORS.has(noteColor)) {
      throw new BackupValidationError("Invalid note color");
    }
    return {
      id: nodeId,
      category,
      subtype: string(node.subtype, "node subtype", 80),
      name: string(node.name, "node name", 200),
      technology: string(node.technology, "node technology", 200),
      description: string(node.description, "node description"),
      reasoning: string(node.reasoning, "node reasoning"),
      locked: boolean(node.locked, "node locked"),
      ...(noteColor ? { noteColor } : {}),
    };
  });
  const edgeIds = new Set<string>();
  const validatedEdges = edges.map((item, index) => {
    const edge = object(item, `edge ${index + 1}`);
    exactKeys(edge, ["id", "source", "target", "connectionType", "label"]);
    const edgeId = id(edge.id, "edge id");
    if (edgeIds.has(edgeId)) throw new BackupValidationError("Canvas edge IDs must be unique");
    edgeIds.add(edgeId);
    const source = id(edge.source, "edge source");
    const target = id(edge.target, "edge target");
    if (!nodeIds.has(source) || !nodeIds.has(target)) {
      throw new BackupValidationError("Canvas edge references an unknown node");
    }
    const connectionType = string(edge.connectionType, "connection type", 32);
    if (!CONNECTION_TYPES.has(connectionType)) {
      throw new BackupValidationError("Invalid connection type");
    }
    return {
      id: edgeId,
      source,
      target,
      connectionType,
      label: string(edge.label, "edge label", 200),
    };
  });

  let positions: Record<string, { x: number; y: number }> | undefined;
  if (canvas.positions !== undefined) {
    positions = {};
    for (const [nodeId, rawPosition] of Object.entries(object(canvas.positions, "positions"))) {
      if (!nodeIds.has(nodeId)) throw new BackupValidationError("Position references unknown node");
      const position = object(rawPosition, "node position");
      exactKeys(position, ["x", "y"]);
      positions[nodeId] = {
        x: number(position.x, "position x", Number.MIN_SAFE_INTEGER),
        y: number(position.y, "position y", Number.MIN_SAFE_INTEGER),
      };
    }
  }

  let alternatives: Record<string, never[]> | undefined;
  if (canvas.alternatives !== undefined) {
    alternatives = {};
    for (const [nodeId, rawAlternatives] of Object.entries(
      object(canvas.alternatives, "alternatives")
    )) {
      if (!nodeIds.has(nodeId)) {
        throw new BackupValidationError("Alternatives reference an unknown node");
      }
      alternatives[nodeId] = array(rawAlternatives, "node alternatives").map((item) => {
        const alternative = object(item, "alternative");
        exactKeys(alternative, [
          "name",
          "technology",
          "description",
          "reasoning",
          "category",
          "subtype",
        ]);
        const category = string(alternative.category, "alternative category", 32);
        if (!NODE_CATEGORIES.has(category)) {
          throw new BackupValidationError("Invalid alternative category");
        }
        return {
          name: string(alternative.name, "alternative name", 200),
          technology: string(alternative.technology, "alternative technology", 200),
          description: string(alternative.description, "alternative description"),
          reasoning: string(alternative.reasoning, "alternative reasoning"),
          category,
          subtype: string(alternative.subtype, "alternative subtype", 80),
        };
      }) as never[];
    }
  }
  return {
    nodes: validatedNodes,
    edges: validatedEdges,
    ...(positions ? { positions } : {}),
    ...(alternatives ? { alternatives } : {}),
  };
}

function validateProject(value: unknown): VaultProjectRecord {
  const project = object(value, "project");
  exactKeys(project, [
    "id",
    "name",
    "description",
    "repoUrl",
    "canvasState",
    "revision",
    "createdAt",
    "updatedAt",
  ]);
  return {
    id: id(project.id, "project id"),
    name: string(project.name, "project name", 200),
    description: nullableString(project.description, "project description"),
    repoUrl: validateRepositoryUrl(project.repoUrl, "project repository URL"),
    canvasState: project.canvasState === null ? null : validateCanvas(project.canvasState),
    revision: revision(project.revision, "project revision"),
    createdAt: number(project.createdAt, "project created time"),
    updatedAt: number(project.updatedAt, "project updated time"),
  } as VaultProjectRecord;
}

function validateMessage(value: unknown, projectId: string): VaultMessageRecord {
  const message = object(value, "message");
  exactKeys(message, ["id", "projectId", "role", "content", "revision", "createdAt"]);
  if (message.projectId !== projectId) {
    throw new BackupValidationError("Message references an unknown project");
  }
  if (message.role !== "user" && message.role !== "assistant") {
    throw new BackupValidationError("Invalid message role");
  }
  return {
    id: id(message.id, "message id"),
    projectId,
    role: message.role,
    content: string(message.content, "message content"),
    revision: revision(message.revision, "message revision"),
    createdAt: number(message.createdAt, "message created time"),
  };
}

function validateEvidence(value: unknown, projectId: string): VaultRepositoryEvidenceRecord {
  const evidence = object(value, "repository evidence");
  exactKeys(evidence, [
    "id",
    "projectId",
    "path",
    "content",
    "etag",
    "revision",
    "createdAt",
    "updatedAt",
  ]);
  if (evidence.projectId !== projectId) {
    throw new BackupValidationError("Repository evidence references an unknown project");
  }
  return {
    id: id(evidence.id, "evidence id"),
    projectId,
    path: string(evidence.path, "evidence path", 1_000),
    content: string(evidence.content, "evidence content", BACKUP_LIMITS.maxEvidenceCharacters),
    etag: nullableString(evidence.etag, "evidence ETag"),
    revision: revision(evidence.revision, "evidence revision"),
    createdAt: number(evidence.createdAt, "evidence created time"),
    updatedAt: number(evidence.updatedAt, "evidence updated time"),
  };
}

function validateProvenance(
  value: unknown,
  projectId: string
): VaultRepositoryProvenanceRecord | null {
  if (value === null) return null;
  const provenance = object(value, "repository provenance");
  exactKeys(provenance, [
    "projectId",
    "repositoryUrl",
    "commitSha",
    "scannedAt",
    "analysisStatus",
    "warning",
    "revision",
    "updatedAt",
  ]);
  if (provenance.projectId !== projectId) {
    throw new BackupValidationError("Repository provenance references an unknown project");
  }
  if (provenance.analysisStatus !== "complete" && provenance.analysisStatus !== "partial") {
    throw new BackupValidationError("Invalid repository analysis status");
  }
  return {
    projectId,
    repositoryUrl: validateRepositoryUrl(provenance.repositoryUrl, "provenance repository URL")!,
    commitSha: string(provenance.commitSha, "commit SHA", 200),
    scannedAt: number(provenance.scannedAt, "scan time"),
    analysisStatus: provenance.analysisStatus,
    warning: nullableString(provenance.warning, "provenance warning"),
    revision: revision(provenance.revision, "provenance revision"),
    updatedAt: number(provenance.updatedAt, "provenance updated time"),
  };
}

function validateProjectBundle(value: unknown): BackupProjectBundle {
  const bundle = object(value, "project bundle");
  exactKeys(bundle, ["project", "messages", "evidence", "provenance"]);
  const project = validateProject(bundle.project);
  const messages = array(bundle.messages, "messages").map((message) =>
    validateMessage(message, project.id)
  );
  const evidence = array(bundle.evidence, "repository evidence").map((record) =>
    validateEvidence(record, project.id)
  );
  if (
    messages.length > BACKUP_LIMITS.maxMessagesPerProject ||
    evidence.length > BACKUP_LIMITS.maxEvidencePerProject
  ) {
    throw new BackupValidationError("Project contains too many related records");
  }
  const messageIds = new Set(messages.map((message) => message.id));
  const evidenceIds = new Set(evidence.map((record) => record.id));
  if (messageIds.size !== messages.length || evidenceIds.size !== evidence.length) {
    throw new BackupValidationError("Project child record IDs must be unique");
  }
  return {
    project,
    messages,
    evidence,
    provenance: validateProvenance(bundle.provenance, project.id),
  };
}

function validateTemplate(value: unknown): VaultTemplateRecord {
  const template = object(value, "template");
  exactKeys(template, [
    "id",
    "name",
    "description",
    "canvasState",
    "revision",
    "createdAt",
    "updatedAt",
  ]);
  return {
    id: id(template.id, "template id"),
    name: string(template.name, "template name", 200),
    description: nullableString(template.description, "template description"),
    canvasState: validateCanvas(template.canvasState),
    revision: revision(template.revision, "template revision"),
    createdAt: number(template.createdAt, "template created time"),
    updatedAt: number(template.updatedAt, "template updated time"),
  } as VaultTemplateRecord;
}

function validatePreferences(value: unknown): VaultDevicePreferencesRecord | null {
  if (value === null) return null;
  const preferences = object(value, "preferences");
  exactKeys(preferences, [
    "id",
    "model",
    "theme",
    "customSubtypes",
    "editorDisplay",
    "revision",
    "createdAt",
    "updatedAt",
  ]);
  if (preferences.id !== DEVICE_RECORD_ID) {
    throw new BackupValidationError("Invalid preferences record ID");
  }
  const theme = string(preferences.theme, "theme", 16);
  if (!THEMES.has(theme)) throw new BackupValidationError("Invalid theme");
  const editorDisplay = object(preferences.editorDisplay, "editor display preferences");
  for (const value of Object.values(editorDisplay)) boolean(value, "editor display preference");
  let customSubtypes;
  try {
    customSubtypes = validateCustomSubtypes(preferences.customSubtypes);
  } catch {
    throw new BackupValidationError("Invalid custom subtype preferences");
  }
  return {
    id: DEVICE_RECORD_ID,
    model: string(preferences.model, "model", 200),
    theme,
    customSubtypes,
    editorDisplay: editorDisplay as Record<string, boolean>,
    revision: revision(preferences.revision, "preferences revision"),
    createdAt: number(preferences.createdAt, "preferences created time"),
    updatedAt: number(preferences.updatedAt, "preferences updated time"),
  } as VaultDevicePreferencesRecord;
}

function validateResume(value: unknown, projectIds: Set<string>): VaultResumeRecord | null {
  if (value === null) return null;
  const resume = object(value, "resume");
  exactKeys(resume, ["id", "lastOpenedProjectId", "revision", "updatedAt"]);
  if (resume.id !== DEVICE_RECORD_ID) throw new BackupValidationError("Invalid resume record ID");
  const projectId =
    resume.lastOpenedProjectId === null
      ? null
      : id(resume.lastOpenedProjectId, "resume project ID");
  if (projectId && !projectIds.has(projectId)) {
    throw new BackupValidationError("Resume state references an unknown project");
  }
  return {
    id: DEVICE_RECORD_ID,
    lastOpenedProjectId: projectId,
    revision: revision(resume.revision, "resume revision"),
    updatedAt: number(resume.updatedAt, "resume updated time"),
  };
}

function validatePayload(value: unknown, expectedKind: BackupExportKind): StackHatchBackupPayload {
  inspectResourceLimits(value);
  const payload = object(value, "backup payload");
  if (payload.kind !== expectedKind) {
    throw new BackupValidationError("Backup kind does not match its envelope");
  }
  if (expectedKind === "project") {
    exactKeys(payload, ["kind", "projects"]);
  } else {
    exactKeys(payload, ["kind", "projects", "templates", "preferences", "resume"]);
  }
  const projects = array(payload.projects, "projects").map(validateProjectBundle);
  if (projects.length > BACKUP_LIMITS.maxProjects) {
    throw new BackupValidationError("Backup contains too many projects");
  }
  const projectIds = new Set(projects.map((bundle) => bundle.project.id));
  if (projectIds.size !== projects.length) {
    throw new BackupValidationError("Project IDs must be unique");
  }
  const childIds = new Set<string>();
  for (const bundle of projects) {
    for (const record of [...bundle.messages, ...bundle.evidence]) {
      if (childIds.has(record.id)) {
        throw new BackupValidationError("Child record IDs must be unique across the backup");
      }
      childIds.add(record.id);
    }
  }
  if (expectedKind === "project") return { kind: "project", projects };

  const templates = array(payload.templates, "templates").map(validateTemplate);
  if (templates.length > BACKUP_LIMITS.maxTemplates) {
    throw new BackupValidationError("Backup contains too many templates");
  }
  if (new Set(templates.map((template) => template.id)).size !== templates.length) {
    throw new BackupValidationError("Template IDs must be unique");
  }
  return {
    kind: "vault",
    projects,
    templates,
    preferences: validatePreferences(payload.preferences),
    resume: validateResume(payload.resume, projectIds),
  };
}

async function sha256Bytes(value: Uint8Array<ArrayBuffer>) {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function encode(value: string) {
  return new TextEncoder().encode(value) as Uint8Array<ArrayBuffer>;
}

function sha256(value: string) {
  return sha256Bytes(encode(value));
}

async function serializeBackup(payload: StackHatchBackupPayload, options: BackupExportOptions) {
  const serializedPayload = JSON.stringify(payload);
  const payloadBytes = encode(serializedPayload);
  if (payloadBytes.byteLength > BACKUP_LIMITS.maxBytes) {
    throw new BackupValidationError("Backup payload is too large to export");
  }
  const envelope: StackHatchBackupEnvelope = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportKind: payload.kind,
    createdAt: (options.now ?? (() => new Date()))().toISOString(),
    applicationVersion: options.applicationVersion ?? "local-first",
    payload: serializedPayload,
    checksum: await sha256Bytes(payloadBytes),
  };
  const serializedEnvelope = JSON.stringify(envelope, null, 2);
  if (encode(serializedEnvelope).byteLength > BACKUP_LIMITS.maxBytes) {
    throw new BackupValidationError("Backup file is too large to export");
  }
  return serializedEnvelope;
}

export async function exportProjectBackup(
  repository: VaultRepository,
  projectId: string,
  options: BackupExportOptions = {}
) {
  const bundle = await repository.getProjectBackupBundle(projectId);
  if (!bundle) throw new BackupValidationError("The local project no longer exists");
  return serializeBackup({ kind: "project", projects: [bundle] }, options);
}

export async function exportVaultBackup(
  repository: VaultRepository,
  options: BackupExportOptions = {}
) {
  const snapshot = await repository.readBackupSnapshot();
  return serializeBackup(
    {
      kind: "vault",
      projects: snapshot.projects,
      templates: snapshot.templates,
      preferences: snapshot.preferences,
      resume: snapshot.resume,
    },
    options
  );
}

async function parseEnvelope(text: string, maxBytes: number) {
  if (text.length > maxBytes || encode(text).byteLength > maxBytes) {
    throw new BackupValidationError("Backup file is too large");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupValidationError("Backup is not valid JSON");
  }
  inspectResourceLimits(raw);
  const value = object(raw, "backup envelope");
  exactKeys(value, [
    "format",
    "formatVersion",
    "exportKind",
    "createdAt",
    "applicationVersion",
    "payload",
    "checksum",
  ]);
  if (value.format !== BACKUP_FORMAT) throw new BackupValidationError("Unknown backup format");
  if (value.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new BackupValidationError("Unsupported backup format version");
  }
  if (value.exportKind !== "project" && value.exportKind !== "vault") {
    throw new BackupValidationError("Invalid backup export kind");
  }
  const createdAt = string(value.createdAt, "backup creation time", 64);
  if (!Number.isFinite(Date.parse(createdAt))) {
    throw new BackupValidationError("Invalid backup creation time");
  }
  string(value.applicationVersion, "application version", 100);
  const payload = string(value.payload, "serialized backup payload", maxBytes);
  const checksum = string(value.checksum, "backup checksum", 64);
  if (!/^[a-f0-9]{64}$/.test(checksum) || (await sha256(payload)) !== checksum) {
    throw new BackupValidationError("Backup checksum does not match its payload");
  }
  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(payload);
  } catch {
    throw new BackupValidationError("Backup payload is not valid JSON");
  }
  return validatePayload(parsedPayload, value.exportKind);
}

function cloneBundle(bundle: BackupProjectBundle, projectId: string): VaultProjectBundle {
  return {
    project: { ...bundle.project, id: projectId, revision: 1 },
    messages: bundle.messages.map((message, index) => ({
      ...message,
      id: `${projectId}-message-${index + 1}`,
      projectId,
      revision: 1,
    })),
    evidence: bundle.evidence.map((record, index) => ({
      ...record,
      id: `${projectId}-evidence-${index + 1}`,
      projectId,
      revision: 1,
    })),
    provenance: bundle.provenance ? { ...bundle.provenance, projectId, revision: 1 } : null,
    providerRuns: [],
  };
}

function importedBundle(bundle: BackupProjectBundle): VaultProjectBundle {
  return { ...bundle, providerRuns: [] };
}

function uniqueId(candidate: string, used: Set<string>) {
  let value = candidate;
  let suffix = 2;
  while (used.has(value)) value = `${candidate}-${suffix++}`;
  used.add(value);
  return value;
}

function mergePayload(
  current: VaultRepositorySnapshot,
  payload: StackHatchBackupPayload,
  resolution: BackupConflictResolution,
  idFactory: () => string,
  restoreDeviceState: boolean
): Omit<VaultRepositorySnapshot, "generation"> {
  const projects = new Map(current.projects.map((bundle) => [bundle.project.id, bundle]));
  const importedProjectIds = new Map<string, string>();
  const usedProjectIds = new Set(projects.keys());

  for (const bundle of payload.projects) {
    const existing = projects.has(bundle.project.id);
    if (existing && resolution === "skip") {
      importedProjectIds.set(bundle.project.id, bundle.project.id);
      continue;
    }
    if (existing && resolution === "keep-both") {
      const projectId = uniqueId(idFactory(), usedProjectIds);
      projects.set(projectId, cloneBundle(bundle, projectId));
      importedProjectIds.set(bundle.project.id, projectId);
      continue;
    }
    projects.set(bundle.project.id, importedBundle(bundle));
    usedProjectIds.add(bundle.project.id);
    importedProjectIds.set(bundle.project.id, bundle.project.id);
  }

  const templates = new Map(current.templates.map((template) => [template.id, template]));
  if (payload.kind === "vault") {
    const usedTemplateIds = new Set(templates.keys());
    for (const template of payload.templates) {
      const existing = templates.has(template.id);
      if (existing && resolution === "skip") continue;
      if (existing && resolution === "keep-both") {
        const templateId = uniqueId(idFactory(), usedTemplateIds);
        templates.set(templateId, { ...template, id: templateId, revision: 1 });
      } else {
        templates.set(template.id, template);
        usedTemplateIds.add(template.id);
      }
    }
  }

  const importedPreferences = payload.kind === "vault" ? payload.preferences : null;
  const importedResume = payload.kind === "vault" ? payload.resume : null;
  const resume =
    importedResume && restoreDeviceState
      ? {
          ...importedResume,
          lastOpenedProjectId: importedResume.lastOpenedProjectId
            ? (importedProjectIds.get(importedResume.lastOpenedProjectId) ?? null)
            : null,
        }
      : current.resume;

  return {
    projects: [...projects.values()],
    templates: [...templates.values()],
    preferences:
      importedPreferences && restoreDeviceState ? importedPreferences : current.preferences,
    resume,
  };
}

export async function prepareBackupImport(
  repository: VaultRepository,
  text: string,
  options: BackupImportOptions = {}
) {
  const payload = await parseEnvelope(text, options.maxBytes ?? BACKUP_LIMITS.maxBytes);
  const current = await repository.readVaultSnapshot();
  const projectIds = new Set(current.projects.map((bundle) => bundle.project.id));
  const templateIds = new Set(current.templates.map((template) => template.id));
  const conflicts: BackupImportPreview["conflicts"] = [
    ...payload.projects
      .filter((bundle) => projectIds.has(bundle.project.id))
      .map((bundle) => ({
        recordType: "project" as const,
        id: bundle.project.id,
        name: bundle.project.name,
      })),
    ...(payload.kind === "vault"
      ? payload.templates
          .filter((template) => templateIds.has(template.id))
          .map((template) => ({
            recordType: "template" as const,
            id: template.id,
            name: template.name,
          }))
      : []),
  ];
  const preview: BackupImportPreview = {
    kind: payload.kind,
    projectCount: payload.projects.length,
    templateCount: payload.kind === "vault" ? payload.templates.length : 0,
    projectNames: payload.projects.map((bundle) => bundle.project.name),
    templateNames:
      payload.kind === "vault" ? payload.templates.map((template) => template.name) : [],
    conflicts,
    includesDevicePreferences: payload.kind === "vault" && payload.preferences !== null,
    includesRecentMap: payload.kind === "vault" && payload.resume !== null,
    deviceStateConflicts:
      payload.kind === "vault"
        ? [
            ...(payload.preferences && current.preferences
              ? (["preferences"] as const)
              : ([] as const)),
            ...(payload.resume && current.resume ? (["recent-map"] as const) : ([] as const)),
          ]
        : [],
    defaultConflictResolution: "keep-both",
  };
  let committed = false;
  return {
    preview,
    async commit(
      resolution: BackupConflictResolution = "keep-both",
      commitOptions: { restoreDeviceState?: boolean } = {}
    ) {
      if (committed) throw new BackupValidationError("This backup import was already committed");
      const snapshot = mergePayload(
        current,
        payload,
        resolution,
        options.idFactory ?? createId,
        commitOptions.restoreDeviceState ?? preview.deviceStateConflicts.length === 0
      );
      const generation = await repository.replaceVaultSnapshot(snapshot, current, {
        beforeCommit: options.beforeCommit,
      });
      committed = true;
      return generation;
    },
  };
}
