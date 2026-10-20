import {
  defaultModelSelection,
  formatModelReference,
  parseModelReference,
  type AiModelSelection,
  type AiProviderId,
} from "@/lib/ai/providers";
import { createId } from "@/lib/id";
import type { VaultCanvasState, VaultCustomSubtypes, VaultProjectRecord } from "./schema";
import { getBrowserVaultRepository, type VaultRepository } from "./repository";
import type { VaultInvalidation } from "./coordination";

export interface WorkspaceProjectSnapshot {
  project: VaultProjectRecord;
  generation: string;
}

export interface WorkspaceProjectPrecondition {
  expectedGeneration: string;
  expectedProjectRevision: number;
}

export interface WorkspaceProjectDraft {
  name: string;
  description?: string | null;
  repoUrl?: string | null;
  canvasState?: VaultCanvasState | null;
}

export interface WorkspaceVault {
  resolveResume(): Promise<VaultProjectRecord | null>;
  listProjects(): Promise<VaultProjectRecord[]>;
  getProject(projectId: string): Promise<VaultProjectRecord | null>;
  getProjectSnapshot(projectId: string): Promise<WorkspaceProjectSnapshot | null>;
  getRepositoryProvenance(
    projectId: string
  ): Promise<import("./schema").VaultRepositoryProvenanceRecord | null>;
  createProject(draft: WorkspaceProjectDraft): Promise<VaultProjectRecord>;
  updateProjectDescription(
    project: VaultProjectRecord,
    description: string | null
  ): Promise<VaultProjectRecord>;
  recordProjectOpen(projectId: string): Promise<boolean>;
  saveCanvas(
    project: VaultProjectRecord,
    canvasState: VaultCanvasState,
    precondition: WorkspaceProjectPrecondition
  ): Promise<VaultProjectRecord>;
  overwriteCanvas(projectId: string, canvasState: VaultCanvasState): Promise<VaultProjectRecord>;
  deleteProject(project: VaultProjectRecord): Promise<void>;
  getCustomSubtypes(): Promise<VaultCustomSubtypes>;
  /** The provider and model the device's model preference selects. */
  getAiSelection(): Promise<AiModelSelection>;
  /** Switches to `provider`'s default model; keeps the model when it is already selected. */
  selectAiProvider(provider: AiProviderId): Promise<AiModelSelection>;
  subscribeInvalidation(listener: (invalidation: VaultInvalidation) => void): () => void;
}

interface WorkspaceVaultOptions {
  createId?: () => string;
  now?: () => number;
}

export function createWorkspaceVault(
  repository: VaultRepository,
  options: WorkspaceVaultOptions = {}
): WorkspaceVault {
  const idFactory = options.createId ?? createId;
  const now = options.now ?? Date.now;

  async function generation() {
    return repository.getGeneration();
  }

  return {
    async resolveResume() {
      return repository.resolveLastOpenedProject(await generation());
    },
    listProjects() {
      return repository.listProjects();
    },
    getProject(projectId) {
      return repository.getProject(projectId);
    },
    getProjectSnapshot(projectId) {
      return repository.getProjectSnapshot(projectId);
    },
    async getRepositoryProvenance(projectId) {
      return repository.getRepositoryProvenance(projectId);
    },
    async createProject(draft) {
      const expectedGeneration = await generation();
      const timestamp = now();
      const project = await repository.saveProjectBundle(
        {
          project: {
            id: idFactory(),
            name: draft.name,
            description: draft.description ?? null,
            repoUrl: draft.repoUrl ?? null,
            canvasState: draft.canvasState ?? null,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        },
        { expectedGeneration, expectedProjectRevision: null }
      );
      await repository.recordProjectOpen(project.id, expectedGeneration);
      return project;
    },
    async updateProjectDescription(project, description) {
      return repository.saveProjectBundle(
        {
          project: {
            id: project.id,
            name: project.name,
            description,
            repoUrl: project.repoUrl,
            canvasState: project.canvasState,
            createdAt: project.createdAt,
            updatedAt: now(),
          },
        },
        {
          expectedGeneration: await generation(),
          expectedProjectRevision: project.revision,
        }
      );
    },
    async recordProjectOpen(projectId) {
      return repository.recordProjectOpen(projectId, await generation());
    },
    async saveCanvas(project, canvasState, precondition) {
      return repository.saveProjectBundle(
        {
          project: {
            id: project.id,
            name: project.name,
            description: project.description,
            repoUrl: project.repoUrl,
            canvasState,
            createdAt: project.createdAt,
            updatedAt: now(),
          },
        },
        {
          expectedGeneration: precondition.expectedGeneration,
          expectedProjectRevision: precondition.expectedProjectRevision,
        }
      );
    },
    async overwriteCanvas(projectId, canvasState) {
      const current = await repository.getProject(projectId);
      if (!current) {
        throw new Error("The local project no longer exists");
      }
      return repository.saveProjectBundle(
        {
          project: {
            id: current.id,
            name: current.name,
            description: current.description,
            repoUrl: current.repoUrl,
            canvasState,
            createdAt: current.createdAt,
            updatedAt: now(),
          },
        },
        {
          expectedGeneration: await generation(),
          expectedProjectRevision: current.revision,
        }
      );
    },
    async deleteProject(project) {
      await repository.deleteProject(project.id, {
        expectedGeneration: await generation(),
        expectedProjectRevision: project.revision,
      });
    },
    async getCustomSubtypes() {
      return (await repository.getDevicePreferences())?.customSubtypes ?? {};
    },
    async getAiSelection() {
      return parseModelReference((await repository.getDevicePreferences())?.model);
    },
    async selectAiProvider(provider) {
      const { generation: expectedGeneration, preferences } =
        await repository.getDevicePreferencesSnapshot();
      const current = parseModelReference(preferences?.model);
      if (current.provider === provider) return current;
      const selection = defaultModelSelection(provider);
      await repository.putDevicePreferences(
        {
          model: formatModelReference(selection),
          theme: preferences?.theme ?? "system",
          customSubtypes: preferences?.customSubtypes ?? {},
          editorDisplay: preferences?.editorDisplay ?? {},
        },
        { expectedGeneration, expectedRevision: preferences?.revision ?? null }
      );
      return selection;
    },
    subscribeInvalidation(listener) {
      return repository.subscribeInvalidation(listener);
    },
  };
}

let browserWorkspaceVault: WorkspaceVault | null = null;

export function getBrowserWorkspaceVault() {
  browserWorkspaceVault ??= createWorkspaceVault(getBrowserVaultRepository());
  return browserWorkspaceVault;
}
