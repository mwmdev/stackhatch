import type { VaultProjectRecord } from "@/lib/vault/schema";
import type { WorkspaceVault } from "@/lib/vault/workspace";

export function resolveProjectResume(vault: WorkspaceVault): Promise<VaultProjectRecord | null> {
  return vault.resolveResume();
}

export function recordProjectOpen(vault: WorkspaceVault, projectId: string): Promise<boolean> {
  return vault.recordProjectOpen(projectId);
}
