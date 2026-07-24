import { describe, expect, it, vi } from "vitest";
import type { WorkspaceVault } from "@/lib/vault/workspace";
import { recordProjectOpen, resolveProjectResume } from "./project-resume";

describe("project resume state", () => {
  it("delegates deterministic resume resolution to the browser vault", async () => {
    const project = { id: "remembered" };
    const vault = {
      resolveResume: vi.fn().mockResolvedValue(project),
    } as unknown as WorkspaceVault;

    await expect(resolveProjectResume(vault)).resolves.toBe(project);
    expect(vault.resolveResume).toHaveBeenCalledOnce();
  });

  it("records project opens in device-local resume state", async () => {
    const vault = {
      recordProjectOpen: vi.fn().mockResolvedValue(true),
    } as unknown as WorkspaceVault;

    await expect(recordProjectOpen(vault, "map-1")).resolves.toBe(true);
    expect(vault.recordProjectOpen).toHaveBeenCalledWith("map-1");
  });
});
