import { createId } from "@/lib/id";
import type {
  VaultCanvasState,
  VaultCustomSubtypes,
  VaultProjectRecord,
  VaultTemplateRecord,
} from "./schema";
import { createVaultRepository, type VaultRepository } from "./repository";
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
  createProject(draft: WorkspaceProjectDraft): Promise<VaultProjectRecord>;
  recordProjectOpen(projectId: string): Promise<boolean>;
  saveCanvas(
    project: VaultProjectRecord,
    canvasState: VaultCanvasState,
    precondition: WorkspaceProjectPrecondition
  ): Promise<VaultProjectRecord>;
  overwriteCanvas(projectId: string, canvasState: VaultCanvasState): Promise<VaultProjectRecord>;
  deleteProject(project: VaultProjectRecord): Promise<void>;
  listTemplates(): Promise<VaultTemplateRecord[]>;
  saveTemplate(input: {
    name: string;
    description: string | null;
    canvasState: VaultCanvasState;
  }): Promise<VaultTemplateRecord>;
  getCustomSubtypes(): Promise<VaultCustomSubtypes>;
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
    listTemplates() {
      return repository.listTemplates();
    },
    async saveTemplate(input) {
      const timestamp = now();
      return repository.putTemplate(
        {
          id: idFactory(),
          name: input.name,
          description: input.description,
          canvasState: input.canvasState,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        {
          expectedGeneration: await generation(),
          expectedRevision: null,
        }
      );
    },
    async getCustomSubtypes() {
      return (await repository.getDevicePreferences())?.customSubtypes ?? {};
    },
    subscribeInvalidation(listener) {
      return repository.subscribeInvalidation(listener);
    },
  };
}

let browserWorkspaceVault: WorkspaceVault | null = null;

export function getBrowserWorkspaceVault() {
  browserWorkspaceVault ??= createWorkspaceVault(createVaultRepository());
  return browserWorkspaceVault;
}
